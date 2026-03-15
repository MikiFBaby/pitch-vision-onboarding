# WhisperX Transcription Server — RunPod Serverless GPU
# Base: CUDA 12.1 runtime (matches RunPod A4000/A5000/A100 images)
# Pre-loads fine-tuned whisper model (LoRA-merged CT2) at build time
#
# Build:
#   docker build -t whisperx-server:latest \
#     --build-arg AWS_ACCESS_KEY_ID=xxx \
#     --build-arg AWS_SECRET_ACCESS_KEY=xxx .
#
# Run locally (requires nvidia-docker):
#   docker run --gpus all -p 8000:8000 \
#     -e HF_TOKEN=your_huggingface_token \
#     whisperx-server:latest

FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV MODEL_DIR=/models

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-dev \
    ffmpeg \
    git \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps — install WhisperX + FastAPI + AWS CLI
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Download fine-tuned CT2 model from S3 (LoRA-merged, ~1.5GB)
# This is whisper-large-v3-turbo with call center domain LoRA merged in
# CACHE_BUST: change this value to force re-download from S3
ARG CACHE_BUST=2
ARG AWS_ACCESS_KEY_ID
ARG AWS_SECRET_ACCESS_KEY
ARG AWS_DEFAULT_REGION=us-east-1
RUN pip3 install --no-cache-dir awscli && \
    mkdir -p /models/finetuned && \
    aws s3 sync s3://reatrever-data/whisper-finetuned/ct2-merged/ /models/finetuned/ && \
    pip3 uninstall -y awscli && \
    python3 -c "import json; p='/models/finetuned/config.json'; c=json.load(open(p)); c.setdefault('n_mels',c.get('num_mel_bins',128)); json.dump(c,open(p,'w'),indent=2)" && \
    echo "Fine-tuned model downloaded: $(ls /models/finetuned/)"

# Also pre-download vanilla large-v2 as fallback (in case WHISPERX_MODEL env overrides)
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
