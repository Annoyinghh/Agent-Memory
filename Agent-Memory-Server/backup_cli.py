#!/usr/bin/env python3
"""Backup / restore an Agent Memory namespace to/from a .json.gz file.

This is the cron-able, docker-exec-able entry point for protecting a namespace
against data loss (a faithful snapshot including raw ChromaDB vectors).

Usage:
  python backup_cli.py backup  --namespace NAMESPACE [--db-dir DIR] [--out PATH]
  python backup_cli.py restore --in PATH            [--db-dir DIR] [--target NS]

Backups default to {db-dir}/backups/<namespace>_<timestamp>.json.gz, which
lives inside the persistent data dir (bind-mounted in Docker) so files survive
container recreation and are visible on the host.

Restore uses REPLACE semantics: it clears the target namespace first, then
re-imports everything with original ids / timestamps / vectors preserved.
Back up before restoring. Restoring into a protected namespace is refused.
"""
import argparse
import gzip
import json
import os
import sys
import time

# UTF-8 stdout/stderr on Windows (Chinese progress messages).
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

from memory_engine import MemoryEngine


def _default_backup_path(db_dir: str, namespace: str) -> str:
    backups_dir = os.path.join(db_dir, "backups")
    os.makedirs(backups_dir, exist_ok=True)
    safe_ns = "".join(c if c.isalnum() or c in "-_." else "_" for c in namespace)
    ts = time.strftime("%Y%m%d-%H%M%S")
    return os.path.join(backups_dir, f"{safe_ns}_{ts}.json.gz")


def cmd_backup(args) -> int:
    engine = MemoryEngine(db_dir=args.db_dir)
    try:
        print(f"导出 namespace '{args.namespace}' ...", file=sys.stderr)
        data = engine.export_namespace(args.namespace)
        out_path = args.out or _default_backup_path(args.db_dir, args.namespace)
        out_path = os.path.abspath(out_path)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        with gzip.open(out_path, "wb") as f:
            f.write(raw)
        c = data["counts"]
        size = os.path.getsize(out_path)
        print(f"已备份 → {out_path}")
        print(f"  记忆 {c['memories']} / 图节点 {c['graph_nodes']} / 边 {c['graph_edges']} "
              f"/ manifest {c['graph_manifest']} / sessions {c['sessions']} / 工作记忆 {c['working_memory']}")
        print(f"  文件大小 {size / 1024:.1f} KB (gzip)")
        return 0
    finally:
        engine.close()


def cmd_restore(args) -> int:
    if not os.path.exists(args.in_path):
        print(f"错误: 备份文件不存在: {args.in_path}", file=sys.stderr)
        return 1
    engine = MemoryEngine(db_dir=args.db_dir)
    try:
        with gzip.open(args.in_path, "rb") as f:
            data = json.loads(f.read().decode("utf-8"))
    except Exception as e:
        print(f"错误: 无法读取/解析备份文件: {e}", file=sys.stderr)
        engine.close()
        return 1

    if not isinstance(data, dict) or data.get("format") != "agent-memory-backup":
        print("错误: 该文件不是 agent-memory 备份 (format 字段不符)", file=sys.stderr)
        engine.close()
        return 1

    target = args.target or data.get("namespace")
    if not target:
        print("错误: 备份无 namespace 且未指定 --target", file=sys.stderr)
        engine.close()
        return 1
    if engine.is_protected(target):
        print(f"错误: 目标 namespace '{target}' 受保护（只读），无法恢复。先取消保护。",
              file=sys.stderr)
        engine.close()
        return 1

    def progress(stage, current, total, message):
        pct = int(current / total * 100) if total else 0
        print(f"  [{stage}] {message} ({pct}%)", file=sys.stderr)

    print(f"恢复到 namespace '{target}' (将先清空该 namespace) ...", file=sys.stderr)
    try:
        result = engine.import_namespace(data, target_namespace=target, progress_callback=progress)
    except Exception as e:
        print(f"恢复失败: {e}", file=sys.stderr)
        engine.close()
        return 1
    print(f"已恢复 namespace '{result['namespace']}': 记忆 {result['memories_imported']} "
          f"/ 图节点 {result['graph_nodes_imported']} / 边 {result['edges_imported']} "
          f"/ sessions {result['sessions_imported']} / 工作记忆 {result['working_memory_imported']}")
    engine.close()
    return 0


def main():
    default_db = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
    parser = argparse.ArgumentParser(description="Backup / restore an Agent Memory namespace.")
    parser.add_argument("--db-dir", default=default_db,
                        help=f"数据目录 (默认 {default_db})")
    sub = parser.add_subparsers(dest="command", required=True)

    p_bk = sub.add_parser("backup", help="导出一个 namespace 到 .json.gz")
    p_bk.add_argument("--namespace", required=True)
    p_bk.add_argument("--out", default="",
                      help="输出路径 (默认 {db-dir}/backups/<ns>_<ts>.json.gz)")

    p_rs = sub.add_parser("restore", help="从 .json.gz 恢复到一个 namespace")
    p_rs.add_argument("--in", dest="in_path", required=True, help="备份文件路径")
    p_rs.add_argument("--target", default="", help="目标 namespace (默认=备份里的 namespace)")

    args = parser.parse_args()
    # The engine only honors absolute db paths; resolve relative ones here so
    # `--db-dir ./data` behaves as the user expects instead of being ignored.
    args.db_dir = os.path.abspath(args.db_dir)

    if args.command == "backup":
        sys.exit(cmd_backup(args))
    elif args.command == "restore":
        sys.exit(cmd_restore(args))


if __name__ == "__main__":
    main()
