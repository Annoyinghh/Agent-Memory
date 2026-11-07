"""
Graphify <-> Agent Memory Bridge.
Uses Graphify as a library to extract codebases into the Agent Memory knowledge graph.
"""

import os
import argparse
import tempfile

from graph_adapter import load_graph, parse_graphify_json
from source_files import file_sha256


def _file_hashes(files):
    return {str(path): file_sha256(path) for path in files}


def extract_to_memory(target_dir: str, namespace: str, db_dir: str = "./data", progress_callback=None,
                      incremental: bool = False):
    """
    Run Graphify extraction on a directory and import results into Agent Memory.
    progress_callback: optional function(stage, current, total, message) for progress updates.

    incremental=True: only re-embed nodes of files whose content changed since
    the last import (tracked via a per-file content-hash manifest). Unchanged
    files keep their existing vectors; deleted files are dropped. Still extracts
    ALL files (graphify's AST cache makes unchanged ones cheap) so cross-file
    import edges resolve correctly. First run (no manifest) behaves like a full
    import and seeds the manifest.
    """
    import time
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

    # 1b. Incremental: compute per-file content hashes and diff against the
    # manifest of the last import. Files map to the same source_file string
    # graphify stores (absolute path string of the resolved target).
    changed_source_files = None
    current_hashes = None
    engine = MemoryEngine(db_dir=db_dir)
    try:
        try:
            if incremental:
                current_hashes = _file_hashes(files)
                old_hashes = engine.get_manifest(namespace)
                current_set = set(current_hashes.keys())
                old_set = set(old_hashes.keys())

                added = current_set - old_set
                removed = old_set - current_set
                changed = {sf for sf in (current_set & old_set)
                           if current_hashes[sf] != old_hashes[sf]}
                changed_source_files = added | changed

                report_progress("diff", len(changed_source_files), len(current_set),
                                f"增量分析: 变化 {len(changed_source_files)} / 新增 {len(added)} / 删除 {len(removed)} / 共 {len(current_set)} 个文件")

                # First run (empty manifest) → treat as full import (seed everything).
                if not old_hashes:
                    report_progress("diff", len(current_set), len(current_set), "首次导入(无 manifest)，全量提取并建立清单")
                    changed_source_files = None  # None = import all nodes (full path)
                    incremental = False  # fall back to full import_graph_data behavior

                # Drop nodes of changed + deleted files so we don't leave stale nodes.
                files_to_clear = list(changed | removed) if changed_source_files is not None else list(removed)
                if files_to_clear:
                    cleared = engine.clear_files_in_namespace(namespace, files_to_clear)
                    if cleared:
                        report_progress("clear", cleared, cleared, f"已清除 {cleared} 个变化/删除文件的旧节点")
                # Removed files leave the manifest too.
                if removed:
                    engine.remove_manifest(namespace, list(removed))

                # If nothing changed at all, skip extraction entirely.
                if changed_source_files is not None and not changed_source_files and not removed:
                    report_progress("complete", 100, 100, "无变化，跳过抽取")
                    return {"nodes_imported": 0, "edges_imported": 0, "skipped_unchanged": True,
                            "files_total": len(current_set)}
        except Exception as e:
            # Any manifest hiccup → fall back to a safe full import rather than fail.
            report_progress("diff", 0, 0, f"增量分析失败，回退全量: {e}")
            incremental = False
            changed_source_files = None
        # NOTE: engine kept open (incremental needs it for the import + manifest write
        # below); closed after import. For the non-incremental path we also reuse it.

        # 2. Run Graphify AST extraction (local, no API needed for code)
        # The AST cache must be WRITABLE. Do NOT use `target` as cache_root: when the
        # target is a read-only mount (e.g. Docker's /workspace:ro) graphify can't
        # write graphify-out/cache/ and every worker fails → zero nodes extracted.
        # `target` is still used above only to READ source files (collect_files).
        cache_root = Path(os.environ.get("GRAPHIFY_CACHE_DIR") or tempfile.gettempdir())
        report_progress("extract", 0, len(files), "开始 AST 解析...")
        result = extract(files, cache_root=cache_root)

        if not result:
            report_progress("extract", len(files), len(files), "AST 提取无结果")
            return {"nodes_imported": 0, "edges_imported": 0}

        report_progress("extract", len(files), len(files), f"AST 解析完成")

        # 3. Parse nodes and edges from extraction result
        report_progress("parse", 0, 100, "正在解析节点和边...")
        nodes, edges = parse_graphify_json(result, source_root=str(target))

        report_progress("parse", 100, 100, f"已解析 {len(nodes)} 个节点，{len(edges)} 条边")

        # 4. Import into Agent Memory with progress tracking (reuse the engine opened
        # above for the manifest diff / scoped clear).
        report_progress("import", 0, len(nodes), "开始导入数据库...")

        # Pass progress callback + incremental flag to engine
        import_result = engine.import_graph_data(
            nodes, edges, namespace,
            progress_callback=progress_callback,
            incremental=incremental,
            changed_source_files=changed_source_files,
        )

        # 5. Update the manifest with the freshly-extracted file hashes so the next
        # run can diff. Track which files we actually scanned (the full set, not just
        # changed ones — unchanged files' hashes are still valid and worth recording).
        try:
            if incremental or changed_source_files is not None or not engine.get_manifest(namespace):
                engine.upsert_manifest(namespace, current_hashes or _file_hashes(files), int(time.time()))
        except Exception as e:
            report_progress("manifest", 0, 0, f"manifest 更新失败(不影响本次导入): {e}")


        report_progress("complete", 100, 100, f"完成！已导入 {import_result['nodes_imported']} 个节点，{import_result['edges_imported']} 条边")
        return import_result
    finally:
        engine.close()


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

    data = load_graph(graph_path)

    report_progress("load", 100, 100, "文件读取完成")
    report_progress("parse", 0, 100, "正在解析节点和边...")

    nodes, edges = parse_graphify_json(data)

    report_progress("parse", 100, 100, f"已解析 {len(nodes)} 个节点，{len(edges)} 条边")
    report_progress("import", 0, len(nodes), "开始导入数据库...")

    engine = MemoryEngine(db_dir=db_dir)
    try:
        result = engine.import_graph_data(nodes, edges, namespace, progress_callback=progress_callback)
    finally:
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
