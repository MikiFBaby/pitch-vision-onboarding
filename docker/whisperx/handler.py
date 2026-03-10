"""
RunPod Serverless Handler for WhisperX
Version: 1.0

RunPod invokes handler(event) for each request. The event contains:
  - input.audio_url: URL to download audio from (presigned S3 URL)
  - input.language: language code (default: "en")
  - input.diarize: boolean (default: false)
  - input.vad_onset: float (default: 0.3)
  - input.vad_offset: float (default: 0.3)
  - input.min_speakers: int (optional)
  - input.max_speakers: int (optional)

Returns the same segment format as the FastAPI /transcribe endpoint.
"""

import os
import time
import tempfile
import traceback
import urllib.request

import torch
import whisperx
import runpod

# ─── Config ──────────────────────────────────────────────────────────

MODEL_SIZE = os.environ.get("WHISPERX_MODEL", "large-v2")
MODEL_DIR = os.environ.get("MODEL_DIR", "/models")
HF_TOKEN = os.environ.get("HF_TOKEN", "")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
COMPUTE_TYPE = "float16" if DEVICE == "cuda" else "float32"
MAX_AUDIO_DURATION = 1200  # 20 minutes
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
            asr_options={"vad_onset": vad_onset, "vad_offset": vad_offset},
        )
        print("[whisperx] Model loaded")
    return _model


def get_diarize_model():
    global _diarize_model
    if _diarize_model is None:
        if not HF_TOKEN:
            raise ValueError("HF_TOKEN required for speaker diarization")
        _diarize_model = whisperx.DiarizationPipeline(
            use_auth_token=HF_TOKEN,
            device=DEVICE,
        )
    return _diarize_model


# ─── Handler ─────────────────────────────────────────────────────────


def handler(event):
    """RunPod serverless handler."""
    start_time = time.time()
    tmp_path = None

    try:
        job_input = event.get("input", {})
        audio_url = job_input.get("audio_url")
        language = job_input.get("language", "en")
        diarize = job_input.get("diarize", False)
        vad_onset = job_input.get("vad_onset", 0.3)
        vad_offset = job_input.get("vad_offset", 0.3)
        min_speakers = job_input.get("min_speakers")
        max_speakers = job_input.get("max_speakers")

        if not audio_url:
            return {"error": "audio_url is required"}

        # Download audio from URL
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
            urllib.request.urlretrieve(audio_url, tmp_path)

        # Load audio
        audio_array = whisperx.load_audio(tmp_path)
        duration = len(audio_array) / 16000

        if duration > MAX_AUDIO_DURATION:
            return {"error": f"Audio duration {duration:.0f}s exceeds max {MAX_AUDIO_DURATION}s"}

        # 1. Transcribe (vad_options set at model load time)
        model = get_model(vad_onset=vad_onset, vad_offset=vad_offset)
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

        return {
            "segments": segments,
            "language": result.get("language", language),
            "processing_time_s": round(processing_time, 2),
            "audio_duration_s": round(duration, 2),
            "realtime_factor": round(processing_time / max(duration, 0.1), 2),
        }

    except Exception as e:
        print(f"[whisperx] Error: {traceback.format_exc()}")
        return {"error": str(e)}
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


# Pre-load model when container starts (RunPod keeps containers warm)
print("[whisperx] Pre-loading model...")
try:
    get_model()
except Exception as e:
    print(f"[whisperx] Model pre-load failed (will retry on first request): {e}")

runpod.serverless.start({"handler": handler})
