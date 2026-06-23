import uuid
import sys
import io
import json

# 强制设置终端输出为 UTF-8，防止 Windows 平台下输出中文报错
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

from mcp.server.fastmcp import FastMCP
from memory_engine import MemoryEngine

# Initialize the FastMCP server
mcp = FastMCP("AgentMemoryServer")

# Initialize the memory engine
engine = MemoryEngine(db_dir="./data")

# ============================================================
# MCP Tools (for AI agents like Claude via stdio/SSE)
# ============================================================

@mcp.tool()
def insert_memory(namespace: str, content: str, source: str, dedup_threshold: float = 0.0) -> str:
    """
    Insert a memory chunk into the local agent memory database.
    Args:
        namespace: The project namespace (e.g., 'shipbearERPwiki')
        content: The actual text/code/knowledge to remember
        source: The origin of this memory (e.g., 'conversation', 'file_path', 'user_instruction')
        dedup_threshold: Optional similarity threshold (0.0 to 1.0) for deduplication. If a similar memory exists, it will be merged/updated instead of creating a duplicate. 0.0 means no deduplication.
    """
    doc_id = str(uuid.uuid4())
    final_id = engine.insert_memory(doc_id, namespace, content, source, dedup_threshold=dedup_threshold)
    
    if final_id == doc_id:
        return f"Successfully inserted new memory with ID {final_id} into namespace '{namespace}'"
    else:
        return f"Content was similar to an existing memory. Updated existing memory with ID {final_id} in namespace '{namespace}'"

@mcp.tool()
def update_memory(doc_id: str, namespace: str, content: str, source: str) -> str:
    """
    Update an existing memory chunk in the local agent memory database by its doc_id.
    Args:
        doc_id: The ID of the memory to update.
        namespace: The project namespace.
        content: The updated text/code/knowledge.
        source: The updated origin of this memory.
    """
    success = engine.update_memory(doc_id, namespace, content, source)
    if success:
        return f"Successfully updated memory with ID {doc_id} in namespace '{namespace}'"
    else:
        return f"Failed to update memory with ID {doc_id}"

@mcp.tool()
def hybrid_search(namespace: str, query: str, top_k: int = 5) -> str:
    """
    Search for relevant memory chunks using Hybrid Search (Semantic Vector + Exact Match Keyword).
    Args:
        namespace: The project namespace to search within.
        query: The user's question, keyword, or error code.
        top_k: Number of results to return.
    """
    results = engine.hybrid_search(namespace, query, top_k)
    if not results:
        return f"No memories found for query '{query}' in namespace '{namespace}'."

    formatted_results = []
    for r in results:
        formatted_results.append(f"====== Memory Context ======\nSource: {r.source}\nScore: {r.score:.3f}\nTimestamp: {r.timestamp}\nContent:\n{r.content}\n============================")

    return "\n\n".join(formatted_results)

@mcp.tool()
def pack_context(namespace: str, query: str, max_tokens: int = 2000) -> str:
    """
    Assemble the most relevant context within a given token budget, returning a formatted prompt snippet.
    Args:
        namespace: The project namespace.
        query: The user's question or topic to pack context for.
        max_tokens: Approximate max tokens budget (1 token ~ 4 chars).
    """
    packed = engine.pack_context(namespace, query, max_tokens)
    return packed

@mcp.tool()
def add_short_term_memory(namespace: str, role: str, content: str) -> str:
    """
    Add a conversational turn to the volatile short-term memory (sliding window).
    Args:
        namespace: The project namespace.
        role: The role of the speaker (e.g., 'user', 'assistant').
        content: The message content.
    """
    engine.add_short_term_memory(namespace, role, content)
    return f"Successfully added {role} message to short-term memory for namespace '{namespace}'"

@mcp.tool()
def get_short_term_memory(namespace: str) -> str:
    """
    Retrieve the short-term memory sliding window for a namespace.
    Args:
        namespace: The project namespace.
    """
    history = engine.get_short_term_memory(namespace)
    if not history:
        return f"No short-term memory found for namespace '{namespace}'."
    
    return json.dumps(history, indent=2, ensure_ascii=False)

@mcp.tool()
def consolidate_memory(namespace: str) -> str:
    """
    Summarize the current short-term memory using an LLM and store it as a long-term memory.
    Clears the short-term memory after consolidation.
    Args:
        namespace: The project namespace.
    """
    doc_id = engine.consolidate_memory(namespace)
    if doc_id:
        return f"Successfully consolidated short-term memory into long-term memory with ID '{doc_id}' for namespace '{namespace}'."
    else:
        return f"Failed to consolidate memory or no short-term memory exists for namespace '{namespace}'."

@mcp.tool()
def pin_memory(doc_id: str, is_pinned: bool) -> str:
    """
    Pin or unpin a specific memory to boost its relevance score.
    Args:
        doc_id: The ID of the memory.
        is_pinned: True to pin, False to unpin.
    """
    engine.set_pinned(doc_id, is_pinned)
    return f"Successfully set pinned status of memory '{doc_id}' to {is_pinned}"

@mcp.tool()
def record_memory_access(doc_id: str) -> str:
    """
    Record an access to a specific memory to slightly boost its future relevance score.
    Args:
        doc_id: The ID of the memory accessed.
    """
    engine.record_access(doc_id)
    return f"Successfully recorded access for memory '{doc_id}'"

@mcp.tool()
def active_forgetting(namespace: str, max_capacity: int = 10000) -> str:
    """
    Enforce a capacity limit by forgetting (deleting) the lowest scoring, unpinned memories.
    Args:
        namespace: The project namespace.
        max_capacity: The maximum number of memories to keep in this namespace.
    """
    deleted = engine.active_forgetting(namespace, max_capacity)
    return f"Active forgetting triggered. Deleted {deleted} memories from namespace '{namespace}' to maintain capacity of {max_capacity}."


# ============================================================
# Working Memory (Scratchpad) Tools
# ============================================================

@mcp.tool()
def write_working_memory(namespace: str, key: str, value: str) -> str:
    """
    Write or update a key-value pair in the working memory scratchpad.
    Args:
        namespace: The project namespace.
        key: The key to identify this piece of working memory.
        value: The content to store.
    """
    engine.write_working_memory(namespace, key, value)
    return f"Successfully wrote key '{key}' to working memory for namespace '{namespace}'"

@mcp.tool()
def read_working_memory(namespace: str, key: str) -> str:
    """
    Read a specific key from the working memory scratchpad.
    Args:
        namespace: The project namespace.
        key: The key to read.
    """
    val = engine.read_working_memory(namespace, key)
    if val is None:
        return f"Key '{key}' not found in working memory for namespace '{namespace}'."
    return val

@mcp.tool()
def list_working_memory(namespace: str) -> str:
    """
    List all keys and their values currently in the working memory scratchpad.
    Args:
        namespace: The project namespace.
    """
    state = engine.list_working_memory(namespace)
    if not state:
        return f"Working memory is empty for namespace '{namespace}'."
    return json.dumps(state, indent=2, ensure_ascii=False)

@mcp.tool()
def delete_working_memory(namespace: str, key: str) -> str:
    """
    Delete a specific key from the working memory scratchpad.
    Args:
        namespace: The project namespace.
        key: The key to delete.
    """
    engine.delete_working_memory(namespace, key)
    return f"Successfully deleted key '{key}' from working memory for namespace '{namespace}'"

@mcp.tool()
def clear_working_memory(namespace: str) -> str:
    """
    Clear all keys from the working memory scratchpad.
    Args:
        namespace: The project namespace.
    """
    engine.clear_working_memory(namespace)
    return f"Successfully cleared all working memory for namespace '{namespace}'"


# ============================================================
# Session Management Tools
# ============================================================

@mcp.tool()
def create_session(namespace: str, session_id: str = None) -> str:
    """
    Create a new conversation session for tracking memories within a namespace.
    Args:
        namespace: The project namespace.
        session_id: Optional custom session ID. If not provided, a UUID will be generated.
    """
    sid = engine.create_session(namespace, session_id)
    return f"Successfully created session '{sid}' in namespace '{namespace}'"

@mcp.tool()
def list_sessions(namespace: str, status: str = None) -> str:
    """
    List all sessions for a namespace, optionally filtered by status.
    Args:
        namespace: The project namespace.
        status: Optional filter ('active', 'archived', 'closed').
    """
    sessions = engine.list_sessions(namespace, status)
    if not sessions:
        return f"No sessions found for namespace '{namespace}'."
    return json.dumps(sessions, indent=2, ensure_ascii=False)

@mcp.tool()
def get_session_context(session_id: str, max_tokens: int = 2000) -> str:
    """
    Restore and pack context from a session's linked memories into a formatted prompt snippet.
    Args:
        session_id: The session ID to restore context from.
        max_tokens: Approximate max tokens budget (1 token ~ 4 chars).
    """
    session = engine.get_session(session_id)
    if not session:
        return f"Session '{session_id}' not found."
    return engine.get_session_context(session_id, max_tokens)

@mcp.tool()
def close_session(session_id: str) -> str:
    """
    Close a session so it is no longer active.
    Args:
        session_id: The session ID to close.
    """
    success = engine.update_session_status(session_id, 'closed')
    if success:
        return f"Session '{session_id}' has been closed."
    return f"Failed to close session '{session_id}'. Session not found."

@mcp.tool()
def link_memory_to_session(session_id: str, memory_id: str) -> str:
    """
    Associate a memory with a session for context tracking.
    Args:
        session_id: The session ID.
        memory_id: The memory ID to link.
    """
    engine.link_memory_to_session(session_id, memory_id)
    return f"Successfully linked memory '{memory_id}' to session '{session_id}'"

@mcp.tool()
def unlink_memory_from_session(session_id: str, memory_id: str) -> str:
    """
    Remove the association between a memory and a session.
    Args:
        session_id: The session ID.
        memory_id: The memory ID to unlink.
    """
    engine.unlink_memory_from_session(session_id, memory_id)
    return f"Successfully unlinked memory '{memory_id}' from session '{session_id}'"


@mcp.tool()
def freeze_snapshot(namespace: str, summary: str) -> str:
    """
    Freeze a high-priority snapshot of the current state for a project namespace.
    Args:
        namespace: The project namespace.
        summary: A concentrated summary of the current architecture, bug being fixed, or plan.
    """
    doc_id = f"snapshot_{uuid.uuid4()}"
    engine.freeze_snapshot(namespace, summary, doc_id)
    return f"Successfully created state snapshot for namespace '{namespace}'. This will be prioritized in future searches."


# ============================================================
# Knowledge Graph Tools (Graphify Integration)
# ============================================================

@mcp.tool()
def add_memory_edge(from_id: str, to_id: str, relation_type: str, confidence: float = 1.0) -> str:
    """
    Add a relationship edge between two memory nodes.
    Args:
        from_id: Source memory ID.
        to_id: Target memory ID.
        relation_type: Type of relationship (e.g., 'calls', 'imports', 'references', 'inherits').
        confidence: Confidence score 0.0 to 1.0 (default 1.0).
    """
    engine.add_edge(from_id, to_id, relation_type, confidence)
    return f"Edge added: {from_id} --[{relation_type}]--> {to_id}"

@mcp.tool()
def get_neighbors(node_id: str, relation_type: str = None, direction: str = "both") -> str:
    """
    Get neighboring memory nodes connected by edges.
    Args:
        node_id: The memory node ID to query.
        relation_type: Optional filter by relation type.
        direction: 'in', 'out', or 'both' (default).
    """
    neighbors = engine.get_neighbors(node_id, relation_type, direction)
    if not neighbors:
        return f"No neighbors found for node '{node_id}'."
    return json.dumps(neighbors, indent=2, ensure_ascii=False)

@mcp.tool()
def get_node_detail(node_id: str) -> str:
    """
    Get full details of a memory node including all its edges.
    Args:
        node_id: The memory node ID.
    """
    node = engine.get_node_detail(node_id)
    if not node:
        return f"Node '{node_id}' not found."
    return json.dumps(node, indent=2, ensure_ascii=False)

@mcp.tool()
def precise_source_search(namespace: str, query: str, max_results: int = 8, context_lines: int = 4) -> str:
    """
    Search exact terms inside source files already referenced by imported graph nodes.
    Use this after project_overview/hybrid_search/pack_context when summaries are not
    detailed enough for formulas, constants, API request bodies, or line-level code.
    Args:
        namespace: The project namespace to search within, or 'all'.
        query: Exact keyword or phrase to find in indexed source files.
        max_results: Maximum snippets to return.
        context_lines: Lines of context before and after each match.
    """
    results = engine.precise_source_search(namespace, query, max_results, context_lines)
    if not results:
        return f"No indexed source snippets found for query '{query}' in namespace '{namespace}'."
    return json.dumps(results, indent=2, ensure_ascii=False)

@mcp.tool()
def find_path(from_id: str, to_id: str, max_depth: int = 5) -> str:
    """
    Find the shortest path between two memory nodes through graph edges.
    Args:
        from_id: Starting node ID.
        to_id: Target node ID.
        max_depth: Maximum search depth (default 5).
    """
    path = engine.shortest_path(from_id, to_id, max_depth)
    if not path:
        return f"No path found between '{from_id}' and '{to_id}' within {max_depth} hops."
    return json.dumps(path, indent=2, ensure_ascii=False)

@mcp.tool()
def graph_stats(namespace: str = None) -> str:
    """
    Get knowledge graph statistics: node count, edge count, relation types.
    Args:
        namespace: Optional namespace filter. If omitted, returns global stats.
    """
    stats = engine.get_graph_stats(namespace)
    return json.dumps(stats, indent=2, ensure_ascii=False)

@mcp.tool()
def project_overview() -> str:
    """
    ONE-SHOT project identification. Call this FIRST to discover what's in the
    memory database instead of searching the filesystem for the db file.

    Returns every namespace with its node/edge counts, type (codebase/dialog/mixed),
    an estimated token cost to load it, and a sample node. Use this to pick the
    right namespace, then call hybrid_search or pack_context for the details.
    No arguments needed.
    """
    overview = engine.project_overview()
    return json.dumps(overview, indent=2, ensure_ascii=False)

@mcp.tool()
def import_graph(nodes: str, edges: str, namespace: str) -> str:
    """
    Import a batch of nodes and edges into the knowledge graph.
    Args:
        nodes: JSON string of node objects, each with 'id', 'label', optional 'content', 'source_file', 'file_type'.
        edges: JSON string of edge objects, each with 'source', 'target', 'relation', optional 'confidence'.
        namespace: Target namespace for the imported nodes.
    """
    import json as _json
    node_list = _json.loads(nodes)
    edge_list = _json.loads(edges)
    result = engine.import_graph_data(node_list, edge_list, namespace)
    return f"Imported {result['nodes_imported']} nodes and {result['edges_imported']} edges into namespace '{namespace}'."


@mcp.tool()
def clear_namespace(namespace: str) -> str:
    """
    Wipe ALL nodes, edges, and vectors for a namespace.
    Call this BEFORE re-importing an updated codebase so the new extraction
    doesn't pile duplicates on top of the old graph. Fast (no re-embedding).
    Args:
        namespace: The project namespace to clear entirely.
    """
    deleted = engine.clear_namespace(namespace)
    return f"Cleared namespace '{namespace}': removed {deleted} nodes (and their edges/vectors)."


@mcp.tool()
def sync_codebase(target_dir: str, namespace: str, incremental: bool = False) -> str:
    """
    Sync an updated codebase: clear the namespace's old graph, then re-extract
    and re-import from source. REPLACES the namespace contents (idempotent, no
    duplicates). Use this when the project source has changed.

    SLOW & BLOCKING: re-runs AST extraction + embedding for the whole tree.
    For very large repos this may exceed an MCP tool-call timeout — in that case
    call clear_namespace here, then trigger extraction via the REST API
    background task (POST /api/graph/extract with rebuild=true or incremental=true)
    instead, which runs async with progress polling and no timeout.

    incremental=True: only re-embed files whose content changed since the last
    sync (much faster for small edits). Unchanged files keep their vectors.

    Args:
        target_dir: Absolute path to the project source root to extract.
        namespace: Target namespace to rebuild (its current contents are wiped first,
                   unless incremental=True).
        incremental: If True, only update changed files instead of a full wipe+rebuild.
    """
    from graphify_bridge import extract_to_memory

    cleared = 0
    if not incremental:
        cleared = engine.clear_namespace(namespace)

    # extract_to_memory prints progress to stdout, which would corrupt the
    # MCP JSON-RPC channel (stdio). Redirect those prints to stderr (logs).
    real_stdout, sys.stdout = sys.stdout, sys.stderr
    try:
        result = extract_to_memory(target_dir, namespace, db_dir="./data", incremental=incremental)
    finally:
        sys.stdout = real_stdout

    if isinstance(result, dict) and result.get("error"):
        return f"Sync FAILED for namespace '{namespace}' (cleared {cleared} old nodes first): {result['error']}"

    nodes = result.get("nodes_imported", 0) if isinstance(result, dict) else 0
    edges = result.get("edges_imported", 0) if isinstance(result, dict) else 0
    mode = "incremental" if incremental else "full rebuild"
    if incremental and result.get("skipped_unchanged"):
        return (f"Incremental sync '{namespace}': no files changed, skipped "
                f"(graph unchanged, {result.get('files_total', 0)} files scanned).")
    return (f"Synced namespace '{namespace}' ({mode}): cleared {cleared} old nodes, "
            f"then re-imported {nodes} nodes / {edges} edges.")


@mcp.tool()
def backup_namespace(namespace: str, out_path: str = "") -> str:
    """
    Export a namespace's complete snapshot (memories + graph + raw ChromaDB
    vectors + sessions + working memory) to a .json.gz file. Faithful, portable,
    and restore-able. Vectors are stored verbatim so restore skips re-embedding.

    Backup is read-only — always allowed, even on a protected namespace. The
    default output lives inside the persistent data volume (<data-dir>/backups/)
    so the file survives container restarts and is visible on the host.

    Args:
        namespace: The namespace to back up.
        out_path: Optional output file path. Defaults to <data-dir>/backups/<ns>_<ts>.json.gz.
    """
    import gzip, json, os, time
    data = engine.export_namespace(namespace)
    if not out_path:
        data_dir = os.path.dirname(engine.sqlite_path)
        backups_dir = os.path.join(data_dir, "backups")
        os.makedirs(backups_dir, exist_ok=True)
        safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in namespace)
        ts = time.strftime("%Y%m%d-%H%M%S")
        out_path = os.path.join(backups_dir, f"{safe}_{ts}.json.gz")
    out_path = os.path.abspath(out_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with gzip.open(out_path, "wb") as f:
        f.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))
    c = data["counts"]
    size_kb = os.path.getsize(out_path) / 1024
    return (f"Backed up namespace '{namespace}' -> {out_path} ({size_kb:.1f} KB). "
            f"memories={c['memories']} graph_nodes={c['graph_nodes']} "
            f"edges={c['graph_edges']} manifest={c['graph_manifest']} "
            f"sessions={c['sessions']} working_memory={c['working_memory']}. "
            f"Restore with restore_namespace(file_path=\"{out_path}\").")


@mcp.tool()
def restore_namespace(file_path: str, target_namespace: str = "") -> str:
    """
    Restore a namespace from a .json.gz produced by backup_namespace (or
    GET /api/backup). REPLACE semantics: clears the target namespace first,
    then re-imports everything with original ids/timestamps/vectors (no
    re-embedding). Refused on a protected namespace.

    For very large namespaces this may exceed an MCP tool-call timeout — in
    that case use the REST endpoint POST /api/restore instead (async task with
    progress polling).

    Args:
        file_path: Path to the .json.gz backup file.
        target_namespace: Namespace to restore into. Defaults to the backup's own namespace.
    """
    import gzip, json, os
    if not os.path.exists(file_path):
        return f"Backup file not found: {file_path}"
    try:
        with gzip.open(file_path, "rb") as f:
            data = json.loads(f.read().decode("utf-8"))
    except Exception as e:
        return f"Failed to read/parse backup: {e}"
    if not isinstance(data, dict) or data.get("format") != "agent-memory-backup":
        return f"Not an agent-memory backup: {file_path}"
    target = target_namespace or data.get("namespace")
    if not target:
        return "Backup has no namespace and no target_namespace given."
    if engine.is_protected(target):
        return (f"Refused: target namespace '{target}' is protected (read-only). "
                f"Unprotect it first.")

    result = engine.import_namespace(data, target_namespace=target)
    return (f"Restored namespace '{result['namespace']}': "
            f"memories={result['memories_imported']} "
            f"graph_nodes={result['graph_nodes_imported']} "
            f"edges={result['edges_imported']} "
            f"sessions={result['sessions_imported']} "
            f"working_memory={result['working_memory_imported']}.")


if __name__ == "__main__":
    print("Agent Memory MCP Server starting up...", file=sys.stderr)
    mcp.run()
