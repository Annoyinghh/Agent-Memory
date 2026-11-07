# Agent Memory

This project provides local code intelligence and persistent agent memory. The workbench and MCP query the same engine. Start with the README's “从源码到证据” workflow.

- `Agent-Memory-Server/memory_engine.py`: SQLite/FTS source records, memory lifecycle, Chroma index coordination.
- `Agent-Memory-Server/code_query.py`: structural queries and bounded source evidence, shared by `api.py` (REST) and `server.py` (MCP).
- `Agent-Memory-Server/graphify_bridge.py`: AST extraction and incremental file manifest. `Agent-Memory-Graphify/` is the vendored parser.
- `Agent-memory-ui/src/components/`: one workbench, with analysis, graph, index, and memory panels. Read its own AGENTS.md before changing Next.js code.

Use `project_overview`, `get_architecture`, `search_graph`, `trace_path`, and `get_code_snippet` in that order when exploring indexed code. Query one namespace, use exact IDs when ambiguous, and verify source for claims about behavior. Prefer incremental indexing (`incremental=True`).

Run `python -m pytest -q` from `Agent-Memory-Server` with the project environment. The suite uses temporary databases and deterministic embeddings. From `Agent-memory-ui`, run `npm test`, `npm run lint`, and `npm run build`.

Keep existing REST/MCP contracts, path confinement, namespace checks, and durable vector repair. Use an isolated database for tests and examples; do not rebuild or clear the user's data to verify code changes.
