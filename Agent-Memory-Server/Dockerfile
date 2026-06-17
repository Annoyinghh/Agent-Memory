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
    MEMORY_DB_DIR=/app/data

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

# 3) Application source (api.py, server.py, memory_engine.py, graphify_bridge.py, ...).
COPY Agent-Memory-Server /app

EXPOSE 8900

# Default entrypoint = REST API. Override args to run the MCP server (server.py).
CMD ["python", "api.py", "--host", "0.0.0.0", "--port", "8900", "--db-dir", "/app/data"]
