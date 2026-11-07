# Code Intelligence Implementation Plan

> **For agentic workers:** Implement inline using superpowers:executing-plans. The user has authorized the direction and implementation.

**Goal:** One understandable, efficient interface for people and AI, with code intelligence first.

**Architecture:** Preserve the engine and public protocols. Reuse structural analysis; consolidate background jobs and imports; replace duplicated UI with lazy-loaded task-focused panels.

**Tech Stack:** Python, FastAPI, MCP, SQLite, ChromaDB, Next.js 16, React 19, native SVG/CSS.

**Spec:** ../specs/2026-11-06-code-intelligence-design.md

## Global Constraints

- Preserve public REST/MCP interfaces, namespace protection, source path confinement and durable vector repair.
- No new runtime dependency, schema migration or business-data modification.
- Incremental indexing remains the default; full rebuild/restore require explicit UI confirmation.
- No Git metadata is available; use the source archive for recovery.

## Review Focus

- Uploads must retain multipart boundaries and expose backend errors.
- Switching projects must not show stale source, results or task feedback.
- Failed tasks must terminate polling and remain inspectable.
- Ambiguous symbols must offer candidates, not silently choose a file.
- Graph samples must disclose limits and not imply complete coverage.

## Tasks

- [x] Consolidate background execution in TaskManager.submit; keep progress/result/error contracts. Share restore execution across the two REST routes. Test success, failure and protected/invalid uploads.
- [x] Share Graphify node/edge normalization without losing source/community/confidence metadata. Test dict/list input and bridge import behavior.
- [x] Remove unused SSE and duplicate graph API; share uploads and add abortable, sequential task polling. Verify with Node's built-in test runner.
- [x] Replace the two UI shells with Workspace plus lazy CodebaseIntel, GraphExplorer, ProjectPanel and MemoryPanel. Preserve supporting memory/session/compression/backup operations. Use project-keyed panels and cancel effects on unmount.
- [x] Remove archived, unused presentation components/assets/scripts, Three.js and Tailwind. Update README and AGENTS.md with human and AI workflows.
- [x] Run the full Python suite, frontend tests/lint/build, browser checks and final diff review against the source archive; record measured outcomes.

## Baseline

Python: 47 passed. Frontend ESLint: 34 errors, 10 warnings. No product changes before the source snapshot.

## Verification

- `python -m pytest -q`: 59 passed. Tests cover restore on both routes, invalid/protected uploads, durable vector repair, gzip, ambiguity and pagination.
- `node --test tests/api.test.mjs`: 3 passed. `npm run lint` and `npm run build`: passed.
- Browser on an isolated database: index task completion with unchanged files skipped, architecture, source lines, graph and namespace switches, symbol search, call trace, memory retrieval and context packing.
- MCP stdio with a real client: overview, architecture, search, trace, source and incremental sync against the isolated database passed.
- UI JavaScript/CSS: 14,943 to 1,180 lines. Removed 11,945,584 bytes of unused GLB assets. The sample MCP overview decreased from 816 to 672 bytes; no large-repository latency benchmark was run.
- Independent review found one task recovery issue: leaving the index panel lost the task ID. Reproduced with a delayed start, moved tracking to the workspace, then verified navigation before the response, reload and project switching in the browser. Final frontend lint and production build passed.
- Existing restore atomicity, cross-process coordination and backend task lifetime remain outside this refactor. Verification used isolated data; the project database was not modified.
