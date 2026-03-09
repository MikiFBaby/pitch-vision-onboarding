#!/bin/bash
# Build and push WhisperX Docker image to Docker Hub
# Usage:
#   ./build-and-push.sh                    # build only (local)
#   ./build-and-push.sh --push             # build + push to Docker Hub
#   ./build-and-push.sh --push --runpod    # build + push to RunPod registry

set -euo pipefail

IMAGE_NAME="pitchvision/whisperx-server"
TAG="latest"
RUNPOD_REGISTRY="registry.runpod.io"

echo "========================================"
echo "WhisperX Docker Build"
echo "========================================"

# Build
echo ""
echo "Building ${IMAGE_NAME}:${TAG}..."
docker build -t "${IMAGE_NAME}:${TAG}" .

echo ""
echo "Build complete: ${IMAGE_NAME}:${TAG}"

# Push to Docker Hub
if [[ "${1:-}" == "--push" ]] || [[ "${2:-}" == "--push" ]]; then
    echo ""
    echo "Pushing to Docker Hub..."
    docker push "${IMAGE_NAME}:${TAG}"
    echo "Pushed: ${IMAGE_NAME}:${TAG}"
fi

# Tag + push to RunPod registry
if [[ "${1:-}" == "--runpod" ]] || [[ "${2:-}" == "--runpod" ]]; then
    RUNPOD_TAG="${RUNPOD_REGISTRY}/${IMAGE_NAME}:${TAG}"
    echo ""
    echo "Tagging for RunPod: ${RUNPOD_TAG}"
    docker tag "${IMAGE_NAME}:${TAG}" "${RUNPOD_TAG}"
    docker push "${RUNPOD_TAG}"
    echo "Pushed: ${RUNPOD_TAG}"
fi

echo ""
echo "========================================"
echo "Done!"
echo ""
echo "Test locally:"
echo "  docker run --gpus all -p 8000:8000 -e HF_TOKEN=\$HF_TOKEN ${IMAGE_NAME}:${TAG}"
echo ""
echo "Test transcription:"
echo "  curl -X POST http://localhost:8000/transcribe -F 'audio=@test.wav' -F 'language=en'"
echo "========================================"
