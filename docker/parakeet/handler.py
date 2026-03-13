"""
RunPod Serverless Handler for Parakeet TDT v3 + pyannote Diarization
Version: 1.0

Drop-in replacement for the WhisperX handler. Produces IDENTICAL output format
so the n8n pipeline (Format Transcript, CPA Pre-Screen, etc.) works unchanged.

Architecture difference:
  - WhisperX: Whisper encoder-decoder (autoregressive LM) + wav2vec2 forced alignment
  - Parakeet: FastConformer CTC/TDT (non-autoregressive) — native word timestamps

Key benefit: CTC architecture produces phonetically-faithful errors instead of
LM-hallucinated substitutions. "America's Health" -> "Amerikas Health" (predictable)
instead of -> "America's Alta" / "American Hemp" (random LM hallucination).

Input/Output contract: Identical to WhisperX handler v2.0
  Input:
    - audio_url, language, diarize, split_channels, vad_onset, vad_offset
    - min_speakers, max_speakers, max_duration, metadata
  Output:
    - Stereo: { channels: { agent: { segments }, customer: { segments } }, ... }
    - Mono: { segments: [...], ... }
"""

import os
import time
import tempfile
import traceback
import subprocess
import urllib.request
import json

import torch
import numpy as np
import nemo.collections.asr as nemo_asr
import runpod

# ─── Config ──────────────────────────────────────────────────────────

MODEL_NAME = os.environ.get("PARAKEET_MODEL", "nvidia/parakeet-tdt-0.6b-v2")
HF_TOKEN = os.environ.get("HF_TOKEN", "")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
MAX_AUDIO_DURATION = 300  # 5 minutes default (trimmed, not rejected)
ABSOLUTE_MAX_DURATION = 3600  # 1 hour hard reject
SAMPLE_RATE = 16000

# ─── Model cache ─────────────────────────────────────────────────────

_asr_model = None
_diarize_model = None


def get_asr_model():
    global _asr_model
    if _asr_model is None:
        print(f"[parakeet] Loading {MODEL_NAME} on {DEVICE}...")
        _asr_model = nemo_asr.models.ASRModel.from_pretrained(MODEL_NAME)
        _asr_model = _asr_model.to(DEVICE)
        _asr_model.eval()
        print("[parakeet] Model loaded")
    return _asr_model


def get_diarize_model():
    global _diarize_model
    if _diarize_model is None:
        if not HF_TOKEN:
            raise ValueError("HF_TOKEN required for speaker diarization")
        from pyannote.audio import Pipeline
        _diarize_model = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=HF_TOKEN,
        )
        if DEVICE == "cuda":
            _diarize_model = _diarize_model.to(torch.device("cuda"))
        print("[parakeet] Diarization model loaded")
    return _diarize_model


# ─── Audio utilities ─────────────────────────────────────────────────


def get_channel_count(audio_path):
    """Use ffprobe to detect the number of audio channels."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-select_streams", "a:0",
                "-show_entries", "stream=channels",
                "-of", "json",
                audio_path,
            ],
            capture_output=True, text=True, timeout=10,
        )
        info = json.loads(result.stdout)
        return int(info["streams"][0]["channels"])
    except Exception as e:
        print(f"[parakeet] ffprobe channel detection failed: {e}")
        return None


def split_stereo(audio_path, tmp_dir):
    """
    Split a stereo WAV into two mono channels using ffmpeg.
    Ch0 (Left) = Agent, Ch1 (Right) = Customer.
    Returns (agent_path, customer_path).
    """
    agent_path = os.path.join(tmp_dir, "ch0_agent.wav")
    customer_path = os.path.join(tmp_dir, "ch1_customer.wav")

    subprocess.run(
        [
            "ffmpeg", "-y", "-i", audio_path,
            "-af", "pan=mono|c0=c0",
            "-ar", str(SAMPLE_RATE),
            "-acodec", "pcm_s16le",
            agent_path,
        ],
        capture_output=True, check=True, timeout=60,
    )

    subprocess.run(
        [
            "ffmpeg", "-y", "-i", audio_path,
            "-af", "pan=mono|c0=c1",
            "-ar", str(SAMPLE_RATE),
            "-acodec", "pcm_s16le",
            customer_path,
        ],
        capture_output=True, check=True, timeout=60,
    )

    return agent_path, customer_path


def get_audio_duration(audio_path):
    """Get audio duration in seconds using ffprobe."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "json",
                audio_path,
            ],
            capture_output=True, text=True, timeout=10,
        )
        info = json.loads(result.stdout)
        return float(info["format"]["duration"])
    except Exception:
        return 0


def resample_audio(audio_path, tmp_dir):
    """Resample audio to 16kHz mono WAV for Parakeet."""
    out_path = os.path.join(tmp_dir, "resampled.wav")
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", audio_path,
            "-ac", "1", "-ar", str(SAMPLE_RATE),
            "-acodec", "pcm_s16le",
            out_path,
        ],
        capture_output=True, check=True, timeout=60,
    )
    return out_path


def diagnose_audio(audio_path):
    """Get audio properties for debugging empty transcriptions."""
    diag = {}
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", audio_path],
            capture_output=True, text=True, timeout=10,
        )
        info = json.loads(result.stdout)
        fmt = info.get("format", {})
        stream = info.get("streams", [{}])[0]
        diag["format"] = fmt.get("format_name")
        diag["duration"] = fmt.get("duration")
        diag["size_bytes"] = fmt.get("size")
        diag["codec"] = stream.get("codec_name")
        diag["sample_rate"] = stream.get("sample_rate")
        diag["channels"] = stream.get("channels")
        diag["bits_per_sample"] = stream.get("bits_per_sample")
    except Exception as e:
        diag["ffprobe_error"] = str(e)

    # Check if audio has actual content (not silence)
    try:
        import soundfile as sf
        data, sr = sf.read(audio_path, dtype='float32')
        diag["sf_shape"] = list(data.shape)
        diag["sf_sample_rate"] = sr
        diag["sf_max_amplitude"] = float(abs(data).max())
        diag["sf_mean_amplitude"] = float(abs(data).mean())
        diag["sf_is_silence"] = float(abs(data).max()) < 0.001
    except Exception as e:
        diag["sf_error"] = str(e)

    return diag


def diagnose_model(model):
    """Get model state for debugging."""
    diag = {}
    try:
        diag["model_class"] = type(model).__name__
        diag["device"] = str(next(model.parameters()).device)
        diag["num_params"] = sum(p.numel() for p in model.parameters())
        diag["is_training"] = model.training
    except Exception as e:
        diag["error"] = str(e)
    return diag


# ─── Transcription ───────────────────────────────────────────────────


def _extract_hypothesis(output):
    """Extract the best Hypothesis from NeMo transcribe() output."""
    if not output:
        return None
    # TDT with timestamps/return_hypotheses returns tuple: (best_hyps, all_hyps)
    if isinstance(output, tuple) and len(output) >= 1:
        first = output[0]
        return first[0] if isinstance(first, list) and len(first) > 0 else first
    elif isinstance(output, list) and len(output) > 0:
        return output[0]
    return None


def _words_to_segments(words):
    """Group word-level timestamps into segments (split on pauses > 0.5s)."""
    segments = []
    current_words = []
    seg_start = None

    for i, w in enumerate(words):
        word_text = w.get('word', '') if isinstance(w, dict) else str(w)
        # Use 'start'/'end' (seconds), NOT 'start_offset'/'end_offset' (frame indices)
        word_start = w.get('start', 0) if isinstance(w, dict) else 0
        word_end = w.get('end', 0) if isinstance(w, dict) else 0

        if seg_start is None:
            seg_start = word_start

        current_words.append({
            "word": word_text,
            "start": round(word_start, 3),
            "end": round(word_end, 3),
            "score": 0.95,
        })

        is_last = (i == len(words) - 1)
        next_start = words[i + 1].get('start', 0) if not is_last and isinstance(words[i + 1], dict) else word_end

        if is_last or (next_start - word_end) > 0.5:
            seg_text = " ".join(cw["word"] for cw in current_words).strip()
            if seg_text:
                segments.append({
                    "start": round(seg_start, 3),
                    "end": round(word_end, 3),
                    "text": seg_text,
                    "words": current_words,
                })
            current_words = []
            seg_start = None

    return segments


def transcribe_single(audio_path, model):
    """
    Transcribe a single audio file with Parakeet TDT.
    Returns (segments, duration) in WhisperX-compatible format.

    Parakeet TDT natively produces word-level timestamps via CTC/TDT.
    No forced alignment step needed (unlike WhisperX which needs wav2vec2).
    """
    duration = get_audio_duration(audio_path)

    # Strategy: try multiple transcribe modes in order of richness.
    # timestamps=True > return_hypotheses=True > plain (strings only)
    # If a mode produces empty text, try the next one.

    modes = [
        ("timestamps=True", {"timestamps": True}),
        ("return_hypotheses=True", {"return_hypotheses": True}),
        ("plain", {}),
    ]

    for mode_name, kwargs in modes:
        try:
            print(f"[parakeet] trying {mode_name} on {os.path.basename(audio_path)}")
            output = model.transcribe([audio_path], **kwargs)
        except Exception as e:
            print(f"[parakeet] {mode_name} raised: {e}")
            continue

        result = _extract_hypothesis(output)
        if result is None:
            print(f"[parakeet] {mode_name}: no result extracted")
            continue

        # Plain string result
        if isinstance(result, str):
            text = result.strip()
            if text:
                print(f"[parakeet] {mode_name}: got text ({len(text)} chars)")
                return [{"start": 0, "end": round(duration, 3), "text": text}], duration
            print(f"[parakeet] {mode_name}: empty string")
            continue

        # Hypothesis object — try word timestamps first
        timestamp = getattr(result, 'timestamp', None)
        if timestamp and isinstance(timestamp, dict):
            words = timestamp.get('word', [])
            if words:
                segments = _words_to_segments(words)
                print(f"[parakeet] {mode_name}: {len(segments)} segments ({len(words)} words)")
                return segments, duration

        # Hypothesis with .text
        text = getattr(result, 'text', '')
        if text and text.strip():
            print(f"[parakeet] {mode_name}: got text ({len(text.strip())} chars, no timestamps)")
            return [{"start": 0, "end": round(duration, 3), "text": text.strip()}], duration

        print(f"[parakeet] {mode_name}: empty hypothesis (score={getattr(result, 'score', '?')})")
        # Continue to next mode

    print(f"[parakeet] all modes failed for {os.path.basename(audio_path)}")
    return [], duration


def assign_speakers_to_segments(segments, diarization_result):
    """
    Assign speaker labels from pyannote diarization to transcription segments.
    Uses majority vote: whichever speaker occupies the most time in a segment's
    time window gets assigned to that segment.

    This matches WhisperX's whisperx.assign_word_speakers() behavior.
    """
    for seg in segments:
        seg_start = seg["start"]
        seg_end = seg["end"]
        speaker_times = {}

        for turn, _, speaker in diarization_result.itertracks(yield_label=True):
            overlap_start = max(seg_start, turn.start)
            overlap_end = min(seg_end, turn.end)
            overlap = max(0, overlap_end - overlap_start)

            if overlap > 0:
                speaker_times[speaker] = speaker_times.get(speaker, 0) + overlap

        if speaker_times:
            seg["speaker"] = max(speaker_times, key=speaker_times.get)

    return segments


# ─── Handler ─────────────────────────────────────────────────────────


def handler(event):
    """RunPod serverless handler. Drop-in compatible with WhisperX handler."""
    start_time = time.time()
    tmp_dir = None

    try:
        job_input = event.get("input", {})
        audio_url = job_input.get("audio_url")
        language = job_input.get("language", "en")
        diarize = job_input.get("diarize", False)
        split_channels = job_input.get("split_channels", False)
        min_speakers = job_input.get("min_speakers")
        max_speakers = job_input.get("max_speakers")

        max_duration = job_input.get("max_duration", MAX_AUDIO_DURATION)
        job_metadata = job_input.get("metadata", {})

        # Parakeet ignores these (WhisperX-specific) but accepts them for compatibility
        _ = job_input.get("vad_onset", 0.3)
        _ = job_input.get("vad_offset", 0.3)

        if not audio_url:
            return {"error": "audio_url is required"}

        tmp_dir = tempfile.mkdtemp(prefix="parakeet_")
        tmp_path = os.path.join(tmp_dir, "input.wav")
        urllib.request.urlretrieve(audio_url, tmp_path)

        duration = get_audio_duration(tmp_path)

        if duration > ABSOLUTE_MAX_DURATION:
            return {"error": f"Audio duration {duration:.0f}s exceeds absolute max {ABSOLUTE_MAX_DURATION}s"}

        # Trim if over max_duration
        trimmed = False
        original_duration = duration
        if duration > max_duration:
            trimmed_path = os.path.join(tmp_dir, "trimmed.wav")
            subprocess.run(
                ["ffmpeg", "-y", "-i", tmp_path, "-t", str(max_duration), trimmed_path],
                capture_output=True, check=True,
            )
            os.unlink(tmp_path)
            os.rename(trimmed_path, tmp_path)
            duration = get_audio_duration(tmp_path)
            trimmed = True
            print(f"[parakeet] Trimmed {original_duration:.0f}s -> {duration:.0f}s")

        model = get_asr_model()

        # ──────────────────────────────────────────────────────────────
        # STEREO CHANNEL SPLITTING PATH
        # ──────────────────────────────────────────────────────────────
        if split_channels:
            channel_count = get_channel_count(tmp_path)
            print(f"[parakeet] Channel detection: {channel_count} channel(s), split_channels={split_channels}")

            if channel_count and channel_count >= 2:
                agent_path, customer_path = split_stereo(tmp_path, tmp_dir)

                print("[parakeet] Transcribing agent channel (Ch0/Left)...")
                agent_segments, agent_duration = transcribe_single(agent_path, model)
                for seg in agent_segments:
                    seg["speaker"] = "Agent"

                print("[parakeet] Transcribing customer channel (Ch1/Right)...")
                customer_segments, customer_duration = transcribe_single(customer_path, model)
                for seg in customer_segments:
                    seg["speaker"] = "Customer"

                processing_time = time.time() - start_time

                output = {
                    "channels": {
                        "agent": {
                            "segments": agent_segments,
                            "duration_s": round(agent_duration, 2),
                            "segment_count": len(agent_segments),
                        },
                        "customer": {
                            "segments": customer_segments,
                            "duration_s": round(customer_duration, 2),
                            "segment_count": len(customer_segments),
                        },
                    },
                    "channel_count": channel_count,
                    "split_mode": "stereo",
                    "language": language,
                    "asr_engine": "parakeet-tdt-v3",
                    "processing_time_s": round(processing_time, 2),
                    "audio_duration_s": round(duration, 2),
                    "realtime_factor": round(processing_time / max(duration, 0.1), 2),
                }
                if trimmed:
                    output["trimmed"] = True
                    output["original_duration_s"] = round(original_duration, 2)
                if job_metadata:
                    output["metadata"] = job_metadata

                # Include diagnostics when empty — helps debug without container logs
                if len(agent_segments) == 0 or len(customer_segments) == 0:
                    output["_diagnostics"] = {
                        "agent_audio": diagnose_audio(agent_path),
                        "customer_audio": diagnose_audio(customer_path),
                        "original_audio": diagnose_audio(tmp_path),
                        "model": diagnose_model(model),
                    }

                print(f"[parakeet] Stereo complete: {len(agent_segments)} agent + {len(customer_segments)} customer segs ({processing_time:.1f}s)")
                return output

            else:
                print(f"[parakeet] Audio is mono ({channel_count} ch) -- falling back to diarization")
                diarize = True

        # ──────────────────────────────────────────────────────────────
        # STANDARD PATH (mono diarization or no split)
        # ──────────────────────────────────────────────────────────────

        # Resample to 16kHz mono for Parakeet
        resampled_path = resample_audio(tmp_path, tmp_dir)

        # 1. Transcribe with Parakeet (native CTC timestamps)
        segments, _ = transcribe_single(resampled_path, model)

        # 2. Diarize with pyannote (if requested)
        if diarize:
            diarize_model = get_diarize_model()

            diarize_kwargs = {}
            if min_speakers is not None:
                diarize_kwargs["min_speakers"] = min_speakers
            if max_speakers is not None:
                diarize_kwargs["max_speakers"] = max_speakers

            print("[parakeet] Running speaker diarization...")
            diarization = diarize_model(resampled_path, **diarize_kwargs)
            segments = assign_speakers_to_segments(segments, diarization)

        processing_time = time.time() - start_time

        output = {
            "segments": segments,
            "language": language,
            "asr_engine": "parakeet-tdt-v3",
            "processing_time_s": round(processing_time, 2),
            "audio_duration_s": round(duration, 2),
            "realtime_factor": round(processing_time / max(duration, 0.1), 2),
        }

        if split_channels:
            output["channel_count"] = 1
            output["split_mode"] = "mono_diarize_fallback"

        if trimmed:
            output["trimmed"] = True
            output["original_duration_s"] = round(original_duration, 2)
        if job_metadata:
            output["metadata"] = job_metadata
        return output

    except Exception as e:
        print(f"[parakeet] Error: {traceback.format_exc()}")
        return {"error": str(e)}
    finally:
        if tmp_dir and os.path.exists(tmp_dir):
            import shutil
            shutil.rmtree(tmp_dir, ignore_errors=True)


# Pre-load model when container starts
print("[parakeet] Pre-loading ASR model...")
try:
    get_asr_model()
except Exception as e:
    print(f"[parakeet] Model pre-load failed (will retry on first request): {e}")

runpod.serverless.start({"handler": handler})
