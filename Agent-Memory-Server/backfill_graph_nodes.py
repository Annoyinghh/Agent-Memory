"""Backfill graph_nodes metadata for nodes imported before the schema upgrade.

Parses the legacy `source` field (`graphify:<source_file>:<file_type>`) of
existing memories, infers a coarse node_type, runs Louvain community detection
on memory_edges, and writes rows into graph_nodes. Idempotent — safe to re-run.
"""

import os
import sys
import uuid
from collections import defaultdict

# Windows console UTF-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from memory_engine import MemoryEngine


def infer_node_type(label: str, file_type: str) -> str:
    ft = (file_type or "").lower()
    if ft in ("document", "doc", "markdown", "md"):
        return "document"
    if ft == "rationale":
        return "rationale"
    lab = (label or "").lower()
    if lab.endswith("()") or "(" in lab:
        return "function"
    if "class " in lab:
        return "class"
    if lab.endswith((".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".rs", ".java")):
        return "file"
    return "symbol"


def main():
    engine = MemoryEngine(db_dir=os.environ.get("MEMORY_DB_DIR", "./data"))
    cur = engine.cursor

    # Collect memories that look like Graphify imports
    cur.execute("SELECT id, content, source FROM memory_fts WHERE source LIKE 'graphify:%'")
    rows = cur.fetchall()
    print(f"[backfill] found {len(rows)} graphify-sourced memories")

    # Parse source -> source_file, file_type
    meta: dict[str, dict] = {}
    for mid, content, source in rows:
        parts = source.split(":", 2)
        if len(parts) < 3:
            continue
        source_file = parts[1]
        file_type = parts[2] if len(parts) > 2 else "code"
        meta[mid] = {
            "source_file": source_file,
            "file_type": file_type,
            "node_type": infer_node_type(content, file_type),
        }

    if not meta:
        print("[backfill] nothing to do")
        return

    # Build edge list for community detection
    cur.execute("SELECT from_id, to_id, relation_type, confidence FROM memory_edges")
    edges = cur.fetchall()
    print(f"[backfill] {len(edges)} edges loaded")

    community_map: dict[str, int] = {}
    if edges:
        try:
            import networkx as nx
            from networkx.algorithms.community import louvain_communities
            g = nx.Graph()
            for f, t, _r, _c in edges:
                g.add_edge(f, t)
            communities = louvain_communities(g, seed=42)
            community_map = {nid: idx for idx, comm in enumerate(communities) for nid in comm}
            print(f"[backfill] detected {len(communities)} communities")
        except Exception as exc:
            print(f"[backfill] community detection skipped: {exc}")

    # Write graph_nodes rows
    written = 0
    for mid, m in meta.items():
        cur.execute(
            '''INSERT OR REPLACE INTO graph_nodes
               (id, node_type, source_file, source_location, file_type, community_id, external_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (
                mid,
                m["node_type"],
                m["source_file"],
                "",
                m["file_type"],
                community_map.get(mid),
                None,
            ),
        )
        written += 1

    engine.conn.commit()
    engine.close()
    print(f"[backfill] wrote {written} rows into graph_nodes")


if __name__ == "__main__":
    main()
