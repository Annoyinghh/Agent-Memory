"""
code_query.py — codebase-memory-mcp (CBM)-style structural query layer.

These read-only methods live on a mixin (CodeQueryMixin) that MemoryEngine
inherits, so they share the engine's self.lock / self.cursor / self.conn and
can call existing engine helpers (list_communities, get_graph_node_meta,
_read_source_snippet, get_graph_stats, get_manifest, _resolve_indexed_source_path)
via plain `self.` — no duplication, no second db plumbing.

A self-contained @_db_lock decorator is defined here (instead of importing
memory_engine.db_lock) to avoid a circular import: memory_engine imports this
mixin at class-definition time. The semantics are identical (with self.lock).

Graph model this queries (verified against the live DB):
  graph_nodes: id, node_type, source_file(abs path), source_location("L{N}"),
               file_type, community_id, external_id(stable graphify id)
  memory_edges: from_id, to_id, relation_type, confidence, created_at
    relations: calls(caller->callee), uses, method(class->method),
               contains(parent->child), imports, inherits(child->parent),
               references, imports_from, re_exports
  namespace lives on memory_fts (not graph_nodes), so every namespace-scoped
  query JOINs memory_fts m ON gn.id = m.id WHERE m.namespace = ?.

Coarse node_type note: graphify emits no node_type; the engine infers one of
{function, class, file, document, rationale, symbol}. Methods are typed
'function' too (distinguishable by a '.name()' label). These tools do NOT
pretend to CBM's fine-grained Function/Method/Interface split.
"""
from __future__ import annotations

import functools
import hashlib
import os
import re
from typing import Any, Dict, List, Optional


def _db_lock(func):
    """Same semantics as memory_engine.db_lock, defined locally to avoid a
    circular import. Reentrant because self.lock is an RLock."""
    @functools.wraps(func)
    def wrapper(self, *args, **kwargs):
        with self.lock:
            return func(self, *args, **kwargs)
    return wrapper


def _extract_label(content: Optional[str]) -> str:
    """Pull the `label: ...` first line out of a node's stored content."""
    if not content:
        return ""
    first = content.split("\n", 1)[0]
    if first.startswith("label:"):
        return first[len("label:"):].strip()
    return first.strip()


class CodeQueryMixin:
    """CBM-style structural query methods, mixed into MemoryEngine."""

    # ── private helpers ────────────────────────────────────────────────

    def _row_to_candidate(self, row) -> Dict[str, Any]:
        """row = (id, node_type, source_file, source_location, external_id, community_id, content)."""
        return {
            "id": row[0],
            "node_type": row[1],
            "source_file": row[2],
            "source_location": row[3],
            "external_id": row[4],
            "community_id": row[5],
            "label": _extract_label(row[6]),
        }

    @_db_lock
    def _compute_degrees(self, namespace: str) -> Dict[str, Dict[str, int]]:
        """Per-node {id: {in, out, total}} over edges whose endpoint is a code
        node in this namespace. Per-request, not persisted."""
        out_deg: Dict[str, int] = {}
        in_deg: Dict[str, int] = {}
        self.cursor.execute(
            '''SELECT e.from_id, COUNT(*) FROM memory_edges e
               JOIN graph_nodes g ON e.from_id = g.id
               JOIN memory_fts m ON g.id = m.id
               WHERE m.namespace = ? GROUP BY e.from_id''',
            (namespace,),
        )
        for nid, c in self.cursor.fetchall():
            out_deg[nid] = c
        self.cursor.execute(
            '''SELECT e.to_id, COUNT(*) FROM memory_edges e
               JOIN graph_nodes g ON e.to_id = g.id
               JOIN memory_fts m ON g.id = m.id
               WHERE m.namespace = ? GROUP BY e.to_id''',
            (namespace,),
        )
        for nid, c in self.cursor.fetchall():
            in_deg[nid] = c
        ids = set(out_deg) | set(in_deg)
        return {
            nid: {"in": in_deg.get(nid, 0), "out": out_deg.get(nid, 0),
                  "total": in_deg.get(nid, 0) + out_deg.get(nid, 0)}
            for nid in ids
        }

    @_db_lock
    def _resolve_start_node(self, namespace: str, start: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Resolve a trace/snippet start point. Accepts an exact node_id, an
        exact external_id, or a literal substring of external_id/label.
        Returns ALL candidates (caller disambiguates)."""
        start = (start or "").strip()
        if not start:
            return []
        base_sql = (
            "SELECT gn.id, gn.node_type, gn.source_file, gn.source_location, "
            "gn.external_id, gn.community_id, m.content "
            "FROM graph_nodes gn JOIN memory_fts m ON gn.id = m.id "
            "WHERE m.namespace = ?"
        )
        # 1. exact node_id
        self.cursor.execute(base_sql + " AND gn.id = ?", (namespace, start))
        row = self.cursor.fetchone()
        if row:
            return [self._row_to_candidate(row)]
        # 2. exact external_id (case-insensitive)
        self.cursor.execute(base_sql + " AND LOWER(gn.external_id) = ?", (namespace, start.casefold()))
        rows = self.cursor.fetchall()
        if rows:
            return [self._row_to_candidate(r) for r in rows[:limit]]
        # 3. substring of external_id or content(label)
        needle = start.casefold()
        self.cursor.execute(
            base_sql + " AND (INSTR(LOWER(gn.external_id), ?) > 0 OR INSTR(LOWER(m.content), ?) > 0)",
            (namespace, needle, needle),
        )
        rows = self.cursor.fetchall()
        return [self._row_to_candidate(r) for r in rows[:limit]]

    def _fetch_node_metas(self, namespace: str, ids: List[str]) -> Dict[str, Dict[str, Any]]:
        if not ids:
            return {}
        ph = ",".join("?" * len(ids))
        self.cursor.execute(
            f"SELECT gn.id, gn.node_type, gn.source_file, gn.source_location, "
            f"gn.external_id, gn.community_id, m.content "
            f"FROM graph_nodes gn JOIN memory_fts m ON gn.id = m.id "
            f"WHERE m.namespace = ? AND gn.id IN ({ph})",
            [namespace, *ids],
        )
        return {r[0]: self._row_to_candidate(r) for r in self.cursor.fetchall()}

    def _batched_frontier(self, node_ids: List[str], relation: str, direction: str) -> List[Dict[str, Any]]:
        """One SQL per direction. Returns raw edges [{from, to, relation, confidence}]."""
        if not node_ids:
            return []
        ph = ",".join("?" * len(node_ids))
        edges: List[Dict[str, Any]] = []
        if direction in ("outbound", "both"):
            self.cursor.execute(
                f"SELECT from_id, to_id, relation_type, confidence "
                f"FROM memory_edges WHERE from_id IN ({ph}) AND relation_type = ?",
                [*node_ids, relation],
            )
            edges.extend({"from": r[0], "to": r[1], "relation": r[2], "confidence": r[3]}
                         for r in self.cursor.fetchall())
        if direction in ("inbound", "both"):
            self.cursor.execute(
                f"SELECT from_id, to_id, relation_type, confidence "
                f"FROM memory_edges WHERE to_id IN ({ph}) AND relation_type = ?",
                [*node_ids, relation],
            )
            edges.extend({"from": r[0], "to": r[1], "relation": r[2], "confidence": r[3]}
                         for r in self.cursor.fetchall())
        return edges

    # ── public query tools ─────────────────────────────────────────────

    @_db_lock
    def trace_path(self, namespace: str, start: str, direction: str = "outbound",
                   relation: str = "calls", depth: int = 3, limit_per_node: int = 50) -> Dict[str, Any]:
        """BFS call-chain traversal from a start node.

        start: exact node_id, exact external_id, or a literal substring of the
               label/external_id. If multiple nodes match, returns an 'ambiguous'
               result with candidates (caller picks one and re-calls with node_id).
        direction: 'outbound' (what it calls) / 'inbound' (who calls it) / 'both'.
        relation: edge type to follow (default 'calls').
        depth: 1-5. limit_per_node: cap edges per frontier node. Hard cap 2000 nodes.
        """
        depth = max(1, min(int(depth or 3), 5))
        direction = (direction or "outbound").lower()
        if direction not in ("outbound", "inbound", "both"):
            direction = "outbound"
        relation = relation or "calls"
        limit_per_node = max(1, min(int(limit_per_node or 50), 200))

        cands = self._resolve_start_node(namespace, start)
        if not cands:
            return {"namespace": namespace, "start": start, "error": "no_match",
                    "message": f"No node matching '{start}' in namespace '{namespace}'."}
        if len(cands) > 1:
            return {"namespace": namespace, "start": start, "error": "ambiguous",
                    "message": f"{len(cands)} nodes match '{start}'. Re-call with an exact node_id.",
                    "candidates": [{"id": c["id"], "label": c["label"], "node_type": c["node_type"],
                                    "source_file": c["source_file"]} for c in cands[:30]]}

        start_node = cands[0]
        start_id = start_node["id"]
        nodes: Dict[str, Dict[str, Any]] = {start_id: start_node}
        edges: List[Dict[str, Any]] = []
        visited = {start_id}
        frontier = [start_id]
        frontier_set = {start_id}
        truncated = False
        depth_reached = 0

        for d in range(1, depth + 1):
            raw = self._batched_frontier(frontier, relation, direction)
            if not raw:
                break
            per: Dict[str, int] = {}
            new_ids: List[str] = []
            for e in raw:
                if direction == "outbound":
                    anchor, nxt = e["from"], e["to"]
                elif direction == "inbound":
                    anchor, nxt = e["to"], e["from"]
                else:  # both
                    if e["from"] in frontier_set:
                        anchor, nxt = e["from"], e["to"]
                    else:
                        anchor, nxt = e["to"], e["from"]
                cnt = per.get(anchor, 0)
                if cnt >= limit_per_node:
                    truncated = True
                    continue
                per[anchor] = cnt + 1
                edges.append({"from": e["from"], "to": e["to"], "relation": e["relation"],
                              "confidence": e.get("confidence"), "depth": d})
                if nxt not in visited:
                    visited.add(nxt)
                    new_ids.append(nxt)
            depth_reached = d
            if not new_ids:
                break
            if len(visited) > 2000:
                truncated = True
                break
            metas = self._fetch_node_metas(namespace, new_ids)
            nodes.update(metas)
            frontier = new_ids
            frontier_set = set(new_ids)

        return {
            "namespace": namespace, "start": start, "start_id": start_id,
            "direction": direction, "relation": relation, "depth_reached": depth_reached,
            "truncated": truncated, "node_count": len(nodes),
            "nodes": [{"id": v["id"], "label": v["label"], "node_type": v["node_type"],
                       "source_file": v["source_file"], "source_location": v["source_location"]}
                      for v in nodes.values()],
            "edges": edges,
        }

    @_db_lock
    def search_graph(self, namespace: str, node_type: Optional[str] = None,
                     source_file_regex: Optional[str] = None, name_regex: Optional[str] = None,
                     min_degree: Optional[int] = None, max_degree: Optional[int] = None,
                     limit: int = 50, offset: int = 0) -> Dict[str, Any]:
        """Structured filter over code nodes with pagination.

        node_type: one of {function, class, file, document, rationale, symbol}.
        source_file_regex / name_regex: Python re.search against source_file / label.
        min_degree / max_degree: inclusive bounds on total (in+out) degree.
        """
        limit = max(1, min(int(limit or 50), 500))
        offset = max(0, int(offset or 0))
        conditions = ["m.namespace = ?"]
        params: List[Any] = [namespace]
        if node_type:
            conditions.append("gn.node_type = ?")
            params.append(node_type)
        where = " AND ".join(conditions)
        self.cursor.execute(
            f"SELECT gn.id, gn.node_type, gn.source_file, gn.source_location, "
            f"gn.external_id, gn.community_id, m.content "
            f"FROM graph_nodes gn JOIN memory_fts m ON gn.id = m.id WHERE {where}",
            params,
        )
        rows = self.cursor.fetchall()
        deg = self._compute_degrees(namespace)
        src_re = re.compile(source_file_regex) if source_file_regex else None
        name_re = re.compile(name_regex) if name_regex else None

        filtered: List[Dict[str, Any]] = []
        for r in rows:
            cand = self._row_to_candidate(r)
            d = deg.get(r[0], {"in": 0, "out": 0, "total": 0})
            total = d["total"]
            if min_degree is not None and total < int(min_degree):
                continue
            if max_degree is not None and total > int(max_degree):
                continue
            if src_re and not src_re.search(r[2] or ""):
                continue
            if name_re and not name_re.search(cand["label"] or ""):
                continue
            filtered.append({**cand, "in_degree": d["in"], "out_degree": d["out"], "total_degree": total})

        total = len(filtered)
        page = filtered[offset:offset + limit]
        return {
            "namespace": namespace, "total": total, "limit": limit, "offset": offset,
            "results": [{"id": c["id"], "label": c["label"], "node_type": c["node_type"],
                         "source_file": c["source_file"], "source_location": c["source_location"],
                         "external_id": c["external_id"], "community_id": c["community_id"],
                         "in_degree": c["in_degree"], "out_degree": c["out_degree"],
                         "total_degree": c["total_degree"]} for c in page],
        }

    @_db_lock
    def get_architecture(self, namespace: str, hotspot_top: int = 20) -> Dict[str, Any]:
        """One-shot codebase overview: type counts, file/language breakdown,
        Louvain communities, degree hotspots, and entry-point candidates."""
        hotspot_top = max(1, min(int(hotspot_top or 20), 200))
        self.cursor.execute(
            "SELECT gn.node_type, COUNT(*) FROM graph_nodes gn "
            "JOIN memory_fts m ON gn.id = m.id WHERE m.namespace = ? GROUP BY gn.node_type",
            (namespace,),
        )
        node_type_counts = {(r[0] or "unknown"): r[1] for r in self.cursor.fetchall()}

        self.cursor.execute(
            "SELECT DISTINCT gn.source_file FROM graph_nodes gn JOIN memory_fts m ON gn.id = m.id "
            "WHERE m.namespace = ? AND gn.source_file IS NOT NULL AND gn.source_file != ''",
            (namespace,),
        )
        files = [r[0] for r in self.cursor.fetchall()]
        lang: Dict[str, int] = {}
        for f in files:
            ext = (os.path.splitext(f)[1] or "(none)").lower()
            lang[ext] = lang.get(ext, 0) + 1

        communities = self.list_communities(namespace)

        deg = self._compute_degrees(namespace)
        sorted_ids = sorted(deg.keys(), key=lambda k: deg[k]["total"], reverse=True)[:hotspot_top]
        hotspots: List[Dict[str, Any]] = []
        if sorted_ids:
            metas = self._fetch_node_metas(namespace, sorted_ids)
            for nid in sorted_ids:
                meta = metas.get(nid, {})
                d = deg[nid]
                hotspots.append({"id": nid, "label": meta.get("label", ""),
                                 "node_type": meta.get("node_type", ""),
                                 "source_file": meta.get("source_file", ""),
                                 "total_degree": d["total"], "in_degree": d["in"], "out_degree": d["out"]})

        self.cursor.execute(
            "SELECT gn.id, gn.source_file, gn.source_location, m.content "
            "FROM graph_nodes gn JOIN memory_fts m ON gn.id = m.id "
            "WHERE m.namespace = ? AND gn.node_type = 'function' "
            "AND gn.id NOT IN (SELECT to_id FROM memory_edges WHERE relation_type = 'calls') LIMIT 50",
            (namespace,),
        )
        entries = [{"id": r[0], "source_file": r[1], "source_location": r[2],
                    "label": _extract_label(r[3])} for r in self.cursor.fetchall()]

        return {
            "namespace": namespace,
            "node_type_counts": node_type_counts,
            "file_count": len(files),
            "language_breakdown": dict(sorted(lang.items(), key=lambda kv: kv[1], reverse=True)),
            "communities": communities,
            "hotspots": hotspots,
            "entry_point_candidates": entries,
        }

    @_db_lock
    def dead_code(self, namespace: str, limit: int = 500) -> Dict[str, Any]:
        """Function nodes with zero inbound calls/method/references edges.

        Heuristic (documented, not exact): a function counts as 'live' if any
        other node calls it, contains it as a method, or references it. Methods
        typed 'function' may still surface if graphify only emitted a 'method'
        edge from the class — the method check covers that. Real entry points
        (main, handlers) often appear here too; pair with entry_point_candidates
        from get_architecture to filter them."""
        limit = max(1, min(int(limit or 500), 2000))
        self.cursor.execute(
            "SELECT gn.id, gn.source_file, gn.source_location, m.content "
            "FROM graph_nodes gn JOIN memory_fts m ON gn.id = m.id "
            "WHERE m.namespace = ? AND gn.node_type = 'function' "
            "AND gn.id NOT IN (SELECT to_id FROM memory_edges "
            "                  WHERE relation_type IN ('calls', 'method', 'references')) LIMIT ?",
            (namespace, limit),
        )
        results = [{"id": r[0], "source_file": r[1], "source_location": r[2],
                    "label": _extract_label(r[3])} for r in self.cursor.fetchall()]
        return {"namespace": namespace, "dead_count": len(results),
                "heuristic": "function nodes with zero inbound calls/method/references edges",
                "results": results}

    @_db_lock
    def get_graph_schema(self, namespace: Optional[str] = None) -> Dict[str, Any]:
        """Introspection: extends get_graph_stats with per-node_type / per-relation
        counts, degree distribution, and a sample external_id."""
        base = self.get_graph_stats(namespace)
        if namespace:
            self.cursor.execute(
                "SELECT gn.node_type, COUNT(*) FROM graph_nodes gn "
                "JOIN memory_fts m ON gn.id = m.id WHERE m.namespace = ? GROUP BY gn.node_type",
                (namespace,),
            )
        else:
            self.cursor.execute("SELECT node_type, COUNT(*) FROM graph_nodes GROUP BY node_type")
        node_type_counts = {(r[0] or "unknown"): r[1] for r in self.cursor.fetchall()}

        self.cursor.execute("SELECT relation_type, COUNT(*) FROM memory_edges GROUP BY relation_type")
        relation_counts = {r[0]: r[1] for r in self.cursor.fetchall()}

        deg_dist = {"min": 0, "median": 0, "max": 0}
        sample_external_id = None
        if namespace:
            deg = self._compute_degrees(namespace)
            totals = sorted(v["total"] for v in deg.values())
            if totals:
                deg_dist = {"min": totals[0], "median": totals[len(totals) // 2], "max": totals[-1]}
            self.cursor.execute(
                "SELECT gn.external_id FROM graph_nodes gn JOIN memory_fts m ON gn.id = m.id "
                "WHERE m.namespace = ? AND gn.external_id IS NOT NULL AND gn.external_id != '' LIMIT 1",
                (namespace,),
            )
            row = self.cursor.fetchone()
            if row:
                sample_external_id = row[0]

        return {**base, "node_type_counts": node_type_counts,
                "relation_counts": relation_counts, "degree_distribution": deg_dist,
                "sample_external_id": sample_external_id}

    @_db_lock
    def get_code_snippet(self, namespace: str, node_id: Optional[str] = None,
                         qualified_name: Optional[str] = None, context_lines: int = 6) -> Dict[str, Any]:
        """Read numbered source lines for a symbol. Resolves by node_id first,
        else by qualified_name (same rules as trace_path's start). Reuses the
        engine's _read_source_snippet (handles L{N} parse + path resolution)."""
        context_lines = max(0, min(int(context_lines if context_lines is not None else 6), 50))
        node = None
        if node_id:
            self.cursor.execute(
                "SELECT gn.id, gn.node_type, gn.source_file, gn.source_location, m.content "
                "FROM graph_nodes gn JOIN memory_fts m ON gn.id = m.id "
                "WHERE m.namespace = ? AND gn.id = ?",
                (namespace, node_id),
            )
            r = self.cursor.fetchone()
            if r:
                node = {"id": r[0], "node_type": r[1], "source_file": r[2],
                        "source_location": r[3], "label": _extract_label(r[4])}
        if not node and qualified_name:
            cands = self._resolve_start_node(namespace, qualified_name)
            if cands:
                c = cands[0]
                node = {"id": c["id"], "node_type": c["node_type"], "source_file": c["source_file"],
                        "source_location": c["source_location"], "label": c["label"]}
        if not node:
            return {"namespace": namespace, "error": "not_found",
                    "message": "No node matched node_id/qualified_name in this namespace."}
        snippet = self._read_source_snippet(node["source_file"], node["source_location"],
                                            context_lines=context_lines)
        return {"namespace": namespace, "node_id": node["id"], "label": node["label"],
                "node_type": node["node_type"], "source_file": node["source_file"],
                "source_location": node["source_location"], "context_lines": context_lines,
                "snippet": snippet}

    # ── Tier 2: git diff → impacted symbols ────────────────────────────

    @_db_lock
    def detect_changes(self, namespace: str, base: str = "HEAD",
                       unified: bool = False, target_dir: Optional[str] = None) -> Dict[str, Any]:
        """Map uncommitted changes to affected graph symbols + blast radius.

        Uses `git -C <target_dir> diff --name-only <base>`. If git is absent
        (or the dir isn't a repo), falls back to comparing graph_manifest file
        hashes against live files and returns git_unavailable=true. Never raises.
        target_dir defaults to env CODEBASE_SOURCE_DIR or /workspace.
        """
        import shutil
        import subprocess

        target_dir = target_dir or os.environ.get("CODEBASE_SOURCE_DIR", "/workspace")
        changed_files: List[str] = []
        git_unavailable = False
        git_error = None

        git = shutil.which("git")
        if git:
            try:
                res = subprocess.run(
                    ["git", "-C", target_dir, "diff", "--name-only", base],
                    capture_output=True, text=True, timeout=30,
                )
                if res.returncode != 0:
                    raise RuntimeError(res.stderr.strip() or f"git exit {res.returncode}")
                rels = [ln.strip() for ln in res.stdout.splitlines() if ln.strip()]
                # Stored source_file is absolute under target_dir; normalise both.
                for rel in rels:
                    abs_path = os.path.normpath(os.path.join(target_dir, rel))
                    changed_files.append(abs_path)
            except Exception as e:  # not a git repo, timeout, etc → hash-diff
                git_unavailable = True
                git_error = str(e)
        else:
            git_unavailable = True
            git_error = "git not on PATH"

        if git_unavailable:
            manifest = self.get_manifest(namespace)  # {source_file: content_hash}
            for sf, old_hash in (manifest or {}).items():
                p = self._resolve_indexed_source_path(sf)
                if not p:
                    continue
                try:
                    with open(p, "rb") as fh:
                        h = hashlib.sha256(fh.read()).hexdigest()
                except OSError:
                    continue
                if h != old_hash:
                    changed_files.append(sf)

        # Map changed files → graph nodes (source_file IN changed set).
        impacted: List[Dict[str, Any]] = []
        if changed_files:
            # Match on trailing path segment too: stored path may differ in prefix.
            ph = ",".join("?" * len(changed_files))
            self.cursor.execute(
                f"SELECT DISTINCT gn.id, gn.node_type, gn.source_file, gn.source_location, m.content "
                f"FROM graph_nodes gn JOIN memory_fts m ON gn.id = m.id "
                f"WHERE m.namespace = ? AND gn.source_file IN ({ph})",
                [namespace, *changed_files],
            )
            impacted = [{"id": r[0], "node_type": r[1], "source_file": r[2],
                         "source_location": r[3], "label": _extract_label(r[4]), "kind": "changed"}
                        for r in self.cursor.fetchall()]

        # Blast radius: outbound calls/references, depth ≤ 2.
        impacted_ids = [n["id"] for n in impacted]
        seen = set(impacted_ids)
        radius_edges: List[Dict[str, Any]] = []
        caller_ids: List[str] = list(impacted_ids)
        for _ in range(2):
            if not caller_ids:
                break
            ph = ",".join("?" * len(caller_ids))
            self.cursor.execute(
                f"SELECT from_id, to_id, relation_type FROM memory_edges "
                f"WHERE from_id IN ({ph}) AND relation_type IN ('calls', 'references')",
                caller_ids,
            )
            nxt: List[str] = []
            for r in self.cursor.fetchall():
                radius_edges.append({"from": r[0], "to": r[1], "relation": r[2]})
                if r[1] not in seen:
                    seen.add(r[1])
                    nxt.append(r[1])
            caller_ids = nxt
        affected_count = len(seen) - len(impacted_ids)

        # Risk per impacted node by direct downstream count.
        downstream: Dict[str, int] = {}
        for nid in impacted_ids:
            self.cursor.execute(
                "SELECT COUNT(*) FROM memory_edges WHERE from_id = ? "
                "AND relation_type IN ('calls', 'references')",
                (nid,),
            )
            downstream[nid] = self.cursor.fetchone()[0]
        risk_summary = {"high": 0, "medium": 0, "low": 0}
        for n in impacted:
            dc = downstream.get(n["id"], 0)
            risk = "high" if dc > 5 else ("medium" if dc >= 1 else "low")
            n["risk"] = risk
            n["downstream_count"] = dc
            risk_summary[risk] += 1

        return {
            "namespace": namespace,
            "git_unavailable": git_unavailable,
            "git_error": git_error,
            "fallback": "hash_diff" if git_unavailable else None,
            "base": base,
            "target_dir": target_dir,
            "changed_files": changed_files,
            "impacted_nodes": impacted,
            "blast_radius": {"depth": 2, "affected_count": affected_count, "edges": radius_edges[:500]},
            "risk_summary": risk_summary,
        }

    # ── Tier 3: team-shared graph artifact ─────────────────────────────

    @_db_lock
    def build_team_artifact(self, namespace: str) -> Dict[str, Any]:
        """Export a namespace to a stable-path .json.gz the user can commit into
        their repo, so teammates restore (skip re-extraction + re-embedding).
        Wraps export_namespace + a checksum + node/edge counts; returns a manifest
        (no payload). The file lives at <data>/artifacts/<ns>.json.gz (overwritten
        each call so committed diffs stay small)."""
        import gzip
        import hashlib
        import json
        data = self.export_namespace(namespace)
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        checksum = hashlib.sha256(raw).hexdigest()
        data_dir = os.path.dirname(self.sqlite_path)
        art_dir = os.path.join(data_dir, "artifacts")
        os.makedirs(art_dir, exist_ok=True)
        safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in namespace)
        path = os.path.join(art_dir, f"{safe}.json.gz")
        with gzip.open(path, "wb") as f:
            f.write(raw)
        counts = data.get("counts", {})
        return {
            "namespace": namespace,
            "format": "agent-memory-backup",
            "checksum": checksum,
            "path": path,
            "size_bytes": os.path.getsize(path),
            "node_count": counts.get("graph_nodes", 0),
            "edge_count": counts.get("graph_edges", 0),
            "memory_count": counts.get("memories", 0),
            "exported_at": data.get("exported_at"),
            "note": ("Download via GET /api/graph/artifact?namespace=<ns>. Commit the "
                     "file into your repo; teammates restore via POST /api/graph/artifact/restore."),
        }

    def restore_team_artifact(self, file_path: str, target_namespace: Optional[str] = None) -> Dict[str, Any]:
        """Restore a namespace from a .json.gz produced by build_team_artifact (or
        GET /api/backup). REPLACE semantics: clears the target first, then re-imports
        with original ids/timestamps/vectors (no re-embedding)."""
        import gzip
        import json
        if not os.path.exists(file_path):
            raise FileNotFoundError(file_path)
        with gzip.open(file_path, "rb") as f:
            data = json.loads(f.read().decode("utf-8"))
        if not isinstance(data, dict) or data.get("format") != "agent-memory-backup":
            raise ValueError(f"not an agent-memory artifact: {file_path}")
        target = target_namespace or data.get("namespace")
        if not target:
            raise ValueError("artifact has no namespace and no target_namespace given")
        if self.is_protected(target):
            raise ValueError(f"target namespace '{target}' is protected (read-only)")
        return self.import_namespace(data, target_namespace=target)
