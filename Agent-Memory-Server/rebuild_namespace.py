import argparse
import os
import sys
from pathlib import Path

from memory_engine import MemoryEngine
from graphify_bridge import extract_to_memory


def clear_namespace(engine: MemoryEngine, namespace: str) -> int:
    cur = engine.conn.cursor()
    cur.execute("SELECT id FROM memory_fts WHERE namespace=?", (namespace,))
    ids = [row[0] for row in cur.fetchall()]
    if not ids:
        return 0

    for i in range(0, len(ids), 500):
        engine.collection.delete(ids=ids[i:i + 500])

    placeholders = ",".join(["?"] * len(ids))
    cur.execute(
        f"DELETE FROM memory_edges WHERE from_id IN ({placeholders}) OR to_id IN ({placeholders})",
        ids + ids,
    )
    cur.execute(f"DELETE FROM graph_nodes WHERE id IN ({placeholders})", ids)
    cur.execute(f"DELETE FROM memory_stats WHERE id IN ({placeholders})", ids)
    cur.execute("DELETE FROM memory_fts WHERE namespace=?", (namespace,))
    engine.conn.commit()
    return len(ids)


def main() -> int:
    parser = argparse.ArgumentParser(description="Rebuild a namespace from a source tree")
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--source-dir", required=True)
    parser.add_argument("--db-dir", required=True)
    parser.add_argument("--graphify-dir", required=True)
    parser.add_argument("--cache-dir", required=True)
    args = parser.parse_args()

    if args.graphify_dir not in sys.path:
        sys.path.insert(0, args.graphify_dir)
    os.environ["XDG_CACHE_HOME"] = args.cache_dir
    os.environ["HF_HOME"] = str(Path(args.cache_dir) / "huggingface")
    os.environ["TRANSFORMERS_CACHE"] = str(Path(args.cache_dir) / "huggingface" / "transformers")

    engine = MemoryEngine(db_dir=args.db_dir)
    deleted = clear_namespace(engine, args.namespace)
    engine.close()
    print(f"cleanup_deleted={deleted}")

    result = extract_to_memory(args.source_dir, args.namespace, db_dir=args.db_dir)
    print(result)

    engine = MemoryEngine(db_dir=args.db_dir)
    cur = engine.conn.cursor()
    cur.execute("SELECT count(*) FROM memory_fts WHERE namespace=?", (args.namespace,))
    print("memory_fts", cur.fetchone()[0])
    cur.execute(
        "SELECT count(*) FROM graph_nodes gn JOIN memory_fts m ON gn.id=m.id WHERE m.namespace=?",
        (args.namespace,),
    )
    print("graph_nodes", cur.fetchone()[0])
    cur.execute(
        "SELECT count(*) FROM graph_nodes gn JOIN memory_fts m ON gn.id=m.id "
        "WHERE m.namespace=? AND gn.source_location IS NOT NULL AND gn.source_location != ''",
        (args.namespace,),
    )
    print("source_location_nonempty", cur.fetchone()[0])
    cur.execute(
        "SELECT count(*) FROM memory_edges e JOIN memory_fts m ON e.from_id=m.id WHERE m.namespace=?",
        (args.namespace,),
    )
    print("memory_edges", cur.fetchone()[0])
    print("chroma_count", engine.collection.count())
    engine.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
