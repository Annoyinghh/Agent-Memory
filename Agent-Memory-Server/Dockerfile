# Agent-Memory backend image.
# Serves TWO entrypoints from one image (graphify deps are heavy; shared once):
#   - REST API:   CMD below  →  python api.py --host 0.0.0.0 --port 8900
#   - MCP server: override   →  python server.py   (spawned per-call by the host CLI via `docker run -i`)
# Both point MEMORY_DB_DIR at the same bind-mounted /app/data volume, so the API
# container is the single owner of SQLite + ChromaDB — no cross-process stale handles.
#
# Build context MUST be the repo root (one level up) so the local graphify package
# (sibling directory) can be COPYed in. See docker-compose.yml.

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple \
    PIP_TRUSTED_HOST=pypi.tuna.tsinghua.edu.cn \
    MEMORY_DB_DIR=/app/data \
    HEADROOM_TELEMETRY=off \
    HEADROOM_CCR_DIR=/app/data/headroom-ccr

WORKDIR /app

# 1) API/MCP layer dependencies (fastapi, uvicorn, chromadb, litellm, mcp, pydantic).
COPY Agent-Memory-Server/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# 2) Local graphify extraction package — networkx/numpy/rapidfuzz + ~30 tree-sitter
#    language bindings. These all ship manylinux wheels for cpython 3.11, so no
#    compiler toolchain is needed. If a future binding drops its wheel, add
#    `build-essential` here before this step.
COPY Agent-Memory-Graphify /tmp/graphify
RUN pip install --no-cache-dir /tmp/graphify \
    && rm -rf /tmp/graphify /tmp/requirements.txt

# 2a) C build toolchain for headroom-ai[all]'s source sdists (hnswlib and friends build
#     from source on python:3.11-slim, which ships no compiler). ~200MB; required for the
#     headroom install below to succeed. Kept unconditionally so a flaky headroom install
#     can be retried without re-running apt.
RUN set +e; \
    for i in 1 2 3; do \
      apt-get update \
        && apt-get install -y --no-install-recommends build-essential python3-dev \
        && { echo "APT_INSTALL_OK"; break; }; \
      echo ">>> apt-get attempt $i failed, retrying in 5s"; sleep 5; \
      apt-get clean; \
    done; \
    rm -rf /var/lib/apt/lists/*

# 2b) headroom-ai[all] — SKIPPED for faster build (optional context compression).
# Requires PyTorch (~532MB download) which is very slow on most networks.
# Core memory features work perfectly without it; compression passthrough at runtime.
RUN echo "SKIP: headroom-ai[all] not installed; compression will passthrough at runtime"

# 2c) SKIPPED — headroom warmup not needed since headroom-ai is not installed.
RUN echo "SKIP: headroom warmup step skipped (headroom-ai not installed)"

# 3) Pre-download chromadb's default embedding model (all-MiniLM-L6-v2 ONNX, ~80MB)
#    into the image. BEST-EFFORT: on network failure, model will be downloaded on first use.
RUN set +e; \
    for i in 1 2 3; do \
      python -c "import chromadb; from chromadb.utils import embedding_functions as e; e.DefaultEmbeddingFunction()(['warmup'])" \
        && { echo "CHROMA_WARMUP_OK"; break; }; \
      echo ">>> chroma warmup attempt $i failed, retrying in 5s"; sleep 5; \
    done; \
    echo "chroma warmup done (ok or non-fatal skip)"

# 3) Application source (api.py, server.py, memory_engine.py, graphify_bridge.py, ...).
COPY Agent-Memory-Server /app

EXPOSE 8900

# Default entrypoint = REST API. Override args to run the MCP server (server.py).
CMD ["python", "api.py", "--host", "0.0.0.0", "--port", "8900", "--db-dir", "/app/data"]
