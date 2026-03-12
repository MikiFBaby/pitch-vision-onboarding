# Parakeet TDT v3 + pyannote Diarization — RunPod Serverless GPU
# Base: CUDA 12.1 runtime (same proven base as WhisperX image)
# Installs NeMo ASR via pip (not the 15GB NeMo container)
#
# Build:
#   docker build -t parakeet-server:latest .
#
# Image size: ~6-7 GB (CUDA runtime + NeMo ASR + pyannote)
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

# Upgrade pip first — Ubuntu 22.04's pip has a dependency resolution bug
# (AssertionError in get_topological_weights) that breaks NeMo's huge dep tree
RUN pip3 install --upgrade pip setuptools wheel

# Install PyTorch first (NeMo needs specific CUDA-compatible torch)
RUN pip3 install --no-cache-dir \
    torch==2.2.0 \
    torchaudio==2.2.0 \
    --index-url https://download.pytorch.org/whl/cu121

# Install NeMo ASR toolkit via pip (much smaller than the full NeMo container)
# Cython and numpy must be installed first for some NeMo deps
RUN pip3 install --no-cache-dir Cython numpy

RUN pip3 install --no-cache-dir \
    "nemo_toolkit[asr]>=2.0.0"

# Install RunPod SDK + pyannote + other deps
RUN pip3 install --no-cache-dir \
    runpod>=1.6.0 \
    pyannote.audio>=3.3.0 \
    soundfile>=0.12.1

# Pre-download Parakeet TDT model at build time (~1.2 GB)
# This avoids cold-start model downloads on RunPod
RUN python3 -c "\
import nemo.collections.asr as nemo_asr; \
model = nemo_asr.models.ASRModel.from_pretrained('nvidia/parakeet-tdt-0.6b-v2'); \
print('Parakeet model downloaded successfully')" \
    || echo "Model pre-download may need GPU — will download on first request"

# Copy server code
COPY handler.py .

# RunPod serverless handler
CMD ["python3", "handler.py"]
