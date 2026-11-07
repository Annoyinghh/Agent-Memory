"""
Graphify → Agent Memory adapter.
Parses graphify-out/graph.json and imports nodes/edges into the memory engine.
"""

import json
import argparse


def load_graph(graph_path: str) -> dict:
    with open(graph_path, "r", encoding="utf-8") as f:
        return json.load(f)


def parse_graphify_json(data: dict, source_root: str = None):
    """Extract nodes and edges from Graphify's graph.json format."""
    nodes = []
    edges = []

    # Graphify stores nodes under "nodes" key as a dict or list
    raw_nodes = data.get("nodes", [])
    if isinstance(raw_nodes, dict):
        raw_nodes = list(raw_nodes.values())

    for n in raw_nodes:
        if isinstance(n, dict):
            nodes.append({
                **n,
                "id": n.get("id", ""),
                "label": n.get("label", ""),
                "content": n.get("label", ""),
                "source_file": n.get("source_file", ""),
                "source_location": n.get("source_location", ""),
                "file_type": n.get("file_type", "code"),
                "community": n.get("community"),
                **({"source_root": source_root} if source_root is not None else {}),
            })

    # Graphify stores edges under "edges" key
    raw_edges = data.get("edges", [])
    if isinstance(raw_edges, dict):
        raw_edges = list(raw_edges.values())

    for e in raw_edges:
        if isinstance(e, dict):
            confidence = e.get("confidence", "INFERRED")
            if not isinstance(confidence, (int, float)):
                confidence = 1.0 if confidence == "EXTRACTED" else 0.7
            edges.append({
                "source": e.get("source", ""),
                "target": e.get("target", ""),
                "relation": e.get("relation", "unknown"),
                "confidence": confidence,
                "source_file": e.get("source_file", ""),
            })

    return nodes, edges


def import_graph(graph_path: str, namespace: str, db_dir: str = "./data"):
    from memory_engine import MemoryEngine

    data = load_graph(graph_path)
    nodes, edges = parse_graphify_json(data)

    print(f"Parsed {len(nodes)} nodes, {len(edges)} edges from {graph_path}")
    engine = MemoryEngine(db_dir=db_dir)
    try:
        result = engine.import_graph_data(nodes, edges, namespace)
    finally:
        engine.close()
    print(f"Imported {result['nodes_imported']} nodes, {result['edges_imported']} edges into namespace '{namespace}'")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import Graphify graph.json into Agent Memory")
    parser.add_argument("--graph", required=True, help="Path to graphify graph.json")
    parser.add_argument("--namespace", required=True, help="Target namespace")
    parser.add_argument("--db-dir", default="./data", help="Database directory")
    args = parser.parse_args()
    import_graph(args.graph, args.namespace, args.db_dir)
