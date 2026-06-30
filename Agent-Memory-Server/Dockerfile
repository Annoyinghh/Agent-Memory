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
    MEMORY_DB_DIR=/app/data \
    HEADROOM_TELEMETRY=off \
    HEADROOM_CCR_DIR=/app/data/headroom-ccr

WORKDIR /app

# 1) API/MCP layer dependencies (fastapi, uvicorn, chromadb, litellm, mcp, pydantic).
COPY Agent-Memory-Server/requirements.txt /tmp/requirements.txt
RUN pip install -i https://pypi.tuna.tsinghua.edu.cn/simple --no-cache-dir -r /tmp/requirements.txt

# 2) Local graphify extraction package — networkx/numpy/rapidfuzz + ~30 tree-sitter
#    language bindings. These all ship manylinux wheels for cpython 3.11, so no
#    compiler toolchain is needed. If a future binding drops its wheel, add
#    `build-essential` here before this step.
COPY Agent-Memory-Graphify /tmp/graphify
RUN pip install -i https://pypi.tuna.tsinghua.edu.cn/simple --no-cache-dir /tmp/graphify \
    && rm -rf /tmp/graphify /tmp/requirements.txt

# 2a) C build toolchain for headroom-ai[all]'s source sdists (hnswlib and friends build
#     from source on python:3.11-slim, which ships no compiler). ~200MB; required for the
#     headroom install below to succeed. Kept unconditionally so a flaky headroom install
#     can be retried without re-running apt. Also installs `git` — needed by the
#     detect_changes tool (git diff → impacted symbols); without it detect_changes
#     gracefully falls back to a content-hash diff at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential python3-dev git \
    && rm -rf /var/lib/apt/lists/*

# 2b) headroom-ai[all] — optional reversible context compression (pulls PyTorch + Kompress,
#     ~large). BEST-EFFORT + retried because the build host's network is flaky: on final
#     failure this layer still succeeds (|| true) and compression silently degrades to
#     passthrough at runtime. Rebuild when the network is healthy to enable it. Status is
#     visible via headroom_stats (MCP) or GET /api/compress/stats.
RUN set +e; \
    for i in $(seq 1 8); do \
      pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121 \
        && pip install -i https://pypi.tuna.tsinghua.edu.cn/simple --no-cache-dir --retries 6 --timeout 300 "headroom-ai[all]" \
        && python -c "import headroom" && { echo "HEADROOM_INSTALL_OK"; break; }; \
      echo ">>> headroom install attempt $i failed, retrying in 12s"; sleep 12; \
    done; \
    python -c "import headroom" 2>/dev/null && echo "headroom present after install loop" \
      || echo "WARN: headroom-ai not installed; compression will passthrough at runtime"

# 2c) Exercise headroom's real compress() path at build time so the first runtime call is
#     fast and any model assets (e.g. Kompress for prose) are fetched here, not on a cold
#     request. Uses compress()+CompressConfig (the actual compression entry point; SharedContext
#     only stores, it does not compress). BEST-EFFORT (non-fatal): on failure, runtime
#     compression passthroughs until a later rebuild succeeds.
RUN set +e; \
    mkdir -p /app/data/headroom-ccr; \
    for i in $(seq 1 8); do \
      python -c "from headroom import compress, CompressConfig; cfg=CompressConfig(compress_user_messages=True, protect_analysis_context=False, protect_recent=0, min_tokens_to_compress=50); r=compress([{'role':'user','content':'[{\"id\":'+str(1)+'},' * 300 + ']' }], config=cfg); print('HEADROOM_WARMUP before=%d after=%d ratio=%.2f' % (r.tokens_before, r.tokens_after, r.compression_ratio))" \
        && { echo "HEADROOM_WARMUP_OK"; break; }; \
      echo ">>> headroom warmup attempt $i failed, retrying in 12s"; sleep 12; \
    done; \
    echo "headroom warmup step done (ok or non-fatal skip)"

# 3) Pre-download chromadb's default embedding model (all-MiniLM-L6-v2 ONNX, ~80MB)
#    into the image. Without this, the FIRST extraction in a fresh container hangs
#    on a slow runtime download; baking it in makes extraction work offline & fast.
RUN set +e; \
    for i in $(seq 1 8); do \
      python -c "import chromadb; from chromadb.utils import embedding_functions as e; e.DefaultEmbeddingFunction()(['warmup'])" \
        && { echo "CHROMADB_WARMUP_OK"; break; }; \
      echo ">>> chromadb warmup attempt $i failed, retrying in 12s"; sleep 12; \
    done

# 3) Application source (api.py, server.py, memory_engine.py, graphify_bridge.py, ...).
COPY Agent-Memory-Server /app

EXPOSE 8900

# Default entrypoint = REST API. Override args to run the MCP server (server.py).
CMD ["python", "api.py", "--host", "0.0.0.0", "--port", "8900", "--db-dir", "/app/data"]
