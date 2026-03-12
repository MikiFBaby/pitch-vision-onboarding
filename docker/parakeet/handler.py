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
            agent_path,
        ],
        capture_output=True, check=True, timeout=60,
    )

    subprocess.run(
        [
            "ffmpeg", "-y", "-i", audio_path,
            "-af", "pan=mono|c0=c1",
            "-ar", str(SAMPLE_RATE),
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


# ─── Transcription ───────────────────────────────────────────────────


def transcribe_single(audio_path, model):
    """
    Transcribe a single audio file with Parakeet TDT.
    Returns segments in WhisperX-compatible format.

    Parakeet TDT natively produces word-level timestamps via CTC/TDT.
    No forced alignment step needed (unlike WhisperX which needs wav2vec2).
    """
    # TDT models: use return_hypotheses=True ONLY (timestamps are native to TDT).
    # Combining timestamps=True causes internal NeMo unpacking errors for RNNT/TDT.
    try:
        output = model.transcribe([audio_path], return_hypotheses=True)
    except Exception as e:
        print(f"[parakeet] return_hypotheses failed ({e}), falling back to plain transcribe")
        output = model.transcribe([audio_path])

    duration = get_audio_duration(audio_path)
    segments = []

    # Debug: log what NeMo returned
    print(f"[parakeet] transcribe output type: {type(output).__name__}")
    if isinstance(output, (list, tuple)) and len(output) > 0:
        print(f"[parakeet] output[0] type: {type(output[0]).__name__}")
        if isinstance(output, tuple):
            print(f"[parakeet] tuple length: {len(output)}")
            for i, item in enumerate(output):
                print(f"[parakeet] tuple[{i}] type={type(item).__name__}, repr={repr(item)[:200]}")
        elif isinstance(output, list):
            for i, item in enumerate(output):
                print(f"[parakeet] list[{i}] type={type(item).__name__}, repr={repr(item)[:200]}")

    if not output or len(output) == 0:
        print("[parakeet] empty output!")
        return segments, duration

    # NeMo RNNT/TDT with return_hypotheses=True returns a tuple:
    # (best_hypotheses_list, all_hypotheses_list)
    # best_hypotheses_list[0] is the Hypothesis for the first audio file
    if isinstance(output, tuple):
        best_hyps = output[0]  # List of best hypotheses
        result = best_hyps[0] if isinstance(best_hyps, list) and len(best_hyps) > 0 else best_hyps
    else:
        result = output[0]
    hyps = result if isinstance(result, list) else [result]

    for hyp in hyps:
        # Case 1: Plain string (no timestamp info)
        if isinstance(hyp, str):
            text = hyp.strip()
            if text:
                segments.append({
                    "start": 0,
                    "end": round(duration, 3),
                    "text": text,
                })
            continue

        # Case 2: Hypothesis object with timestep dict
        timestep = getattr(hyp, 'timestep', None)
        if timestep and isinstance(timestep, dict):
            words_with_ts = timestep.get('word', [])

            if words_with_ts:
                # Group words into segments (split on pauses > 0.5s)
                current_segment_words = []
                segment_start = None

                for i, word_info in enumerate(words_with_ts):
                    word_text = word_info.get('word', '') if isinstance(word_info, dict) else str(word_info)
                    word_start = word_info.get('start_offset', 0) if isinstance(word_info, dict) else 0
                    word_end = word_info.get('end_offset', 0) if isinstance(word_info, dict) else 0

                    if segment_start is None:
                        segment_start = word_start

                    current_segment_words.append({
                        "word": word_text,
                        "start": round(word_start, 3),
                        "end": round(word_end, 3),
                        "score": 0.95,
                    })

                    is_last = (i == len(words_with_ts) - 1)
                    next_start = words_with_ts[i + 1].get('start_offset', 0) if not is_last and isinstance(words_with_ts[i + 1], dict) else word_end

                    if is_last or (next_start - word_end) > 0.5:
                        seg_text = " ".join(w["word"] for w in current_segment_words).strip()
                        if seg_text:
                            segments.append({
                                "start": round(segment_start, 3),
                                "end": round(word_end, 3),
                                "text": seg_text,
                                "words": current_segment_words,
                            })
                        current_segment_words = []
                        segment_start = None
            else:
                # timestep exists but no word-level info — use full text
                text = getattr(hyp, 'text', str(hyp)).strip()
                if text:
                    segments.append({
                        "start": 0,
                        "end": round(duration, 3),
                        "text": text,
                    })

        # Case 3: Hypothesis object with .text but no timestep
        elif hasattr(hyp, 'text'):
            text = hyp.text.strip()
            if text:
                segments.append({
                    "start": 0,
                    "end": round(duration, 3),
                    "text": text,
                })

        # Case 4: Unknown object — convert to string
        else:
            text = str(hyp).strip()
            if text:
                segments.append({
                    "start": 0,
                    "end": round(duration, 3),
                    "text": text,
                })

    # Debug info — returned in output when segments are empty
    debug_info = {
        "output_type": type(output).__name__,
        "num_hyps": len(hyps),
        "hyp_types": [type(h).__name__ for h in hyps],
        "hyp_attrs": [list(vars(h).keys()) if hasattr(h, '__dict__') else dir(h)[:10] for h in hyps[:2]],
        "hyp_text": [getattr(h, 'text', str(h))[:200] for h in hyps[:2]],
        "hyp_timestep_type": [type(getattr(h, 'timestep', None)).__name__ for h in hyps[:2]],
        "hyp_timestep_keys": [list(getattr(h, 'timestep', {}).keys()) if isinstance(getattr(h, 'timestep', None), dict) else str(getattr(h, 'timestep', None))[:200] for h in hyps[:2]],
    }
    print(f"[parakeet] transcribe_single: {len(segments)} segments from {audio_path}")
    print(f"[parakeet] debug: {debug_info}")
    return segments, duration, debug_info


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
                agent_segments, agent_duration, agent_debug = transcribe_single(agent_path, model)
                for seg in agent_segments:
                    seg["speaker"] = "Agent"

                print("[parakeet] Transcribing customer channel (Ch1/Right)...")
                customer_segments, customer_duration, cust_debug = transcribe_single(customer_path, model)
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

                # Include debug info when segments are empty
                if len(agent_segments) == 0 or len(customer_segments) == 0:
                    output["_debug"] = {
                        "agent": agent_debug,
                        "customer": cust_debug,
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
        segments, _, _ = transcribe_single(resampled_path, model)

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
