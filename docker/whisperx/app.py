"""
WhisperX Transcription Server — FastAPI
Version: 1.0

Endpoints:
  POST /transcribe — Accepts audio file + params, returns transcript segments
  GET  /health     — GPU status, model loaded, VRAM usage

Output format matches Replicate's WhisperX response (segments with start/end/text/speaker/words).
"""

import os
import io
import time
import tempfile
import traceback
from typing import Optional

import torch
import whisperx
import numpy as np
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse

# ─── Config ──────────────────────────────────────────────────────────

MODEL_SIZE = os.environ.get("WHISPERX_MODEL", "large-v2")
MODEL_DIR = os.environ.get("MODEL_DIR", "/models")
HF_TOKEN = os.environ.get("HF_TOKEN", "")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
COMPUTE_TYPE = "float16" if DEVICE == "cuda" else "float32"
MAX_AUDIO_DURATION = 1200  # 20 minutes max

# ─── Global model cache ─────────────────────────────────────────────

_model = None
_diarize_model = None
_model_load_time = None


def get_model():
    global _model, _model_load_time
    if _model is None:
        print(f"[whisperx] Loading {MODEL_SIZE} on {DEVICE} ({COMPUTE_TYPE})...")
        start = time.time()
        _model = whisperx.load_model(
            MODEL_SIZE,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
            download_root=MODEL_DIR,
        )
        _model_load_time = time.time() - start
        print(f"[whisperx] Model loaded in {_model_load_time:.1f}s")
    return _model


def get_diarize_model():
    global _diarize_model
    if _diarize_model is None:
        if not HF_TOKEN:
            raise ValueError("HF_TOKEN required for speaker diarization")
        print("[whisperx] Loading diarization model...")
        _diarize_model = whisperx.DiarizationPipeline(
            use_auth_token=HF_TOKEN,
            device=DEVICE,
        )
        print("[whisperx] Diarization model loaded")
    return _diarize_model


# ─── App ─────────────────────────────────────────────────────────────

app = FastAPI(title="WhisperX Transcription Server", version="1.0")


@app.on_event("startup")
async def startup():
    """Pre-load model on startup to avoid cold-start latency."""
    try:
        get_model()
    except Exception as e:
        print(f"[whisperx] WARNING: Model pre-load failed: {e}")


@app.get("/health")
async def health():
    """Health check with GPU/model status."""
    gpu_info = {}
    if torch.cuda.is_available():
        gpu_info = {
            "gpu_name": torch.cuda.get_device_name(0),
            "gpu_memory_total_mb": round(torch.cuda.get_device_properties(0).total_mem / 1024 / 1024),
            "gpu_memory_allocated_mb": round(torch.cuda.memory_allocated(0) / 1024 / 1024),
            "gpu_memory_reserved_mb": round(torch.cuda.memory_reserved(0) / 1024 / 1024),
        }

    return {
        "status": "ok",
        "device": DEVICE,
        "model": MODEL_SIZE,
        "model_loaded": _model is not None,
        "model_load_time_s": _model_load_time,
        "diarize_model_loaded": _diarize_model is not None,
        **gpu_info,
    }


@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form("en"),
    diarize: bool = Form(False),
    min_speakers: Optional[int] = Form(None),
    max_speakers: Optional[int] = Form(None),
    vad_onset: float = Form(0.3),
    vad_offset: float = Form(0.3),
):
    """
    Transcribe an audio file with optional speaker diarization.

    Returns segments in the same format as Replicate's WhisperX output:
    {
      "segments": [
        {
          "start": 0.0,
          "end": 2.5,
          "text": "Hello, how are you?",
          "speaker": "SPEAKER_00",
          "words": [{"word": "Hello", "start": 0.0, "end": 0.3, "score": 0.95}, ...]
        }
      ],
      "language": "en",
      "processing_time_s": 12.3
    }
    """
    start_time = time.time()

    # Read audio into temp file (WhisperX needs a file path)
    tmp_path = None
    try:
        audio_bytes = await audio.read()
        if len(audio_bytes) == 0:
            raise HTTPException(status_code=400, detail="Empty audio file")

        suffix = os.path.splitext(audio.filename or "audio.wav")[1] or ".wav"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        # Load audio
        audio_array = whisperx.load_audio(tmp_path)
        duration = len(audio_array) / 16000  # WhisperX uses 16kHz

        if duration > MAX_AUDIO_DURATION:
            raise HTTPException(
                status_code=400,
                detail=f"Audio duration {duration:.0f}s exceeds max {MAX_AUDIO_DURATION}s",
            )

        # 1. Transcribe
        model = get_model()
        result = model.transcribe(
            audio_array,
            language=language,
            batch_size=16,
            vad_options={"vad_onset": vad_onset, "vad_offset": vad_offset},
        )

        # 2. Align (word-level timestamps)
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

        # 3. Diarize (if requested)
        if diarize:
            diarize_model = get_diarize_model()
            diarize_kwargs = {}
            if min_speakers is not None:
                diarize_kwargs["min_speakers"] = min_speakers
            if max_speakers is not None:
                diarize_kwargs["max_speakers"] = max_speakers

            diarize_segments = diarize_model(tmp_path, **diarize_kwargs)
            result = whisperx.assign_word_speakers(diarize_segments, result)

        # 4. Format output to match Replicate format
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

    except HTTPException:
        raise
    except Exception as e:
        print(f"[whisperx] Transcription error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
