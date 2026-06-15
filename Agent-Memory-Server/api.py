"""
Agent Memory Server — REST API (FastAPI)
前端对接此 API，MCP server 保持独立运行。
"""

import os
import sys
import io
import uuid
import argparse

# 强制设置终端输出为 UTF-8，防止 Windows 平台下输出中文报错
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from memory_engine import MemoryEngine

engine: MemoryEngine = None

@asynccontextmanager
async def lifespan(app_instance):
    global engine
    engine = MemoryEngine(db_dir=os.environ.get("MEMORY_DB_DIR", "./data"))
    
    # Load protected namespaces from env (comma-separated)
    protected = os.environ.get("PROTECTED_NAMESPACES", "")
    for ns in protected.split(","):
        ns = ns.strip()
        if ns:
            engine.protect_namespace(ns)
            print(f"Namespace '{ns}' is protected (read-only)", file=sys.stderr)
            
    yield

app = FastAPI(title="Agent Memory Server API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response Models ─────────────────────────────────

class InsertRequest(BaseModel):
    namespace: str
    content: str
    source: str
    dedup_threshold: float = 0.0

class InsertResponse(BaseModel):
    id: str
    namespace: str
    message: str

class UpdateRequest(BaseModel):
    doc_id: str
    namespace: str
    content: str
    source: str

class UpdateResponse(BaseModel):
    id: str
    namespace: str
    message: str

class SearchRequest(BaseModel):
    namespace: str
    query: str
    top_k: int = 5

class MemoryItemResponse(BaseModel):
    id: str
    namespace: str
    content: str
    source: str
    timestamp: int
    score: float

class SearchResponse(BaseModel):
    query: str
    namespace: str
    total: int
    results: list[MemoryItemResponse]

class PackRequest(BaseModel):
    namespace: str
    query: str
    max_tokens: int = 2000

class PackResponse(BaseModel):
    query: str
    namespace: str
    packed_context: str

class SnapshotRequest(BaseModel):
    namespace: str
    summary: str

class SnapshotResponse(BaseModel):
    id: str
    namespace: str
    message: str

class DeleteRequest(BaseModel):
    namespace: str
    doc_id: str | None = None
    source_prefix: str | None = None

class DeleteResponse(BaseModel):
    deleted_count: int
    message: str

class NamespacesResponse(BaseModel):
    namespaces: list[str]

class StatsResponse(BaseModel):
    total_chunks: int
    namespaces: dict[str, int]

class ShortTermMemoryRequest(BaseModel):
    namespace: str
    role: str
    content: str

class ShortTermMemoryResponse(BaseModel):
    namespace: str
    message: str

class GetShortTermMemoryResponse(BaseModel):
    namespace: str
    history: List[Dict[str, Any]]

class WorkingMemoryWriteRequest(BaseModel):
    namespace: str
    key: str
    value: str

class WorkingMemoryReadResponse(BaseModel):
    namespace: str
    key: str
    value: str

class WorkingMemoryListResponse(BaseModel):
    namespace: str
    state: Dict[str, str]

class StatusMessageResponse(BaseModel):
    message: str

class ConsolidateRequest(BaseModel):
    namespace: str

class ConsolidateResponse(BaseModel):
    namespace: str
    id: Optional[str]
    message: str

class PinRequest(BaseModel):
    doc_id: str
    is_pinned: bool

class AccessRequest(BaseModel):
    doc_id: str

class ForgetRequest(BaseModel):
    namespace: str
    max_capacity: int = 10000

class ForgetResponse(BaseModel):
    namespace: str
    deleted_count: int

class SessionCreateRequest(BaseModel):
    namespace: str
    session_id: Optional[str] = None

class SessionResponse(BaseModel):
    id: str
    namespace: str
    created_at: int
    last_active: int
    status: str

class SessionListResponse(BaseModel):
    namespace: str
    sessions: list[SessionResponse]

class SessionStatusRequest(BaseModel):
    status: str

class SessionLinkRequest(BaseModel):
    session_id: str
    memory_id: str

class SessionContextRequest(BaseModel):
    session_id: str
    max_tokens: int = 2000

class SessionContextResponse(BaseModel):
    session_id: str
    namespace: str
    packed_context: str


def _check_protected(namespace: str):
    if engine.is_protected(namespace):
        raise HTTPException(status_code=403, detail=f"Namespace '{namespace}' is protected (read-only)")


# ── Endpoints ──────────────────────────────────────────────────

@app.post("/api/memory/insert", response_model=InsertResponse)
def insert_memory(req: InsertRequest):
    """插入一条记忆（支持语义去重）"""
    _check_protected(req.namespace)
    doc_id = str(uuid.uuid4())
    final_id = engine.insert_memory(doc_id, req.namespace, req.content, req.source, dedup_threshold=req.dedup_threshold)
    msg = "ok" if final_id == doc_id else "merged"
    return InsertResponse(id=final_id, namespace=req.namespace, message=msg)


@app.post("/api/memory/update", response_model=UpdateResponse)
def update_memory(req: UpdateRequest):
    """按 doc_id 更新一条记忆"""
    _check_protected(req.namespace)
    success = engine.update_memory(req.doc_id, req.namespace, req.content, req.source)
    if not success:
        raise HTTPException(status_code=404, detail="Memory not found or update failed")
    return UpdateResponse(id=req.doc_id, namespace=req.namespace, message="updated")


@app.post("/api/memory/search", response_model=SearchResponse)
def search_memory(req: SearchRequest):
    """混合检索：语义向量 + 关键词"""
    results = engine.hybrid_search(req.namespace, req.query, req.top_k)
    items = [
        MemoryItemResponse(
            id=r.id, namespace=r.namespace, content=r.content,
            source=r.source, timestamp=r.timestamp, score=r.score
        ) for r in results
    ]
    return SearchResponse(query=req.query, namespace=req.namespace, total=len(items), results=items)


@app.post("/api/memory/pack", response_model=PackResponse)
def pack_context(req: PackRequest):
    """在 token 预算内组装最优上下文"""
    packed = engine.pack_context(req.namespace, req.query, req.max_tokens)
    return PackResponse(query=req.query, namespace=req.namespace, packed_context=packed)


@app.post("/api/memory/short_term", response_model=ShortTermMemoryResponse)
def add_short_term_memory(req: ShortTermMemoryRequest):
    """添加一轮短期对话记忆（滑动窗口）"""
    engine.add_short_term_memory(req.namespace, req.role, req.content)
    return ShortTermMemoryResponse(namespace=req.namespace, message="added")

@app.get("/api/memory/short_term", response_model=GetShortTermMemoryResponse)
def get_short_term_memory(namespace: str = Query(...)):
    """获取指定 namespace 的所有短期记忆"""
    history = engine.get_short_term_memory(namespace)
    return GetShortTermMemoryResponse(namespace=namespace, history=history)

@app.delete("/api/memory/short_term", response_model=ShortTermMemoryResponse)
def delete_short_term_memory(namespace: str = Query(...), index: Optional[int] = Query(None)):
    """删除指定索引的短期对话记忆，若未指定 index 则清空全部"""
    if index is not None:
        success = engine.delete_short_term_memory(namespace, index)
        if not success:
            raise HTTPException(status_code=404, detail="Index out of range or namespace not found")
        msg = "deleted"
    else:
        engine.clear_short_term_memory(namespace)
        msg = "cleared"
    return ShortTermMemoryResponse(namespace=namespace, message=msg)


# ── Working Memory (Scratchpad) Endpoints ──

@app.post("/api/memory/working", response_model=StatusMessageResponse)
def write_working_memory(req: WorkingMemoryWriteRequest):
    """写入一条工作记忆"""
    engine.write_working_memory(req.namespace, req.key, req.value)
    return StatusMessageResponse(message="written")

@app.get("/api/memory/working", response_model=WorkingMemoryReadResponse)
def read_working_memory(namespace: str = Query(...), key: str = Query(...)):
    """读取指定工作记忆"""
    val = engine.read_working_memory(namespace, key)
    if val is None:
        raise HTTPException(status_code=404, detail="Key not found in working memory")
    return WorkingMemoryReadResponse(namespace=namespace, key=key, value=val)

@app.get("/api/memory/working/list", response_model=WorkingMemoryListResponse)
def list_working_memory(namespace: str = Query(...)):
    """列出某个 namespace 下的所有工作记忆"""
    state = engine.list_working_memory(namespace)
    return WorkingMemoryListResponse(namespace=namespace, state=state)

@app.delete("/api/memory/working", response_model=StatusMessageResponse)
def delete_working_memory(namespace: str = Query(...), key: str = Query(...)):
    """删除指定的任务记忆"""
    engine.delete_working_memory(namespace, key)
    return StatusMessageResponse(message="deleted")

@app.delete("/api/memory/working/clear", response_model=StatusMessageResponse)
def clear_working_memory(namespace: str = Query(...)):
    """清空整个 namespace 的工作记忆"""
    engine.clear_working_memory(namespace)
    return StatusMessageResponse(message="cleared")

@app.post("/api/memory/consolidate", response_model=ConsolidateResponse)
def consolidate_memory(req: ConsolidateRequest):
    """将短期记忆整合并提炼入长期数据库中"""
    doc_id = engine.consolidate_memory(req.namespace)
    if doc_id:
        return ConsolidateResponse(namespace=req.namespace, id=doc_id, message="consolidated")
    else:
        return ConsolidateResponse(namespace=req.namespace, id=None, message="no history to consolidate or failed")


@app.post("/api/memory/pin", response_model=StatusMessageResponse)
def pin_memory(req: PinRequest):
    """置顶/取消置顶某个长期记忆"""
    engine.set_pinned(req.doc_id, req.is_pinned)
    return StatusMessageResponse(message="pinned status updated")

@app.post("/api/memory/access", response_model=StatusMessageResponse)
def access_memory(req: AccessRequest):
    """记录一次某长期记忆的访问（提高分数）"""
    engine.record_access(req.doc_id)
    return StatusMessageResponse(message="access recorded")

@app.post("/api/memory/snapshot", response_model=SnapshotResponse)
def create_snapshot(req: SnapshotRequest):
    """创建高优先级快照"""
    doc_id = f"snapshot_{uuid.uuid4()}"
    engine.freeze_snapshot(req.namespace, req.summary, doc_id)
    return SnapshotResponse(id=doc_id, namespace=req.namespace, message="snapshot created")


@app.get("/api/memory/search", response_model=SearchResponse)
def search_memory_get(
    namespace: str = Query(...),
    query: str = Query(...),
    top_k: int = Query(5),
):
    """GET 方式检索（方便调试）"""
    results = engine.hybrid_search(namespace, query, top_k)
    items = [
        MemoryItemResponse(
            id=r.id, namespace=r.namespace, content=r.content,
            source=r.source, timestamp=r.timestamp, score=r.score
        ) for r in results
    ]
    return SearchResponse(query=query, namespace=namespace, total=len(items), results=items)


@app.delete("/api/memory/delete", response_model=DeleteResponse)
def delete_memory(req: DeleteRequest):
    """按 doc_id 或 source 前缀删除记忆"""
    _check_protected(req.namespace)
    with engine.lock:
        if req.doc_id:
            engine.collection.delete(ids=[req.doc_id])
            engine.cursor.execute("DELETE FROM memory_fts WHERE id = ?", (req.doc_id,))
            engine.cursor.execute("DELETE FROM memory_edges WHERE from_id = ? OR to_id = ?", (req.doc_id, req.doc_id))
            engine.conn.commit()
            return DeleteResponse(deleted_count=1, message="deleted by id")
        elif req.source_prefix:
            engine.cursor.execute(
                "SELECT id FROM memory_fts WHERE source LIKE ?",
                (f"{req.source_prefix}%",)
            )
            ids = [row[0] for row in engine.cursor.fetchall()]
            if ids:
                engine.collection.delete(ids=ids)
                placeholders = ",".join(["?"] * len(ids))
                engine.cursor.execute(f"DELETE FROM memory_fts WHERE id IN ({placeholders})", ids)
                engine.cursor.execute(f"DELETE FROM memory_edges WHERE from_id IN ({placeholders}) OR to_id IN ({placeholders})", ids + ids)
                engine.conn.commit()
            return DeleteResponse(deleted_count=len(ids), message=f"deleted by source prefix: {req.source_prefix}")
        else:
            raise HTTPException(status_code=400, detail="Must provide doc_id or source_prefix")


@app.get("/api/namespaces", response_model=NamespacesResponse)
def list_namespaces():
    """列出所有 namespace"""
    with engine.lock:
        engine.cursor.execute("SELECT DISTINCT namespace FROM memory_fts")
        return NamespacesResponse(namespaces=[row[0] for row in engine.cursor.fetchall()])


@app.get("/api/stats", response_model=StatsResponse)
def get_stats():
    """统计信息"""
    with engine.lock:
        total = engine.collection.count()
        engine.cursor.execute("SELECT namespace, count(*) FROM memory_fts GROUP BY namespace")
        namespaces = {row[0]: row[1] for row in engine.cursor.fetchall()}
        return StatsResponse(total_chunks=total, namespaces=namespaces)


@app.post("/api/memory/forget", response_model=ForgetResponse)
def active_forgetting(req: ForgetRequest):
    """Active Forgetting: Remove old/low-score memories exceeding capacity"""
    _check_protected(req.namespace)
    deleted = engine.active_forgetting(req.namespace, req.max_capacity)
    return ForgetResponse(namespace=req.namespace, deleted_count=deleted)


# ── Session Management Endpoints ──

@app.post("/api/sessions", response_model=SessionResponse)
def create_session(req: SessionCreateRequest):
    session_id = engine.create_session(req.namespace, req.session_id)
    session = engine.get_session(session_id)
    return SessionResponse(**session)


@app.get("/api/sessions", response_model=SessionListResponse)
def list_sessions(namespace: str = Query(...), status: Optional[str] = Query(None)):
    sessions = engine.list_sessions(namespace, status)
    return SessionListResponse(namespace=namespace, sessions=[SessionResponse(**s) for s in sessions])


@app.get("/api/sessions/{session_id}", response_model=SessionResponse)
def get_session(session_id: str):
    session = engine.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionResponse(**session)


@app.put("/api/sessions/{session_id}/status", response_model=StatusMessageResponse)
def update_session_status(session_id: str, req: SessionStatusRequest):
    success = engine.update_session_status(session_id, req.status)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return StatusMessageResponse(message=f"Session status updated to {req.status}")


@app.post("/api/sessions/link", response_model=StatusMessageResponse)
def link_memory_to_session(req: SessionLinkRequest):
    engine.link_memory_to_session(req.session_id, req.memory_id)
    return StatusMessageResponse(message="memory linked to session")


@app.post("/api/sessions/unlink", response_model=StatusMessageResponse)
def unlink_memory_from_session(req: SessionLinkRequest):
    success = engine.unlink_memory_from_session(req.session_id, req.memory_id)
    if not success:
        raise HTTPException(status_code=404, detail="Link not found")
    return StatusMessageResponse(message="memory unlinked from session")


@app.get("/api/sessions/{session_id}/memories")
def get_session_memories(session_id: str):
    memories = engine.get_session_memories(session_id)
    return {"session_id": session_id, "memories": memories}


@app.post("/api/sessions/context", response_model=SessionContextResponse)
def get_session_context(req: SessionContextRequest):
    session = engine.get_session(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    packed = engine.get_session_context(req.session_id, req.max_tokens)
    return SessionContextResponse(session_id=req.session_id, namespace=session["namespace"], packed_context=packed)


@app.delete("/api/sessions/{session_id}", response_model=StatusMessageResponse)
def delete_session(session_id: str):
    success = engine.delete_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return StatusMessageResponse(message="session deleted")


# ── Namespace Protection Endpoints ──

class NamespaceProtectRequest(BaseModel):
    namespace: str

@app.post("/api/namespaces/protect", response_model=StatusMessageResponse)
def protect_namespace(req: NamespaceProtectRequest):
    engine.protect_namespace(req.namespace)
    return StatusMessageResponse(message=f"Namespace '{req.namespace}' is now protected")

@app.post("/api/namespaces/unprotect", response_model=StatusMessageResponse)
def unprotect_namespace(req: NamespaceProtectRequest):
    engine.unprotect_namespace(req.namespace)
    return StatusMessageResponse(message=f"Namespace '{req.namespace}' is now unprotected")

@app.get("/api/namespaces/protected")
def list_protected_namespaces():
    return {"protected_namespaces": list(engine.protected_namespaces)}


# ── Knowledge Graph Endpoints (Graphify Integration) ──

class EdgeRequest(BaseModel):
    from_id: str
    to_id: str
    relation_type: str
    confidence: float = 1.0

class EdgeRemoveRequest(BaseModel):
    from_id: str
    to_id: str
    relation_type: str

class NeighborRequest(BaseModel):
    node_id: str
    relation_type: Optional[str] = None
    direction: str = "both"
    limit: int = 50

class PathRequest(BaseModel):
    from_id: str
    to_id: str

class GraphImportRequest(BaseModel):
    namespace: str
    nodes: list[dict]
    edges: list[dict]

class GraphImportResponse(BaseModel):
    nodes_imported: int
    edges_imported: int
    id_map_size: int

@app.get("/api/graph/data")
def get_graph_data(namespace: str = Query(...)):
    """获取指定命名空间的所有图谱节点与连线数据"""
    return engine.get_graph_data(namespace)

@app.post("/api/graph/edge", response_model=StatusMessageResponse)
def add_edge(req: EdgeRequest):
    engine.add_edge(req.from_id, req.to_id, req.relation_type, req.confidence)
    return StatusMessageResponse(message="edge added")

@app.delete("/api/graph/edge", response_model=StatusMessageResponse)
def remove_edge(req: EdgeRemoveRequest):
    success = engine.remove_edge(req.from_id, req.to_id, req.relation_type)
    if not success:
        raise HTTPException(status_code=404, detail="Edge not found")
    return StatusMessageResponse(message="edge removed")

@app.post("/api/graph/neighbors")
def get_neighbors(req: NeighborRequest):
    neighbors = engine.get_neighbors(req.node_id, req.relation_type, req.direction, req.limit)
    return {"node_id": req.node_id, "neighbors": neighbors}

@app.get("/api/graph/node/{node_id}")
def get_node_detail(node_id: str):
    node = engine.get_node_detail(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node

@app.post("/api/graph/path")
def shortest_path(req: PathRequest):
    path = engine.shortest_path(req.from_id, req.to_id)
    return {"from_id": req.from_id, "to_id": req.to_id, "path": path, "found": len(path) > 0}

@app.get("/api/graph/stats")
def graph_stats(namespace: str = Query(None)):
    return engine.get_graph_stats(namespace)


@app.get("/api/graph/data")
def get_graph_data(namespace: str = Query("all"), limit: int = Query(500)):
    """Get nodes and edges for graph visualization, capped at limit nodes."""
    return engine.get_graph_data(namespace, limit)


@app.get("/api/graph/communities")
def list_communities(namespace: Optional[str] = Query(None)):
    """List detected communities with node counts for cluster coloring / filtering."""
    return {"namespace": namespace, "communities": engine.list_communities(namespace)}


@app.post("/api/graph/search")
def search_graph_nodes(req: SearchRequest):
    """Semantic search scoped to graph nodes only — excludes dialog memories."""
    results = engine.hybrid_search(req.namespace, req.query, req.top_k)
    # Keep only nodes that have a graph_nodes metadata row (i.e. code entities)
    filtered = []
    for r in results:
        meta = engine.get_graph_node_meta(r.id)
        if meta:
            filtered.append({
                "id": r.id,
                "namespace": r.namespace,
                "content": r.content,
                "source": r.source,
                "timestamp": r.timestamp,
                "score": r.score,
                "node_type": meta["node_type"],
                "source_file": meta["source_file"],
                "source_location": meta["source_location"],
                "community_id": meta["community_id"],
            })
    return {"query": req.query, "namespace": req.namespace, "total": len(filtered), "results": filtered}

@app.post("/api/graph/import", response_model=GraphImportResponse)
def import_graph_data(req: GraphImportRequest):
    _check_protected(req.namespace)
    result = engine.import_graph_data(req.nodes, req.edges, req.namespace)
    return GraphImportResponse(**result)


class GraphExtractRequest(BaseModel):
    target_dir: str
    namespace: str

class GraphFileImportRequest(BaseModel):
    graph_path: str
    namespace: str

@app.post("/api/graph/extract")
def extract_codebase(req: GraphExtractRequest):
    """Run Graphify extraction on a directory and import into Agent Memory."""
    _check_protected(req.namespace)
    from graphify_bridge import extract_to_memory
    result = extract_to_memory(req.target_dir, req.namespace, os.environ.get("MEMORY_DB_DIR", "./data"))
    return result

@app.post("/api/graph/import-file")
def import_graph_file(req: GraphFileImportRequest):
    """Import an existing graphify graph.json file into Agent Memory."""
    _check_protected(req.namespace)
    from graphify_bridge import import_from_graph_json
    result = import_from_graph_json(req.graph_path, req.namespace, os.environ.get("MEMORY_DB_DIR", "./data"))
    return result

class DebugLogRequest(BaseModel):
    message: str

@app.post("/api/debug-log")
def debug_log(req: DebugLogRequest):
    print(f"[BROWSER DEBUG] {req.message}", file=sys.stderr)
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    parser = argparse.ArgumentParser(description="Agent Memory REST API Server")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8900, help="Bind port (default: 8900)")
    parser.add_argument("--db-dir", default="./data", help="Database directory (default: ./data)")
    args = parser.parse_args()

    os.environ["MEMORY_DB_DIR"] = args.db_dir

    print(f"Agent Memory REST API starting on http://{args.host}:{args.port}", file=sys.stderr)
    uvicorn.run(app, host=args.host, port=args.port)
