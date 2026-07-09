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

### 7. Codebase Intelligence (CBM-style structural queries)

Once a namespace is indexed (graph extracted), prefer these **graph queries over grep/read** — one call replaces dozens of file opens. Typical flow: `project_overview` → `get_graph_schema`/`get_architecture` to see the shape → `search_graph` to find nodes → `trace_path` for call chains → `get_code_snippet` for the exact code → `detect_changes` to see what uncommitted edits affect.

#### Detailed Tool References & Usage Scenarios

##### 🏛️ get_graph_schema(namespace?)
- **What it does**: Returns the metadata schema of the active knowledge graph: node/edge totals, counts grouped by `node_type`, edge relationships (e.g. `calls`, `imports`, `contains`), and degree distribution statistics.
- **When to use**: Always run this first upon connecting to a namespace to understand the density and complexity of the indexed project.

##### 🏛️ get_architecture(namespace, hotspot_top=20)
- **What it does**: Computes a project-wide architecture scan including:
  - File count, total lines of code, and programming language distributions.
  - Louvain community detection groupings (clusters of highly connected files).
  - High-degree topological hotspots (symbols with high calling density).
  - Potential entry-point candidates (symbols with high out-degree but zero in-degree callers).
- **When to use**: When onboarding a new project, understanding system boundaries, or identifying the core orchestrators and entry points.

##### 🔍 search_graph(namespace, node_type?, source_file_regex?, name_regex?, min_degree?, max_degree?, limit, offset)
- **What it does**: Performs a structured filter search over code symbol nodes with pagination. 
- **Parameters**:
  - `node_type`: one of `{function, class, file, document, rationale, symbol}`.
  - `name_regex` / `source_file_regex`: Python regex strings against the symbol label or file path.
  - `min_degree` / `max_degree`: bounds on total connected edges.
- **When to use**: To find specific classes or functions matching a naming convention (e.g., `.*Handler.*`) or to filter out low-connectivity scripts.

##### 🔗 trace_path(namespace, start, direction="outbound"|"inbound"|"both", relation="calls", depth=1-5)
- **What it does**: Traces a Breadth-First-Search call graph starting from a specified symbol.
- **Start Resolution**: The parameter `start` can be a exact `node_id`, a fully qualified name, or a case-insensitive literal substring. If multiple symbols match, it returns a list of `candidates` with their respective paths; you must resolve this by re-calling with the correct unique ID.
- **When to use**:
  - `outbound` (callees): To trace what functions are called by a target function (useful for following control flows).
  - `inbound` (callers): To trace who is calling a target function (crucial for figuring out dependency chains).
  - `depth`: Adjust from 1 to 5 to control how deep to scan (default is 3).

##### 📄 get_code_snippet(namespace, node_id?|qualified_name?, context_lines=6)
- **What it does**: Locates the file path and line numbers of the requested symbol from the graph database and reads the exact source code lines.
- **When to use**: Avoid opening large source files to read a single function. Retrieve only the relevant block with a small surrounding buffer context.

##### 💀 dead_code(namespace, limit=500)
- **What it does**: Runs a heuristic scanner finding function nodes with 0 incoming references (no callers). Note that entry points, tests, or external callback handlers may show up here too.
- **When to use**: Refactoring codebases, removing obsolete functions, or auditing system cleanliness.

##### ⚡ detect_changes(namespace, base="HEAD")
- **What it does**: Queries the local git diff status to identify modified files and affected code symbols. It then computes the **blast radius** (dependent symbols at depth 1-2) of your uncommitted edits, assigning a Risk Level (`HIGH` / `MEDIUM` / `LOW`) based on dependency density.
- **When to use**: Run this right before committing code or writing unit tests to assess the ripple effect of your edits and locate high-risk modifications.

#### 💡 Best Practices and AI Agent Workflows

##### Scenario A: Modifying a shared utility function
1. First, call `search_graph` to find the exact symbol node ID for the function.
2. Call `trace_path` with `direction="inbound"` and `depth=3` to map the call tree of all symbols relying on this function.
3. Call `get_code_snippet` on the critical caller nodes to see how they pass arguments.
4. Make your edits. Run `detect_changes` to verify the risk score and ensure no unexpected components are affected.

##### Scenario B: Onboarding and finding where a request starts
1. Call `get_architecture` and review the `entrances` candidates.
2. Select an entrance node (e.g. a controller route or main loop) and call `trace_path` with `direction="outbound"` to map the initial control flow.
3. Use `get_code_snippet` to read the entry-point setup code.

#### ⚠️ Constraints & Gotchas
- **Coarse `node_type`**: The parser maps symbols to coarse types (`function`, `class`, `file`, `document`, `rationale`, `symbol`). Member functions and global functions are both typed `function` (distinguishable by labels like `Class.method`). There is no fine-grained classification (e.g. `interface` vs `abstract class`), so keep regex searches flexible.
- **Sub-millisecond graph queries**: Database-backed graph operations complete in under 1ms. Minimize file operations (`view_file` / `precise_source_search`) and prioritize structural queries.
- **Incremental Diff Fallback**: If Git is unavailable on the host system, `detect_changes` automatically falls back to a file-level content-hash differential (`git_unavailable=true`).


### 8. Team-shared graph artifact & auto-sync

- **Team artifact (skip re-indexing across a team):** `build_team_artifact(namespace)` writes a stable-path `.json.gz` (checksum + counts); download via `GET /api/graph/artifact?namespace=<ns>`, commit it into your repo, and teammates restore via `POST /api/graph/artifact/restore` (or `restore_team_artifact(file_path=...)`) — vectors import verbatim, so no re-extraction/re-embedding.
- **Auto-sync (backend, off by default):** set `AUTO_SYNC_ENABLED=1` (env) to poll tracked source files for hash changes and re-extract incrementally. Tune via `AUTO_SYNC_INTERVAL` (s), `AUTO_SYNC_NAMESPACES`, `AUTO_SYNC_TARGETS` (`ns=/path`), `AUTO_SYNC_MAX_FILES`. Watch `docker compose logs backend` for `[auto-sync]` lines. Polls (not inotify) because Windows+Docker bind-mounts don't propagate file events.
