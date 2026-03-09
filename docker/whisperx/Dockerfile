# WhisperX Transcription Server — RunPod Serverless GPU
# Base: CUDA 12.1 runtime (matches RunPod A4000/A5000/A100 images)
# Pre-loads whisper large-v2 model at build time to eliminate cold-start downloads
#
# Build:
#   docker build -t whisperx-server:latest .
#
# Run locally (requires nvidia-docker):
#   docker run --gpus all -p 8000:8000 \
#     -e HF_TOKEN=your_huggingface_token \
#     whisperx-server:latest
#
# Test:
#   curl -X POST http://localhost:8000/transcribe \
#     -F "audio=@test.wav" \
#     -F "language=en" \
#     -F "diarize=true"

FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV MODEL_DIR=/models

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-dev \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps — install WhisperX + FastAPI
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Pre-download whisper large-v2 model at build time (2.9GB)
# This avoids cold-start model downloads on RunPod
RUN python3 -c "import whisperx; whisperx.load_model('large-v2', device='cpu', compute_type='float32', download_root='/models')" \
    || echo "Model pre-download requires GPU at runtime — will download on first request"

# Copy server code
COPY app.py .
COPY handler.py .

EXPOSE 8000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# FastAPI server (direct mode) OR RunPod handler (serverless mode)
# RunPod sets RUNPOD_SERVERLESS=1 automatically
CMD ["sh", "-c", "if [ \"$RUNPOD_SERVERLESS\" = '1' ]; then python3 handler.py; else python3 -m uvicorn app:app --host 0.0.0.0 --port 8000; fi"]
