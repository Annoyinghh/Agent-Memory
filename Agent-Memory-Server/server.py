import uuid
import sys
import io

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
def insert_memory(namespace: str, content: str, source: str) -> str:
    """
    Insert a memory chunk into the local agent memory database.
    Args:
        namespace: The project namespace (e.g., 'shipbearERPwiki')
        content: The actual text/code/knowledge to remember
        source: The origin of this memory (e.g., 'conversation', 'file_path', 'user_instruction')
    """
    doc_id = str(uuid.uuid4())
    engine.insert_memory(doc_id, namespace, content, source)
    return f"Successfully inserted memory with ID {doc_id} into namespace '{namespace}'"

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

if __name__ == "__main__":
    print("Agent Memory MCP Server starting up...", file=sys.stderr)
    mcp.run()
