# Parakeet TDT v3 + pyannote Diarization — RunPod Serverless GPU
# Base: NVIDIA NeMo container (has NeMo + CUDA pre-installed)
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
# Image size: ~15 GB (NeMo base + Parakeet model + pyannote)
# GPU memory: ~2 GB VRAM at inference (can run on T4/L4)

FROM nvcr.io/nvidia/nemo:24.09

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# ffmpeg for audio processing (NeMo base may not have it)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install additional deps not in NeMo base
RUN pip install --no-cache-dir \
    runpod>=1.6.0 \
    pyannote.audio>=3.3.0 \
    soundfile>=0.12.1

# Pre-download Parakeet TDT model at build time (~1.2 GB)
# This avoids cold-start model downloads on RunPod
RUN python -c "\
import nemo.collections.asr as nemo_asr; \
model = nemo_asr.models.ASRModel.from_pretrained('nvidia/parakeet-tdt-0.6b-v2'); \
print('Parakeet model downloaded successfully')" \
    || echo "Model pre-download may need GPU — will download on first request"

# Copy server code
COPY handler.py .

# RunPod serverless handler
CMD ["python", "handler.py"]
