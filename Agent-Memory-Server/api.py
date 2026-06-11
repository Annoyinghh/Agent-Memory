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
from memory_engine import MemoryEngine

engine: MemoryEngine = None

@asynccontextmanager
async def lifespan(app_instance):
    global engine
    engine = MemoryEngine(db_dir=os.environ.get("MEMORY_DB_DIR", "./data"))
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

class InsertResponse(BaseModel):
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


# ── Endpoints ──────────────────────────────────────────────────

@app.post("/api/memory/insert", response_model=InsertResponse)
def insert_memory(req: InsertRequest):
    """插入一条记忆"""
    doc_id = str(uuid.uuid4())
    engine.insert_memory(doc_id, req.namespace, req.content, req.source)
    return InsertResponse(id=doc_id, namespace=req.namespace, message="ok")


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
    if req.doc_id:
        engine.collection.delete(ids=[req.doc_id])
        engine.cursor.execute("DELETE FROM memory_fts WHERE id = ?", (req.doc_id,))
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
            engine.conn.commit()
        return DeleteResponse(deleted_count=len(ids), message=f"deleted by source prefix: {req.source_prefix}")
    else:
        raise HTTPException(status_code=400, detail="Must provide doc_id or source_prefix")


@app.get("/api/namespaces", response_model=NamespacesResponse)
def list_namespaces():
    """列出所有 namespace"""
    engine.cursor.execute("SELECT DISTINCT namespace FROM memory_fts")
    return NamespacesResponse(namespaces=[row[0] for row in engine.cursor.fetchall()])


@app.get("/api/stats", response_model=StatsResponse)
def get_stats():
    """统计信息"""
    total = engine.collection.count()
    engine.cursor.execute("SELECT namespace, count(*) FROM memory_fts GROUP BY namespace")
    namespaces = {row[0]: row[1] for row in engine.cursor.fetchall()}
    return StatsResponse(total_chunks=total, namespaces=namespaces)


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
