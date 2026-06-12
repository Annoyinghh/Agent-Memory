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


if __name__ == "__main__":
    print("Agent Memory MCP Server starting up...", file=sys.stderr)
    mcp.run()
