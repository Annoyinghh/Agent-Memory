"""
watcher.py — background auto-sync for codebase namespaces.

Polls (NOT inotify): on Windows + Docker Desktop bind-mounts inotify does not
propagate, so we recompute content hashes of every tracked source file on an
interval and diff against the import manifest (graph_manifest). When files
change, we hand off to graphify_bridge.extract_to_memory(incremental=True) in a
separate worker thread — that opens its OWN MemoryEngine, so the backend's
request-handling engine.lock is never held during the long re-extraction.

Enabled only in the backend container, only when AUTO_SYNC_ENABLED=1 (off by
default — polling has a cost and a cross-process write window).
"""
from __future__ import annotations

import hashlib
import os
import sys
import threading
from typing import Dict, List, Optional


def _log(msg: str) -> None:
    print(f"[auto-sync] {msg}", file=sys.stderr, flush=True)


class AutoSyncWatcher:
    def __init__(self, engine, interval: int = 60, namespaces: Optional[List[str]] = None,
                 targets: Optional[Dict[str, str]] = None, max_files: int = 10000):
        self.engine = engine
        self.interval = max(10, int(interval or 60))
        self.namespaces = namespaces          # None => auto (all with a manifest)
        self.targets = targets or {}          # {namespace: source_dir}
        self.max_files = max(1, int(max_files or 10000))
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._tick_lock = threading.Lock()    # serialize ticks
        self._in_flight: set = set()          # namespaces mid-extraction
        self._in_flight_lock = threading.Lock()

    # ── construction from env ──────────────────────────────────────────
    @classmethod
    def from_env(cls, engine) -> Optional["AutoSyncWatcher"]:
        if os.environ.get("AUTO_SYNC_ENABLED", "0").lower() not in ("1", "true", "yes", "on"):
            return None
        ns_env = os.environ.get("AUTO_SYNC_NAMESPACES", "").strip()
        namespaces = [n.strip() for n in ns_env.split(",") if n.strip()] or None
        targets: Dict[str, str] = {}
        for pair in os.environ.get("AUTO_SYNC_TARGETS", "").split(","):
            pair = pair.strip()
            if "=" in pair:
                k, v = pair.split("=", 1)
                targets[k.strip()] = v.strip()
        default_target = os.environ.get("CODEBASE_SOURCE_DIR", "/workspace")
        w = cls(
            engine,
            interval=int(os.environ.get("AUTO_SYNC_INTERVAL", "60")),
            namespaces=namespaces,
            targets=targets,
            max_files=int(os.environ.get("AUTO_SYNC_MAX_FILES", "10000")),
        )
        w._default_target = default_target
        return w

    # ── lifecycle ──────────────────────────────────────────────────────
    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="auto-sync", daemon=True)
        self._thread.start()
        _log(f"started (interval={self.interval}s, namespaces={self.namespaces or 'auto'})")

    def stop(self) -> None:
        self._stop.set()
        t = self._thread
        if t and t.is_alive():
            t.join(timeout=15)
        _log("stopped")

    # ── internals ──────────────────────────────────────────────────────
    def _loop(self) -> None:
        # Don't fire immediately on boot (let the container settle / healthcheck pass).
        if self._stop.wait(self.interval):
            return
        while not self._stop.is_set():
            try:
                with self._tick_lock:
                    self._tick()
            except Exception as e:  # never let the loop die
                _log(f"tick error: {e!r}")
            if self._stop.wait(self.interval):
                return

    def _namespaces_to_watch(self) -> List[str]:
        if self.namespaces:
            return list(self.namespaces)
        with self.engine.lock:
            self.engine.cursor.execute("SELECT DISTINCT namespace FROM graph_manifest")
            return [r[0] for r in self.engine.cursor.fetchall()]

    def _tick(self) -> None:
        for ns in self._namespaces_to_watch():
            try:
                self._sync_namespace(ns)
            except Exception as e:
                _log(f"{ns}: sync error: {e!r}")

    def _sync_namespace(self, namespace: str) -> None:
        with self._in_flight_lock:
            if namespace in self._in_flight:
                return  # previous extraction still running — skip this round
            self._in_flight.add(namespace)
        try:
            manifest = self.engine.get_manifest(namespace) or {}
            if not manifest:
                return
            if len(manifest) > self.max_files:
                _log(f"{namespace}: {len(manifest)} tracked files exceed "
                     f"AUTO_SYNC_MAX_FILES={self.max_files}; skipping")
                return
            changed: List[str] = []
            for source_file, old_hash in manifest.items():
                path = self.engine._resolve_indexed_source_path(source_file)
                if not path:
                    continue
                try:
                    h = hashlib.sha256()
                    with open(path, "rb") as fh:
                        for chunk in iter(lambda: fh.read(65536), b""):
                            h.update(chunk)
                except OSError:
                    continue
                if h.hexdigest() != old_hash:
                    changed.append(source_file)
            if not changed:
                return
            target = self.targets.get(namespace, getattr(self, "_default_target", "/workspace"))
            _log(f"{namespace}: {len(changed)} changed file(s); re-extracting incrementally")
            threading.Thread(
                target=self._extract, args=(namespace, target), daemon=True,
                name=f"auto-sync:{namespace}",
            ).start()
        finally:
            with self._in_flight_lock:
                self._in_flight.discard(namespace)

    def _extract(self, namespace: str, target_dir: str) -> None:
        try:
            from graphify_bridge import extract_to_memory
            extract_to_memory(
                target_dir, namespace,
                os.environ.get("MEMORY_DB_DIR", "./data"),
                incremental=True,
            )
            _log(f"{namespace}: incremental re-extraction done")
        except Exception as e:
            _log(f"{namespace}: re-extraction FAILED: {e!r}")
