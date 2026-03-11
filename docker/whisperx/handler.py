"""
RunPod Serverless Handler for WhisperX
Version: 2.0

RunPod invokes handler(event) for each request. The event contains:
  - input.audio_url: URL to download audio from (presigned S3 URL)
  - input.language: language code (default: "en")
  - input.diarize: boolean (default: false)
  - input.split_channels: boolean (default: false) — if true, detect stereo
    and split Ch0 (Agent) / Ch1 (Customer) via ffmpeg, transcribing each
    independently for perfect speaker separation. Falls back to diarization
    if audio is mono.
  - input.vad_onset: float (default: 0.3)
  - input.vad_offset: float (default: 0.3)
  - input.min_speakers: int (optional)
  - input.max_speakers: int (optional)
  - input.metadata: dict (optional, passed through to output for webhook callbacks)

Returns:
  - If split_channels and stereo: { channels: { agent: { segments }, customer: { segments } }, channel_count: 2, ... }
  - Otherwise: { segments: [...], ... }  (same as v1.0)
"""

import os
import time
import tempfile
import traceback
import subprocess
import urllib.request
import json

import torch
import whisperx
import runpod

# ─── Config ──────────────────────────────────────────────────────────

MODEL_SIZE = os.environ.get("WHISPERX_MODEL", "large-v2")
MODEL_DIR = os.environ.get("MODEL_DIR", "/models")
HF_TOKEN = os.environ.get("HF_TOKEN", "")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
COMPUTE_TYPE = "float16" if DEVICE == "cuda" else "float32"
MAX_AUDIO_DURATION = 600  # 10 minutes default (trimmed, not rejected)
ABSOLUTE_MAX_DURATION = 3600  # 1 hour hard reject
DEFAULT_VAD_ONSET = 0.3
DEFAULT_VAD_OFFSET = 0.3

# ─── Model cache ─────────────────────────────────────────────────────

_model = None
_diarize_model = None


def get_model(vad_onset=DEFAULT_VAD_ONSET, vad_offset=DEFAULT_VAD_OFFSET):
    global _model
    if _model is None:
        print(f"[whisperx] Loading {MODEL_SIZE} on {DEVICE} ({COMPUTE_TYPE})...")
        _model = whisperx.load_model(
            MODEL_SIZE,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
            download_root=MODEL_DIR,
            vad_options={"vad_onset": vad_onset, "vad_offset": vad_offset},
        )
        print("[whisperx] Model loaded")
    return _model


def get_diarize_model():
    global _diarize_model
    if _diarize_model is None:
        if not HF_TOKEN:
            raise ValueError("HF_TOKEN required for speaker diarization")
        _diarize_model = whisperx.diarize.DiarizationPipeline(
            token=HF_TOKEN,
            device=DEVICE,
        )
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
        print(f"[whisperx] ffprobe channel detection failed: {e}")
        return None


def split_stereo(audio_path, tmp_dir):
    """
    Split a stereo WAV into two mono channels using ffmpeg.
    Ch0 (Left) = Agent, Ch1 (Right) = Customer.
    Returns (agent_path, customer_path).
    """
    agent_path = os.path.join(tmp_dir, "ch0_agent.wav")
    customer_path = os.path.join(tmp_dir, "ch1_customer.wav")

    # Extract left channel (agent)
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", audio_path,
            "-af", "pan=mono|c0=c0",
            "-ar", "16000",  # WhisperX expects 16kHz
            agent_path,
        ],
        capture_output=True, check=True, timeout=60,
    )

    # Extract right channel (customer)
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", audio_path,
            "-af", "pan=mono|c0=c1",
            "-ar", "16000",
            customer_path,
        ],
        capture_output=True, check=True, timeout=60,
    )

    return agent_path, customer_path


def transcribe_single(audio_path, model, language, vad_onset, vad_offset):
    """Transcribe a single audio file. Returns formatted segments."""
    audio_array = whisperx.load_audio(audio_path)
    duration = len(audio_array) / 16000

    result = model.transcribe(
        audio_array,
        language=language,
        batch_size=16,
    )

    # Align for word-level timestamps
    model_a, metadata = whisperx.load_align_model(
        language_code=result["language"],
        device=DEVICE,
    )
    result = whisperx.align(
        result["segments"],
        model_a,
        metadata,
        audio_array,
        DEVICE,
        return_char_alignments=False,
    )

    segments = []
    for seg in result.get("segments", []):
        segment = {
            "start": round(seg.get("start", 0), 3),
            "end": round(seg.get("end", 0), 3),
            "text": seg.get("text", "").strip(),
        }
        if "words" in seg:
            segment["words"] = [
                {
                    "word": w.get("word", ""),
                    "start": round(w.get("start", 0), 3),
                    "end": round(w.get("end", 0), 3),
                    "score": round(w.get("score", 0), 3),
                }
                for w in seg["words"]
                if "word" in w
            ]
        segments.append(segment)

    return segments, duration


# ─── Handler ─────────────────────────────────────────────────────────


def handler(event):
    """RunPod serverless handler."""
    start_time = time.time()
    tmp_path = None
    tmp_dir = None

    try:
        job_input = event.get("input", {})
        audio_url = job_input.get("audio_url")
        language = job_input.get("language", "en")
        diarize = job_input.get("diarize", False)
        split_channels = job_input.get("split_channels", False)
        vad_onset = job_input.get("vad_onset", 0.3)
        vad_offset = job_input.get("vad_offset", 0.3)
        min_speakers = job_input.get("min_speakers")
        max_speakers = job_input.get("max_speakers")

        max_duration = job_input.get("max_duration", MAX_AUDIO_DURATION)
        job_metadata = job_input.get("metadata", {})

        if not audio_url:
            return {"error": "audio_url is required"}

        # Create temp directory for channel files
        tmp_dir = tempfile.mkdtemp(prefix="whisperx_")

        # Download audio from URL
        tmp_path = os.path.join(tmp_dir, "input.wav")
        urllib.request.urlretrieve(audio_url, tmp_path)

        # Load audio and check duration
        audio_array = whisperx.load_audio(tmp_path)
        duration = len(audio_array) / 16000

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
            audio_array = whisperx.load_audio(tmp_path)
            duration = len(audio_array) / 16000
            trimmed = True
            print(f"[whisperx] Trimmed {original_duration:.0f}s → {duration:.0f}s")

        model = get_model(vad_onset=vad_onset, vad_offset=vad_offset)

        # ──────────────────────────────────────────────────────────────
        # STEREO CHANNEL SPLITTING PATH
        # ──────────────────────────────────────────────────────────────
        if split_channels:
            channel_count = get_channel_count(tmp_path)
            print(f"[whisperx] Channel detection: {channel_count} channel(s), split_channels={split_channels}")

            if channel_count and channel_count >= 2:
                # Split stereo → two mono channels
                agent_path, customer_path = split_stereo(tmp_path, tmp_dir)

                print("[whisperx] Transcribing agent channel (Ch0/Left)...")
                agent_segments, agent_duration = transcribe_single(
                    agent_path, model, language, vad_onset, vad_offset
                )
                # Tag all agent segments with speaker label
                for seg in agent_segments:
                    seg["speaker"] = "Agent"

                print("[whisperx] Transcribing customer channel (Ch1/Right)...")
                customer_segments, customer_duration = transcribe_single(
                    customer_path, model, language, vad_onset, vad_offset
                )
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
                    "processing_time_s": round(processing_time, 2),
                    "audio_duration_s": round(duration, 2),
                    "realtime_factor": round(processing_time / max(duration, 0.1), 2),
                }
                if trimmed:
                    output["trimmed"] = True
                    output["original_duration_s"] = round(original_duration, 2)
                if job_metadata:
                    output["metadata"] = job_metadata

                print(f"[whisperx] Stereo split complete: {len(agent_segments)} agent segs, {len(customer_segments)} customer segs ({processing_time:.1f}s)")
                return output

            else:
                # Mono audio — fall back to diarization
                print(f"[whisperx] Audio is mono ({channel_count} ch) — falling back to diarization")
                diarize = True  # Force diarization for mono

        # ──────────────────────────────────────────────────────────────
        # STANDARD PATH (mono diarization or no split)
        # ──────────────────────────────────────────────────────────────

        # 1. Transcribe
        result = model.transcribe(
            audio_array,
            language=language,
            batch_size=16,
        )

        # 2. Align
        model_a, metadata = whisperx.load_align_model(
            language_code=result["language"],
            device=DEVICE,
        )
        result = whisperx.align(
            result["segments"],
            model_a,
            metadata,
            audio_array,
            DEVICE,
            return_char_alignments=False,
        )

        # 3. Diarize
        if diarize:
            diarize_model = get_diarize_model()
            diarize_kwargs = {}
            if min_speakers is not None:
                diarize_kwargs["min_speakers"] = min_speakers
            if max_speakers is not None:
                diarize_kwargs["max_speakers"] = max_speakers

            diarize_segments = diarize_model(tmp_path, **diarize_kwargs)
            result = whisperx.assign_word_speakers(diarize_segments, result)

        # 4. Format output
        segments = []
        for seg in result.get("segments", []):
            segment = {
                "start": round(seg.get("start", 0), 3),
                "end": round(seg.get("end", 0), 3),
                "text": seg.get("text", "").strip(),
            }
            if "speaker" in seg:
                segment["speaker"] = seg["speaker"]
            if "words" in seg:
                segment["words"] = [
                    {
                        "word": w.get("word", ""),
                        "start": round(w.get("start", 0), 3),
                        "end": round(w.get("end", 0), 3),
                        "score": round(w.get("score", 0), 3),
                    }
                    for w in seg["words"]
                    if "word" in w
                ]
            segments.append(segment)

        processing_time = time.time() - start_time

        output = {
            "segments": segments,
            "language": result.get("language", language),
            "processing_time_s": round(processing_time, 2),
            "audio_duration_s": round(duration, 2),
            "realtime_factor": round(processing_time / max(duration, 0.1), 2),
        }

        # If we fell back to diarization from split_channels (mono audio), mark it
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
        print(f"[whisperx] Error: {traceback.format_exc()}")
        return {"error": str(e)}
    finally:
        # Clean up temp directory and all files
        if tmp_dir and os.path.exists(tmp_dir):
            import shutil
            shutil.rmtree(tmp_dir, ignore_errors=True)


# Pre-load model when container starts (RunPod keeps containers warm)
print("[whisperx] Pre-loading model...")
try:
    get_model()
except Exception as e:
    print(f"[whisperx] Model pre-load failed (will retry on first request): {e}")

runpod.serverless.start({"handler": handler})
