---
name: agent-memory
description: Use when you want to retrieve, insert, or update memories/knowledge in the local memory database, restore session contexts, or query/traverse the codebase knowledge graph using the local MCP server tools.
---

# Agent Memory Skill

This skill allows the agent to interact with the local **Agent Memory System** MCP server. It provides tools for hybrid search, short-term/working memory management, session-based context packing, and querying/updating a tree-sitter AST knowledge graph of the codebase.

## Quick Start

### 1. Identify Existing Namespaces
When starting a session or working in a workspace, **always call `project_overview` first** to discover what namespaces exist, their node/edge counts, and memory details.

### 2. General Workflow
- **Search Context**: Use `hybrid_search` or `pack_context` to find memories matching a user query/problem.
- **Deep Source Search**: If you find node summaries from the graph but need precise code, parameters, or functions, call `precise_source_search`.
- **Update Knowledge**: As you write new code, document decisions, or find new patterns, write them to memory using `insert_memory` (with `dedup_threshold=0.7` to prevent duplicate memories) or `freeze_snapshot`.
- **Manage Sessions**: Use `create_session` and `link_memory_to_session` to group memories for a specific feature, then use `get_session_context` to pack them.

---

## Tool Reference

### 1. Discovery & Search
- `project_overview()`:
  Discovers all namespaces in the memory database. Call this first!
- `hybrid_search(namespace, query, top_k)`:
  Searches memories using Hybrid Search (Semantic Vector + Exact Match Keyword).
- `pack_context(namespace, query, max_tokens)`:
  Assembles the most relevant context within a given token budget into a formatted XML prompt snippet.
- `precise_source_search(namespace, query, max_results, context_lines)`:
  Searches exact terms inside indexed source files. Use this for retrieving detailed code snippets, constants, or formulas.

### 2. Memory CRUD & Life Cycle
- `insert_memory(namespace, content, source, dedup_threshold)`:
  Inserts a new memory chunk. Use `dedup_threshold` (e.g. `0.7` or `0.8`) to merge/update existing similar memories instead of duplicating.
- `update_memory(doc_id, namespace, content, source)`:
  Updates an existing memory chunk by ID.
- `pin_memory(doc_id, is_pinned)`:
  Pins/unpins a memory (pins multiply relevance score by 2x).
- `record_memory_access(doc_id)`:
  Records an access to a memory to slightly boost its score.
- `active_forgetting(namespace, max_capacity)`:
  Deletes low-scoring unpinned memories when the capacity is exceeded.

### 3. Volatile & Working Memory
- `add_short_term_memory(namespace, role, content)`:
  Adds a turn (role/content) to the sliding window memory.
- `get_short_term_memory(namespace)`:
  Retrieves short-term conversation logs for a namespace.
- `consolidate_memory(namespace)`:
  Triggers an LLM summarization of short-term memory and saves it as a long-term memory chunk.
- `write_working_memory(namespace, key, value)` / `read_working_memory` / `list_working_memory` / `delete_working_memory` / `clear_working_memory`:
  Manages key-value pairs in a scratchpad for the active task.

### 4. Sessions
- `create_session(namespace, session_id?)`:
  Creates a new conversation session.
- `list_sessions(namespace, status?)`:
  Lists sessions.
- `get_session_context(session_id, max_tokens)`:
  Packs linked memories of a session into a formatted XML prompt.
- `close_session(session_id)`:
  Closes a session.
- `link_memory_to_session(session_id, memory_id)` / `unlink_memory_from_session(session_id, memory_id)`:
  Links/unlinks memories.

### 5. Knowledge Graph (AST)
- `add_memory_edge(from_id, to_id, relation_type, confidence)`:
  Adds a relationship edge (e.g. `calls`, `imports`, `inherits`, `contains`).
- `get_neighbors(node_id, relation_type?, direction?)`:
  Retrieves neighboring nodes.
- `get_node_detail(node_id)`:
  Gets details of a node and all its connected edges.
- `find_path(from_id, to_id, max_depth)`:
  Finds the shortest path between two nodes.
- `graph_stats(namespace?)`:
  Gets graph statistics.
- `import_graph(nodes, edges, namespace)`:
  Batch imports JSON lists of nodes/edges.

### 6. Token Compression (headroom — optional, reversible, use selectively)

headroom shrinks context **before** it reaches the model — JSON/logs up to ~-90%, code ~-50%, prose ~-30% — and it's **reversible**: each compressed block carries a `retrieve=` key; call `headroom_retrieve(key)` for the full original. Use it to fit more into a token budget, **not** on every call.

**Compress when the context is large or the budget is tight:**
- `pack_context` would otherwise truncate or omit relevant memories → pass `compress=true`: `pack_context(namespace, query, max_tokens, compress=true)`. Each memory block is shrunk (and tagged with a `retrieve=` key) so more memories fit the budget.
- You're about to reason over a **large** blob — a long file, big log/JSON/API response, or verbose stack trace → call `headroom_compress(text)` first, reason over the compressed form, and `headroom_retrieve(key)` only if you need the exact original.

**Don't compress (the default — skip the overhead):** small snippets, short answers, routine lookups; or when the user needs the verbatim original in your reply.

- `headroom_compress(text, language?)` → `{compressed, key, ratio, method}`. `method="passthrough"` means no savings (headroom judged it not worth compressing) — use the original as-is.
- `headroom_retrieve(key)` → the full original text.
- `headroom_stats()` → availability/config. Compression is an optional dependency; it degrades to passthrough if absent.

> headroom compresses what you **send** to the model (input). It cannot shrink what the model **writes back** — keep your own outputs concise regardless.
