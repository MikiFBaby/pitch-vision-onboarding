# Parakeet TDT v3 + pyannote Diarization — RunPod Serverless GPU
# Base: CUDA 12.1 runtime (matches RunPod GPU fleet)
# Pre-loads Parakeet TDT model at build time to eliminate cold-start downloads
#
# Build:
#   docker build -t parakeet-server:latest .
#
# Run locally (requires nvidia-docker):
#   docker run --gpus all -p 8000:8000 \
#     -e HF_TOKEN=your_huggingface_token \
#     parakeet-server:latest
#
# Image size: ~8-10 GB (NeMo + Parakeet model + pyannote)
# GPU memory: ~2 GB VRAM at inference (can run on T4/L4)

FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-dev \
    ffmpeg \
    git \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps — install NeMo ASR + pyannote + RunPod
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Pre-download Parakeet TDT model at build time (~1.2 GB)
# This avoids cold-start model downloads on RunPod
RUN python3 -c "\
import nemo.collections.asr as nemo_asr; \
model = nemo_asr.models.ASRModel.from_pretrained('nvidia/parakeet-tdt-0.6b-v2'); \
print('Parakeet model downloaded successfully')" \
    || echo "Model pre-download may need GPU — will download on first request"

# Copy server code
COPY handler.py .

EXPOSE 8000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# RunPod serverless handler
CMD ["python3", "handler.py"]
