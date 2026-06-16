"""
Graphify <-> Agent Memory Bridge.
Uses Graphify as a library to extract codebases into the Agent Memory knowledge graph.
"""

import json
import os
import sys
import argparse


def extract_to_memory(target_dir: str, namespace: str, db_dir: str = "./data", progress_callback=None):
    """
    Run Graphify extraction on a directory and import results into Agent Memory.
    progress_callback: optional function(stage, current, total, message) for progress updates
    """
    from pathlib import Path
    from graphify.extract import extract, collect_files
    from memory_engine import MemoryEngine

    def report_progress(stage, current, total, message):
        if progress_callback:
            progress_callback(stage, current, total, message)
        print(f"[{stage}] {message} ({current}/{total})")

    target = Path(target_dir).resolve()
    if not target.exists():
        return {"nodes_imported": 0, "edges_imported": 0, "error": f"Directory not found: {target_dir}"}

    # 1. Collect code files from directory
    report_progress("collect", 0, 100, f"正在扫描目录: {target}")
    files = collect_files(target)
    if not files:
        report_progress("collect", 100, 100, "未找到可提取的代码文件")
        return {"nodes_imported": 0, "edges_imported": 0, "error": "No extractable files found"}

    report_progress("collect", 100, 100, f"已发现 {len(files)} 个代码文件")

    # 2. Run Graphify AST extraction (local, no API needed for code)
    report_progress("extract", 0, len(files), "开始 AST 解析...")
    result = extract(files, cache_root=target)

    if not result:
        report_progress("extract", len(files), len(files), "AST 提取无结果")
        return {"nodes_imported": 0, "edges_imported": 0}

    report_progress("extract", len(files), len(files), f"AST 解析完成")

    # 3. Parse nodes and edges from extraction result
    report_progress("parse", 0, 100, "正在解析节点和边...")
    nodes = []
    edges = []

    raw_nodes = result.get("nodes", [])
    if isinstance(raw_nodes, dict):
        raw_nodes = list(raw_nodes.values())

    for n in raw_nodes:
        if isinstance(n, dict):
            source_file = n.get("source_file", "")
            nodes.append({
                "id": n.get("id", ""),
                "label": n.get("label", ""),
                "content": n.get("label", ""),
                "source_file": source_file,
                "source_location": n.get("source_location", ""),
                "source_root": str(target),
                "file_type": n.get("file_type", "code"),
            })

    raw_edges = result.get("edges", [])
    if isinstance(raw_edges, dict):
        raw_edges = list(raw_edges.values())

    for e in raw_edges:
        if isinstance(e, dict):
            conf = e.get("confidence", "INFERRED")
            edges.append({
                "source": e.get("source", ""),
                "target": e.get("target", ""),
                "relation": e.get("relation", "unknown"),
                "confidence": 1.0 if conf == "EXTRACTED" else 0.7,
                "source_file": e.get("source_file", ""),
            })

    report_progress("parse", 100, 100, f"已解析 {len(nodes)} 个节点，{len(edges)} 条边")

    # 4. Import into Agent Memory with progress tracking
    report_progress("import", 0, len(nodes), "开始导入数据库...")
    engine = MemoryEngine(db_dir=db_dir)

    # Pass progress callback to engine
    import_result = engine.import_graph_data(nodes, edges, namespace, progress_callback=progress_callback)
    engine.close()

    report_progress("complete", 100, 100, f"完成！已导入 {import_result['nodes_imported']} 个节点，{import_result['edges_imported']} 条边")
    return import_result


def import_from_graph_json(graph_path: str, namespace: str, db_dir: str = "./data", progress_callback=None):
    """
    Import an existing graph.json into Agent Memory.
    progress_callback: optional function(stage, current, total, message) for progress updates
    """
    from memory_engine import MemoryEngine

    def report_progress(stage, current, total, message):
        if progress_callback:
            progress_callback(stage, current, total, message)
        print(f"[{stage}] {message} ({current}/{total})")

    report_progress("load", 0, 100, f"正在读取文件: {graph_path}")

    with open(graph_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    report_progress("load", 100, 100, "文件读取完成")
    report_progress("parse", 0, 100, "正在解析节点和边...")

    nodes = []
    edges = []

    raw_nodes = data.get("nodes", [])
    if isinstance(raw_nodes, dict):
        raw_nodes = list(raw_nodes.values())

    for n in raw_nodes:
        if isinstance(n, dict):
            nodes.append({
                "id": n.get("id", ""),
                "label": n.get("label", ""),
                "content": n.get("label", ""),
                "source_file": n.get("source_file", ""),
                "source_location": n.get("source_location", ""),
                "file_type": n.get("file_type", "code"),
            })

    raw_edges = data.get("edges", [])
    if isinstance(raw_edges, dict):
        raw_edges = list(raw_edges.values())

    for e in raw_edges:
        if isinstance(e, dict):
            conf = e.get("confidence", "INFERRED")
            edges.append({
                "source": e.get("source", ""),
                "target": e.get("target", ""),
                "relation": e.get("relation", "unknown"),
                "confidence": 1.0 if conf == "EXTRACTED" else 0.7,
                "source_file": e.get("source_file", ""),
            })

    report_progress("parse", 100, 100, f"已解析 {len(nodes)} 个节点，{len(edges)} 条边")
    report_progress("import", 0, len(nodes), "开始导入数据库...")

    engine = MemoryEngine(db_dir=db_dir)
    result = engine.import_graph_data(nodes, edges, namespace, progress_callback=progress_callback)
    engine.close()

    report_progress("complete", 100, 100, f"完成！已导入 {result['nodes_imported']} 个节点，{result['edges_imported']} 条边")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Graphify -> Agent Memory Bridge")
    sub = parser.add_subparsers(dest="command")

    # extract: run Graphify + import
    p_extract = sub.add_parser("extract", help="Extract codebase and import into Agent Memory")
    p_extract.add_argument("--dir", required=True, help="Directory to extract")
    p_extract.add_argument("--namespace", required=True, help="Target namespace")
    p_extract.add_argument("--db-dir", default="./data")

    # import: import existing graph.json
    p_import = sub.add_parser("import", help="Import existing graph.json into Agent Memory")
    p_import.add_argument("--graph", required=True, help="Path to graph.json")
    p_import.add_argument("--namespace", required=True, help="Target namespace")
    p_import.add_argument("--db-dir", default="./data")

    args = parser.parse_args()
    if args.command == "extract":
        extract_to_memory(args.dir, args.namespace, args.db_dir)
    elif args.command == "import":
        import_from_graph_json(args.graph, args.namespace, args.db_dir)
    else:
        parser.print_help()
