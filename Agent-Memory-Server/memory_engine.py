import sqlite3
import time
import os
from pathlib import Path
import chromadb
import litellm
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import threading
import functools

# Optional headroom-backed reversible compression (graceful no-op if unavailable).
# Imported defensively so a compression-module issue can never break the engine.
try:
    from compression import compress_text as _compress_text
except Exception:  # pragma: no cover - optional module
    _compress_text = None

def db_lock(func):
    @functools.wraps(func)
    def wrapper(self, *args, **kwargs):
        with self.lock:
            return func(self, *args, **kwargs)
    return wrapper


# ── Source-path confinement (path-traversal defense) ──────────────────────
# _resolve_indexed_source_path resolves graph_nodes.source_file to a real on-disk
# path. Without confinement, an attacker who calls /api/graph/import with a
# crafted source_file ("../../etc/passwd") can read arbitrary files: the snippet
# is stored as a memory and returned by /api/memory/search. These helpers limit
# resolution to an allowlist of roots.
#
# Default roots:
#   - /workspace                  (Docker code-repo mount point)
#   - engine file's parent dir   (local-dev relative paths)
# Extend via CODEBASE_SOURCE_ROOTS env var (comma-separated absolute paths).
def _allowed_source_roots() -> List[str]:
    roots: List[str] = []
    env_roots = os.environ.get("CODEBASE_SOURCE_ROOTS", "")
    for r in env_roots.split(","):
        r = r.strip()
        if r:
            roots.append(os.path.realpath(r))
    # /workspace is the default Docker mount point for the code repo.
    roots.append(os.path.realpath("/workspace"))
    # Engine's parent dir enables local-dev relative paths.
    roots.append(os.path.realpath(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    # Dedupe while preserving order.
    seen = set()
    out = []
    for r in roots:
        if r not in seen:
            seen.add(r)
            out.append(r)
    return out


def _is_within_roots(path: str, roots: List[str]) -> bool:
    """True if `path` is at or under one of `roots`. Caller must realpath the
    path first. Uses commonpath to be symlink-safe."""
    for root in roots:
        try:
            if os.path.commonpath([path, root]) == root:
                return True
        except ValueError:
            # Different drives (Windows) or other commonpath failure — skip.
            continue
    return False


def _count_tokens(text: str) -> int:
    """Token counter backed by litellm (already a project dependency).

    Replaces the prior len//4 heuristic which over-estimated CJK text budget
    by ~4x (Chinese chars are ~1 token each, not 0.25). Falls back to a
    CJK-aware heuristic if litellm is unavailable or errors on edge input.
    """
    if not text:
        return 0
    try:
        return int(litellm.token_counter(model="gpt-4o", text=text))
    except Exception:
        # Heuristic: CJK / fullwidth chars ≈ 1 token each, others ≈ 4 chars/token.
        cjk = sum(1 for c in text if ord(c) > 0x2E80)
        return cjk + (len(text) - cjk) // 4


class MemoryItem(BaseModel):
    id: str
    namespace: str
    content: str
    source: str
    timestamp: int
    score: float = 1.0

class MemoryEngine:
    # Anchor default data dir to THIS file's location so every entry point
    # (REST API, MCP server, CLI) reads/writes the SAME database regardless of cwd.
    _DEFAULT_DB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

    def __init__(self, db_dir: str = None):
        # Only accept absolute paths verbatim. Any relative path (incl. "./data")
        # is treated as a bare filename and resolved against the engine's own dir,
        # so a stray empty data/ can never be created or read from the wrong cwd.
        if db_dir is None or not os.path.isabs(db_dir):
            db_dir = self._DEFAULT_DB_DIR
        self.lock = threading.RLock()
        os.makedirs(db_dir, exist_ok=True)

        # 1. Initialize SQLite (FTS5 + Metadata)
        self.sqlite_path = os.path.join(db_dir, "agent_memory.db")
        self.conn = sqlite3.connect(self.sqlite_path, check_same_thread=False)
        self.cursor = self.conn.cursor()
        # WAL mode gives much better concurrent-read throughput (the backend
        # and MCP containers share this DB file) and pairs safely with
        # synchronous=NORMAL for write throughput. busy_timeout avoids
        # "database is locked" under the multi-process mount.
        try:
            self.cursor.execute("PRAGMA journal_mode=WAL")
            self.cursor.execute("PRAGMA synchronous=NORMAL")
            self.cursor.execute("PRAGMA busy_timeout=5000")
        except sqlite3.OperationalError:
            # PRAGMA may be rejected on some SQLite builds / networked FS —
            # engine stays functional with the default rollback journal.
            pass
        self._init_sqlite()

        # 2. Initialize ChromaDB (Vector Search)
        self._chroma_path = os.path.join(db_dir, "chroma_db")
        self.chroma_client = chromadb.PersistentClient(path=self._chroma_path)
        # We use a single collection, filtering by namespace via metadata
        self.collection = self.chroma_client.get_or_create_collection(name="agent_memory")
        
        # 3. Initialize Volatile Short-term Memory
        self.short_term_window_size = 10
        self._short_term_memory: Dict[str, List[Dict[str, Any]]] = {}

        # 4. Protected namespaces (read-only, no insert/update/delete)
        self.protected_namespaces: set = set()

    def protect_namespace(self, namespace: str) -> None:
        self.protected_namespaces.add(namespace)

    def unprotect_namespace(self, namespace: str) -> None:
        self.protected_namespaces.discard(namespace)

    def is_protected(self, namespace: str) -> bool:
        return namespace in self.protected_namespaces

    @db_lock
    def _init_sqlite(self):
        # Create FTS5 virtual table. FTS5 doesn't strictly support filtering by non-text columns efficiently 
        # out of the box, but we can store namespace and source as text and filter during the query.
        self.cursor.execute('''
            CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
                id, namespace, content, source, timestamp UNINDEXED
            )
        ''')
        # Create Working Memory table for key-value scratchpad storage
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS working_memory (
                namespace TEXT,
                key TEXT,
                value TEXT,
                timestamp INTEGER,
                PRIMARY KEY (namespace, key)
            )
        ''')
        # Create Memory Stats table for Importance Scoring
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS memory_stats (
                id TEXT PRIMARY KEY,
                access_count INTEGER DEFAULT 0,
                is_pinned INTEGER DEFAULT 0
            )
        ''')
        # Create Sessions table for Session Management
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS memory_sessions (
                id TEXT PRIMARY KEY,
                namespace TEXT,
                created_at INTEGER,
                last_active INTEGER
            )
        ''')
        self.conn.commit()

        # Migrate: add 'status' column to memory_sessions if missing
        self.cursor.execute("PRAGMA table_info(memory_sessions)")
        columns = [row[1] for row in self.cursor.fetchall()]
        if 'status' not in columns:
            self.cursor.execute("ALTER TABLE memory_sessions ADD COLUMN status TEXT DEFAULT 'active'")

        # Create Session-Memory junction table
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS session_memories (
                session_id TEXT,
                memory_id TEXT,
                created_at INTEGER,
                PRIMARY KEY (session_id, memory_id)
            )
        ''')
        # Create Memory Edges table for knowledge graph relations
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS memory_edges (
                from_id TEXT,
                to_id TEXT,
                relation_type TEXT,
                confidence REAL DEFAULT 1.0,
                created_at INTEGER,
                PRIMARY KEY (from_id, to_id, relation_type)
            )
        ''')
        self.cursor.execute('CREATE INDEX IF NOT EXISTS idx_edges_from ON memory_edges(from_id)')
        self.cursor.execute('CREATE INDEX IF NOT EXISTS idx_edges_to ON memory_edges(to_id)')
        # Graph node metadata table: distinguishes code entities from dialog memories
        # and stores Graphify provenance (source location, file type, community).
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS graph_nodes (
                id TEXT PRIMARY KEY,
                node_type TEXT,
                source_file TEXT,
                source_location TEXT,
                file_type TEXT,
                community_id INTEGER,
                external_id TEXT
            )
        ''')
        self.cursor.execute('CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes(node_type)')
        self.cursor.execute('CREATE INDEX IF NOT EXISTS idx_graph_nodes_community ON graph_nodes(community_id)')
        self.cursor.execute('CREATE INDEX IF NOT EXISTS idx_graph_nodes_external ON graph_nodes(external_id)')
        # Incremental-extraction manifest: records the content hash of every source
        # file last imported into a namespace, so re-extraction can skip unchanged
        # files (and their embeddings) instead of re-importing the whole graph.
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS graph_manifest (
                namespace TEXT,
                source_file TEXT,
                content_hash TEXT,
                imported_at INTEGER,
                PRIMARY KEY (namespace, source_file)
            )
        ''')
        self.conn.commit()

    @db_lock
    def insert_memory(self, doc_id: str, namespace: str, content: str, source: str, dedup_threshold: float = 0.0) -> str:
        """Insert a memory chunk into both SQLite and ChromaDB, with optional deduplication."""
        
        # 0. Deduplication Check
        if dedup_threshold > 0.0:
            # We want to check for semantic similarity using Chroma
            vector_results = self._safe_chroma_query(
                {
                    "query_texts": [content],
                    "n_results": 1,
                    "where": {"namespace": namespace},
                }
            )
            
            if vector_results and vector_results['ids'] and len(vector_results['ids'][0]) > 0:
                existing_id = vector_results['ids'][0][0]
                distance = vector_results['distances'][0][0]
                # In Chroma L2, lower distance is more similar. 
                # Let's map distance back to a 0.0-1.0 similarity score (simple heuristic used in hybrid_search)
                similarity = max(0.0, 1.0 - (distance / 2.0))
                
                if similarity >= dedup_threshold:
                    # It's a duplicate. Instead of inserting, update the existing one.
                    self.update_memory(existing_id, namespace, content, source)
                    return existing_id

        current_time = int(time.time())
        
        # 1. Insert into SQLite
        self.cursor.execute(
            "INSERT INTO memory_fts (id, namespace, content, source, timestamp) VALUES (?, ?, ?, ?, ?)",
            (doc_id, namespace, content, source, current_time)
        )
        self.cursor.execute(
            "INSERT OR IGNORE INTO memory_stats (id, access_count, is_pinned) VALUES (?, 0, 0)",
            (doc_id,)
        )
        self.conn.commit()

        # 2. Insert into ChromaDB
        self.collection.add(
            documents=[content],
            metadatas=[{"namespace": namespace, "source": source, "timestamp": current_time}],
            ids=[doc_id]
        )
        
        return doc_id

    @db_lock
    def freeze_snapshot(self, namespace: str, summary: str, doc_id: str) -> str:
        """A snapshot is a special high-priority memory."""
        # Source explicitly marked as 'snapshot'
        inserted_id = self.insert_memory(doc_id, namespace, summary, source="snapshot")
        self.set_pinned(inserted_id, True)
        return inserted_id

    @db_lock
    def update_memory(self, doc_id: str, namespace: str, content: str, source: str) -> bool:
        """Update an existing memory chunk in both SQLite and ChromaDB."""
        current_time = int(time.time())

        # 1. Update in SQLite (FTS5 doesn't support UPDATE easily, so we DELETE then INSERT)
        self.cursor.execute("DELETE FROM memory_fts WHERE id = ?", (doc_id,))
        self.cursor.execute(
            "INSERT INTO memory_fts (id, namespace, content, source, timestamp) VALUES (?, ?, ?, ?, ?)",
            (doc_id, namespace, content, source, current_time)
        )
        self.conn.commit()

        # 2. Update in ChromaDB
        self.collection.update(
            ids=[doc_id],
            documents=[content],
            metadatas=[{"namespace": namespace, "source": source, "timestamp": current_time}]
        )
        
        return True

    # =========================================================
    # Importance Scoring Operations
    # =========================================================

    @db_lock
    def record_access(self, doc_id: str) -> None:
        """Increment the access count for a specific memory."""
        self.cursor.execute(
            "UPDATE memory_stats SET access_count = access_count + 1 WHERE id = ?", 
            (doc_id,)
        )
        self.conn.commit()
        
    @db_lock
    def set_pinned(self, doc_id: str, is_pinned: bool) -> None:
        """Pin or unpin a specific memory."""
        pinned_val = 1 if is_pinned else 0
        self.cursor.execute(
            "UPDATE memory_stats SET is_pinned = ? WHERE id = ?", 
            (pinned_val, doc_id)
        )
        self.conn.commit()
        
    @db_lock
    def _get_stats(self, doc_id: str) -> dict:
        self.cursor.execute("SELECT access_count, is_pinned FROM memory_stats WHERE id = ?", (doc_id,))
        row = self.cursor.fetchone()
        if row:
            return {"access_count": row[0], "is_pinned": bool(row[1])}
        return {"access_count": 0, "is_pinned": False}

    @db_lock
    def _get_stats_batch(self, doc_ids: List[str]) -> Dict[str, dict]:
        """Batch-fetch stats for multiple ids in one query (avoids N+1 _get_stats).

        Returns a dict keyed by doc_id. Missing ids are simply absent from the
        result; callers should default with .get(id, {"access_count": 0, ...}).
        """
        if not doc_ids:
            return {}
        result: Dict[str, dict] = {}
        # SQLite caps bound variables per statement (default 999). Chunk to stay safe.
        for i in range(0, len(doc_ids), 500):
            chunk = doc_ids[i:i + 500]
            placeholders = ",".join(["?"] * len(chunk))
            self.cursor.execute(
                f"SELECT id, access_count, is_pinned FROM memory_stats WHERE id IN ({placeholders})",
                chunk,
            )
            for row in self.cursor.fetchall():
                result[row[0]] = {"access_count": row[1], "is_pinned": bool(row[2])}
        return result

    def _refresh_collection(self) -> None:
        """Re-open the ChromaDB client + collection from disk.

        A long-lived engine (e.g. the MCP server process) keeps a memory-mapped
        HNSW index. When ANOTHER process clears + re-imports the collection
        (a REST rebuild / sync), this process's mmap can diverge from disk and
        raise on the next query. Re-opening forces a fresh read of the index.
        Safe and data-preserving: same path + same collection name + same
        default embedding function.
        """
        self.chroma_client = chromadb.PersistentClient(path=self._chroma_path)
        self.collection = self.chroma_client.get_or_create_collection(name="agent_memory")

    def _safe_chroma_query(self, query_args: dict):
        """collection.query with one refresh+retry to heal a stale handle.

        If the first query fails (stale HNSW mmap after a cross-process rebuild),
        reopen the client and retry once. Re-raises if it still fails so the
        real error surfaces instead of being silently swallowed.
        """
        try:
            return self.collection.query(**query_args)
        except Exception as first_err:
            # Log the first failure's context so the root cause isn't lost
            # when the retry succeeds (previously the bare except swallowed it).
            import sys
            print(f"[memory_engine] _safe_chroma_query first attempt failed: "
                  f"{type(first_err).__name__}: {first_err}; refreshing collection and retrying",
                  file=sys.stderr)
            self._refresh_collection()
            return self.collection.query(**query_args)

    @db_lock
    def hybrid_search(self, namespace: str, query: str, top_k: int = 5) -> List[MemoryItem]:
        """Perform Hybrid Search: Keyword (FTS5) + Semantic (Chroma)."""
        if not query or query == "__all__" or query.strip() == "":
            # Return all memories of this namespace sorted by current decay score
            if namespace == "all":
                self.cursor.execute("SELECT id, namespace, content, source, timestamp FROM memory_fts")
            else:
                self.cursor.execute("SELECT id, namespace, content, source, timestamp FROM memory_fts WHERE namespace = ?", (namespace,))
            
            rows = self.cursor.fetchall()
            # Batch-prefetch stats for all rows (avoids N+1 _get_stats calls).
            stats_map = self._get_stats_batch([r[0] for r in rows])
            results_list = []
            current_time = int(time.time())
            import math
            for row in rows:
                doc_id, ns, content, source, timestamp = row
                stats = stats_map.get(doc_id, {"access_count": 0, "is_pinned": False})
                score = 1.0
                if source == "snapshot":
                    score *= 1.5
                score *= (1.0 + 0.1 * math.log1p(stats["access_count"]))
                if stats["is_pinned"]:
                    score *= 2.0
                age_seconds = current_time - int(timestamp)
                decay_factor = 0.5 ** (age_seconds / 2592000.0)
                score *= decay_factor
                
                results_list.append(MemoryItem(
                    id=doc_id,
                    namespace=ns,
                    content=content,
                    source=source,
                    timestamp=int(timestamp),
                    score=score
                ))
            # Sort by score descending (highest first)
            results_list.sort(key=lambda x: x.score, reverse=True)
            return results_list[:top_k]

        results: Dict[str, MemoryItem] = {}
        
        # 1. FTS5 Exact Match Search
        try:
            if namespace == "all":
                fts_query = f'content:"{query}"'
            else:
                fts_query = f'namespace:"{namespace}" AND content:"{query}"'
                
            self.cursor.execute(
                "SELECT id, namespace, content, source, timestamp FROM memory_fts WHERE memory_fts MATCH ? LIMIT ?", 
                (fts_query, top_k * 2)
            )
            for row in self.cursor.fetchall():
                doc_id = row[0]
                results[doc_id] = MemoryItem(
                    id=doc_id,
                    namespace=row[1],
                    content=row[2],
                    source=row[3],
                    timestamp=int(row[4]),
                    score=1.0 # FTS match gets base score 1.0
                )
        except sqlite3.OperationalError:
            pass # Ignore malformed FTS query issues

        # 2. Chroma Vector Search
        query_args = {
            "query_texts": [query],
            "n_results": top_k * 2
        }
        if namespace != "all":
            query_args["where"] = {"namespace": namespace}
            
        vector_results = self._safe_chroma_query(query_args)

        if vector_results and vector_results['ids'] and len(vector_results['ids']) > 0:
            ids = vector_results['ids'][0]
            docs = vector_results['documents'][0]
            metas = vector_results['metadatas'][0]
            distances = vector_results['distances'][0]
            
            for i, doc_id in enumerate(ids):
                # Distance to score (closer to 0 is better in Chroma L2, so we invert)
                # Max distance is usually around 1-2. Let's do a simple inversion:
                semantic_score = max(0.0, 1.0 - (distances[i] / 2.0))
                
                if doc_id in results:
                    # Boost score if both found
                    results[doc_id].score += semantic_score
                else:
                    results[doc_id] = MemoryItem(
                        id=doc_id,
                        namespace=metas[i].get("namespace", namespace),
                        content=docs[i],
                        source=metas[i].get("source", "unknown"),
                        timestamp=int(metas[i].get("timestamp", 0)),
                        score=semantic_score
                    )

        # 3. Apply Time Decay, Snapshot Boost, & Importance Scoring
        current_time = int(time.time())
        final_list = list(results.values())
        # Batch-prefetch stats for all result ids (avoids N+1 _get_stats calls).
        stats_map = self._get_stats_batch([item.id for item in final_list])
        for item in final_list:
            stats = stats_map.get(item.id, {"access_count": 0, "is_pinned": False})
            
            # Snapshots get a massive boost
            if item.source == "snapshot":
                item.score *= 1.5
                
            # Access count boost: log(1 + access_count) to smooth out extreme values
            import math
            item.score *= (1.0 + 0.1 * math.log1p(stats["access_count"]))
            
            # Pinned boost
            if stats["is_pinned"]:
                item.score *= 2.0
                
            # Time decay: reduce score slightly for older items
            # e.g., half-life of 30 days (2592000 seconds)
            age_seconds = current_time - item.timestamp
            decay_factor = 0.5 ** (age_seconds / 2592000.0)
            item.score *= decay_factor

        # 4. Sort by final score
        final_list.sort(key=lambda x: x.score, reverse=True)
        return final_list[:top_k]

    def _format_age(self, timestamp: int) -> str:
        diff = int(time.time()) - timestamp
        if diff < 60: return "just now"
        if diff < 3600: return f"{diff // 60} mins ago"
        if diff < 86400: return f"{diff // 3600} hours ago"
        return f"{diff // 86400} days ago"
        
    def _get_relevance(self, score: float) -> str:
        if score >= 1.5: return "critical"
        if score >= 0.8: return "high"
        if score >= 0.5: return "medium"
        return "low"

    @db_lock
    def pack_context(self, namespace: str, query: str, max_tokens: int = 2000, compress: bool = False) -> str:
        """
        Assemble the most relevant context within a given token budget using LLM-friendly XML.
        Approximate 1 token = 4 characters.

        When compress=True, each included memory's content is run through headroom
        (compression.compress_text) before packing — smaller blocks let more memories
        fit the budget. Each compressed block carries a `retrieve="..."` attribute so the
        LLM can call headroom_retrieve(key) for the full original. Degrades to the
        original text verbatim if headroom is unavailable. Aggregate compression stats
        are written to self.last_pack_stats for the REST/MCP layer to surface a ratio.
        """
        # Token budget tracked via litellm.token_counter (accurate for CJK).
        # The prior max_chars = max_tokens * 4 over-estimated Chinese by ~4x.
        # Over-fetch slightly to ensure we have enough good candidates
        top_k_fetch = max(10, max_tokens // 50)
        results = self.hybrid_search(namespace, query, top_k=top_k_fetch)

        if not results:
            return "<context></context>"

        do_compress = compress and _compress_text is not None
        header = "<context>\n"
        if do_compress:
            header = (
                "<context>\n"
                "<!-- Memory contents compressed by headroom. Each block's full original "
                "is available via headroom_retrieve(key) using its retrieve= attribute. -->\n"
            )
        packed_content = header
        current_tokens = _count_tokens(packed_content) + _count_tokens("</context>\n")
        added_chunks = 0
        orig_tokens = 0
        comp_tokens = 0

        for r in results:
            age = self._format_age(r.timestamp)
            relevance = self._get_relevance(r.score)

            content_to_use = r.content
            retrieve_attr = ""
            if do_compress:
                c = _compress_text(r.content)
                content_to_use = c["compressed"]
                orig_tokens += c.get("original_tokens", 0)
                comp_tokens += c.get("compressed_tokens", 0)
                if c.get("key"):
                    retrieve_attr = f' retrieve="{c["key"]}"'

            block = f'  <memory source="{r.source}" relevance="{relevance}" age="{age}"{retrieve_attr}>\n{content_to_use}\n  </memory>\n'
            block_tokens = _count_tokens(block)

            if current_tokens + block_tokens <= max_tokens:
                packed_content += block
                current_tokens += block_tokens
                added_chunks += 1
                # Record access for Importance Scoring
                self.record_access(r.id)
            else:
                # We skip chunks that don't fit entirely, no hard truncations.
                continue

        # Surface aggregate compression stats (read by the REST/MCP layer for ratio).
        # Done before the empty-fit early return so stats is never stale from a prior call.
        if do_compress:
            with self.lock:
                self.last_pack_stats = {
                    "original_tokens": orig_tokens,
                    "compressed_tokens": comp_tokens,
                    "ratio": round(comp_tokens / orig_tokens, 3) if orig_tokens else 1.0,
                    "method": "headroom",
                }

        if added_chunks == 0:
            return "<context></context>"

        packed_content += "</context>"
        return packed_content

    def add_short_term_memory(self, namespace: str, role: str, content: str) -> None:
        """
        Add a conversational turn to the short-term memory (sliding window).
        """
        if namespace not in self._short_term_memory:
            self._short_term_memory[namespace] = []
            
        self._short_term_memory[namespace].append({
            "role": role,
            "content": content,
            "timestamp": int(time.time())
        })
        
        # Maintain sliding window
        if len(self._short_term_memory[namespace]) > self.short_term_window_size:
            self._short_term_memory[namespace] = self._short_term_memory[namespace][-self.short_term_window_size:]

    def get_short_term_memory(self, namespace: str) -> List[Dict[str, Any]]:
        """
        Retrieve the short-term memory sliding window for a namespace.
        """
        return self._short_term_memory.get(namespace, [])

    def delete_short_term_memory(self, namespace: str, index: int) -> bool:
        """Delete a specific conversational turn from short-term memory by index."""
        if namespace in self._short_term_memory:
            try:
                self._short_term_memory[namespace].pop(index)
                return True
            except IndexError:
                return False
        return False

    def clear_short_term_memory(self, namespace: str) -> None:
        """Clear all conversational turns from short-term memory."""
        self._short_term_memory[namespace] = []

    @db_lock
    def consolidate_memory(self, namespace: str) -> Optional[str]:
        """
        Summarize the current short-term memory using an LLM and store it as a long-term memory.
        Clears the short-term memory after consolidation.
        """
        history = self.get_short_term_memory(namespace)
        if not history:
            return None

        # Build conversation string
        conversation = ""
        for msg in history:
            role = msg["role"].upper()
            content = msg["content"]
            conversation += f"{role}: {content}\n\n"

        prompt = f"""Please summarize the following conversation into concise, factual knowledge points that should be stored in long-term memory. Focus on user preferences, technical decisions, and important facts.

Conversation:
{conversation}
"""

        # Call LLM via litellm (supports OpenAI, Anthropic, Gemini, DeepSeek, etc. based on os.environ)
        model = os.environ.get("LLM_MODEL", "gpt-4o-mini") # Fallback to a fast model
        try:
            response = litellm.completion(
                model=model,
                messages=[{"role": "user", "content": prompt}]
            )
            summary = response.choices[0].message.content

            if summary:
                # Store the summary in long-term memory
                import uuid
                doc_id = str(uuid.uuid4())
                self.insert_memory(doc_id, namespace, summary, source="consolidation")
                
                # Clear short-term memory
                self._short_term_memory[namespace] = []
                return doc_id
        except Exception as e:
            print(f"Error during memory consolidation: {e}")
            return None
            
        return None

    # =========================================================
    # Working Memory (Scratchpad) Operations
    # =========================================================
    
    @db_lock
    def write_working_memory(self, namespace: str, key: str, value: str) -> None:
        """Set a value in the working memory scratchpad for a namespace."""
        current_time = int(time.time())
        self.cursor.execute('''
            INSERT INTO working_memory (namespace, key, value, timestamp)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(namespace, key) DO UPDATE SET
                value=excluded.value,
                timestamp=excluded.timestamp
        ''', (namespace, key, value, current_time))
        self.conn.commit()

    @db_lock
    def read_working_memory(self, namespace: str, key: str) -> Optional[str]:
        """Read a value from the working memory scratchpad."""
        self.cursor.execute('SELECT value FROM working_memory WHERE namespace=? AND key=?', (namespace, key))
        row = self.cursor.fetchone()
        if row:
            return row[0]
        return None

    @db_lock
    def list_working_memory(self, namespace: str) -> Dict[str, str]:
        """Get all working memory keys and values for a namespace."""
        self.cursor.execute('SELECT key, value FROM working_memory WHERE namespace=?', (namespace,))
        return {row[0]: row[1] for row in self.cursor.fetchall()}

    @db_lock
    def delete_working_memory(self, namespace: str, key: str) -> None:
        """Delete a specific key from the working memory scratchpad."""
        self.cursor.execute('DELETE FROM working_memory WHERE namespace=? AND key=?', (namespace, key))
        self.conn.commit()

    @db_lock
    def clear_working_memory(self, namespace: str) -> None:
        """Clear the entire working memory scratchpad for a namespace."""
        self.cursor.execute('DELETE FROM working_memory WHERE namespace=?', (namespace,))
        self.conn.commit()

    @db_lock
    def close(self):
        self.conn.close()

    @db_lock
    def active_forgetting(self, namespace: str, max_capacity: int = 10000) -> int:
        # Single JOIN replaces the prior N+1 pattern (one _get_stats + one
        # timestamp SELECT per memory). For 10k memories this drops ~20k
        # round-trips down to one.
        self.cursor.execute(
            'SELECT m.id, m.timestamp, s.access_count, s.is_pinned '
            'FROM memory_fts m '
            'LEFT JOIN memory_stats s ON m.id = s.id '
            'WHERE m.namespace = ?',
            (namespace,)
        )
        rows = self.cursor.fetchall()
        total_count = len(rows)
        if total_count <= max_capacity: return 0
        docs_to_delete = total_count - max_capacity
        scored_items = []
        current_time = int(time.time())
        import math
        for doc_id, timestamp, access_count, is_pinned in rows:
            if is_pinned: continue
            if timestamp is None: continue
            score = 1.0
            score *= (1.0 + 0.1 * math.log1p(access_count or 0))
            age_seconds = current_time - timestamp
            decay_factor = 0.5 ** (age_seconds / 2592000.0)
            score *= decay_factor
            scored_items.append({'id': doc_id, 'score': score})
        scored_items.sort(key=lambda x: x['score'])
        delete_ids = [item['id'] for item in scored_items[:docs_to_delete]]
        if delete_ids:
            placeholders = ','.join(['?'] * len(delete_ids))
            self.cursor.execute(f'DELETE FROM memory_fts WHERE id IN ({placeholders})', delete_ids)
            self.cursor.execute(f'DELETE FROM memory_stats WHERE id IN ({placeholders})', delete_ids)
            self.conn.commit()
            self.collection.delete(ids=delete_ids)
        return len(delete_ids)

    @db_lock
    def clear_namespace(self, namespace: str) -> int:
        """Wipe ALL nodes, edges, and vectors for a namespace.

        Used to reset a code graph before re-importing an updated codebase
        (sync) so re-extraction does not pile duplicates on top of the old
        graph. Returns the number of nodes removed.
        """
        self.cursor.execute("SELECT id FROM memory_fts WHERE namespace=?", (namespace,))
        ids = [row[0] for row in self.cursor.fetchall()]
        if not ids:
            return 0
        removed = self._delete_nodes_by_ids(ids)
        self.conn.commit()
        return removed

    def _delete_nodes_by_ids(self, ids):
        """Delete a set of node ids from all stores (vectors, edges, metadata, fts).

        Shared by clear_namespace (whole namespace) and clear_files_in_namespace
        (a subset of source files within a namespace).
        """
        if not ids:
            return 0
        for i in range(0, len(ids), 500):
            self.collection.delete(ids=ids[i:i + 500])
        # SQLite caps the number of bound variables per statement (default 999,
        # up to 32766). A large namespace yields 20k+ ids — the edges delete
        # alone would bind 40k. Batch every delete in chunks of 500 so we never
        # blow the limit (which raises OperationalError mid-transaction and
        # corrupts the clear).
        batch = 500
        for i in range(0, len(ids), batch):
            chunk = ids[i:i + batch]
            ph = ",".join(["?"] * len(chunk))
            self.cursor.execute(
                f"DELETE FROM memory_edges WHERE from_id IN ({ph}) OR to_id IN ({ph})",
                chunk + chunk,
            )
            self.cursor.execute(f"DELETE FROM graph_nodes WHERE id IN ({ph})", chunk)
            self.cursor.execute(f"DELETE FROM memory_stats WHERE id IN ({ph})", chunk)
            self.cursor.execute(f"DELETE FROM memory_fts WHERE id IN ({ph})", chunk)
        return len(ids)

    @db_lock
    def clear_namespace_all(self, namespace: str) -> int:
        """Wipe EVERYTHING for a namespace — the five stores clear_namespace
        already covers (vectors, fts, stats, edges, graph_nodes) PLUS the four
        it omits (working_memory, memory_sessions, session_memories,
        graph_manifest). Used by restore so an import is a faithful REPLACE,
        not a union with whatever was there before. Returns node count removed.
        """
        self.cursor.execute("SELECT id FROM memory_fts WHERE namespace=?", (namespace,))
        ids = [row[0] for row in self.cursor.fetchall()]
        self.cursor.execute("SELECT id FROM memory_sessions WHERE namespace=?", (namespace,))
        session_ids = [row[0] for row in self.cursor.fetchall()]

        removed = self._delete_nodes_by_ids(ids)  # chroma/edges/graph_nodes/stats/fts
        if session_ids:
            placeholders = ",".join(["?"] * len(session_ids))
            self.cursor.execute(
                f"DELETE FROM session_memories WHERE session_id IN ({placeholders})",
                session_ids,
            )
        self.cursor.execute("DELETE FROM working_memory WHERE namespace=?", (namespace,))
        self.cursor.execute("DELETE FROM memory_sessions WHERE namespace=?", (namespace,))
        self.cursor.execute("DELETE FROM graph_manifest WHERE namespace=?", (namespace,))
        self.conn.commit()
        return removed

    @db_lock
    def export_namespace(self, namespace: str) -> dict:
        """Export a complete, portable snapshot of a namespace: every memory
        (content + stats + its raw ChromaDB embedding), graph nodes/edges, the
        extraction manifest, sessions, and working memory. Short-term memory is
        intentionally excluded (volatile by design). The returned dict is the
        single source of truth consumed by all three entry points (REST / MCP /
        CLI) for serialization.

        Vectors are exported verbatim so restore can re-add them with
        `embeddings=` and skip re-embedding entirely.
        """
        # 1. Core memories: content lives in memory_fts, stats alongside.
        self.cursor.execute(
            "SELECT id, content, source, timestamp FROM memory_fts WHERE namespace=?",
            (namespace,),
        )
        fts_rows = self.cursor.fetchall()
        ids = [r[0] for r in fts_rows]

        stats_map = {}
        if ids:
            placeholders = ",".join(["?"] * len(ids))
            self.cursor.execute(
                f"SELECT id, access_count, is_pinned FROM memory_stats WHERE id IN ({placeholders})",
                ids,
            )
            for sid, ac, pin in self.cursor.fetchall():
                stats_map[sid] = (ac or 0, int(pin or 0))

        # 2. Raw embeddings from ChromaDB keyed by id (batched to stay safe on
        # very large namespaces). include=["embeddings"] pulls the stored vector
        # back out verbatim.
        emb_map = {}
        for i in range(0, len(ids), 500):
            batch = ids[i:i + 500]
            try:
                got = self.collection.get(ids=batch, include=["embeddings"])
            except Exception:
                got = {}
            got_ids = got.get("ids") or []
            got_embs = got.get("embeddings")
            if got_embs is None:
                got_embs = []
            for bid, emb in zip(got_ids, got_embs):
                # Normalize to a plain Python float list: chroma may hand back
                # numpy arrays, which json.dumps cannot serialize.
                emb_map[bid] = [float(x) for x in emb] if emb is not None else None

        memories = []
        for mid, content, source, ts in fts_rows:
            ac, pin = stats_map.get(mid, (0, 0))
            memories.append({
                "id": mid,
                "content": content,
                "source": source,
                "timestamp": ts,
                "access_count": ac,
                "is_pinned": pin,
                "embedding": emb_map.get(mid),  # None if the vector is missing
            })

        # 3. Graph provenance + edges. Edges belong to the namespace whose node
        # originates them (from_id in the namespace's id set).
        graph_nodes = []
        edges = []
        if ids:
            placeholders = ",".join(["?"] * len(ids))
            self.cursor.execute(
                f"SELECT id, node_type, source_file, source_location, file_type, "
                f"community_id, external_id FROM graph_nodes WHERE id IN ({placeholders})",
                ids,
            )
            for r in self.cursor.fetchall():
                graph_nodes.append({
                    "id": r[0], "node_type": r[1], "source_file": r[2],
                    "source_location": r[3], "file_type": r[4],
                    "community_id": r[5], "external_id": r[6],
                })
            self.cursor.execute(
                f"SELECT from_id, to_id, relation_type, confidence, created_at "
                f"FROM memory_edges WHERE from_id IN ({placeholders})",
                ids,
            )
            for r in self.cursor.fetchall():
                edges.append({
                    "from_id": r[0], "to_id": r[1], "relation": r[2],
                    "confidence": r[3], "created_at": r[4],
                })

        # 4. Manifest, sessions (+ links), working memory.
        self.cursor.execute(
            "SELECT source_file, content_hash, imported_at FROM graph_manifest WHERE namespace=?",
            (namespace,),
        )
        manifest = [{"source_file": r[0], "content_hash": r[1], "imported_at": r[2]}
                    for r in self.cursor.fetchall()]

        self.cursor.execute(
            "SELECT id, created_at, last_active, status FROM memory_sessions WHERE namespace=?",
            (namespace,),
        )
        session_rows = self.cursor.fetchall()
        sessions = [{"id": r[0], "created_at": r[1], "last_active": r[2], "status": r[3]}
                    for r in session_rows]
        session_ids = [s["id"] for s in sessions]
        session_memories = []
        if session_ids:
            placeholders = ",".join(["?"] * len(session_ids))
            self.cursor.execute(
                f"SELECT session_id, memory_id, created_at FROM session_memories "
                f"WHERE session_id IN ({placeholders})",
                session_ids,
            )
            for r in self.cursor.fetchall():
                session_memories.append({"session_id": r[0], "memory_id": r[1], "created_at": r[2]})

        self.cursor.execute(
            "SELECT key, value, timestamp FROM working_memory WHERE namespace=?",
            (namespace,),
        )
        working = [{"key": r[0], "value": r[1], "timestamp": r[2]} for r in self.cursor.fetchall()]

        return {
            "format": "agent-memory-backup",
            "version": 1,
            "exported_at": int(time.time()),
            "namespace": namespace,
            "counts": {
                "memories": len(memories),
                "graph_nodes": len(graph_nodes),
                "graph_edges": len(edges),
                "graph_manifest": len(manifest),
                "sessions": len(sessions),
                "session_memories": len(session_memories),
                "working_memory": len(working),
            },
            "memories": memories,
            "graph_nodes": graph_nodes,
            "graph_edges": edges,
            "graph_manifest": manifest,
            "sessions": sessions,
            "session_memories": session_memories,
            "working_memory": working,
        }

    @db_lock
    def import_namespace(self, data: dict, target_namespace: str = None, progress_callback=None) -> dict:
        """Restore a namespace from an export_namespace() snapshot.

        REPLACE semantics: the target namespace is cleared fully first
        (clear_namespace_all), then every row is re-inserted with its ORIGINAL
        doc_id / timestamp / access_count / is_pinned / community_id preserved.
        Because ids are preserved, graph edges need no external_id re-resolution
        (from_id/to_id are already internal ids) and dedup is disabled. Chroma
        vectors are re-added with `embeddings=` so no re-embedding happens — a
        9k-node restore is seconds, not minutes.

        target_namespace defaults to the snapshot's own namespace; set it to
        import into a DIFFERENT namespace (copy/migrate). Protected-namespace
        checks are the caller's responsibility.
        """
        def report(stage, current, total, message):
            if progress_callback:
                progress_callback(stage, current, total, message)

        if not isinstance(data, dict) or data.get("format") != "agent-memory-backup":
            raise ValueError("Not an agent-memory backup (missing/invalid 'format' field)")
        target = target_namespace or data.get("namespace")
        if not target:
            raise ValueError("Backup has no namespace and no target_namespace given")

        memories = data.get("memories", [])
        total_units = len(memories) or 1
        report("clear", 0, 1, f"清空目标 namespace '{target}'...")
        self.clear_namespace_all(target)
        report("clear", 1, 1, "已清空")

        # 1. memories -> memory_fts + memory_stats (preserve original values)
        report("sqlite", 0, total_units, "写入记忆 (FTS + stats)...")
        if memories:
            fts_rows = [
                (m["id"], target, m.get("content", ""), m.get("source", ""), m.get("timestamp", 0))
                for m in memories
            ]
            stats_rows = [
                (m["id"], m.get("access_count", 0), m.get("is_pinned", 0))
                for m in memories
            ]
            self.cursor.executemany(
                "INSERT INTO memory_fts (id, namespace, content, source, timestamp) VALUES (?, ?, ?, ?, ?)",
                fts_rows,
            )
            self.cursor.executemany(
                "INSERT OR REPLACE INTO memory_stats (id, access_count, is_pinned) VALUES (?, ?, ?)",
                stats_rows,
            )
            self.conn.commit()
        report("sqlite", total_units, total_units, "FTS + stats 写入完成")

        # 2. chroma vectors — skip re-embedding when an embedding is present.
        # Embeddings are the bulk of the snapshot's memory (~384 floats each);
        # release each one right after its batch is written so the resident
        # footprint ramps DOWN as the chroma index ramps UP (avoids OOM on
        # large namespaces restored into an already-populated collection).
        report("chroma", 0, total_units, "写入 ChromaDB 向量...")
        with_emb = [m for m in memories if m.get("embedding") is not None]
        without_emb = [m for m in memories if m.get("embedding") is None]
        batch_size = 200
        for start in range(0, len(with_emb), batch_size):
            batch = with_emb[start:start + batch_size]
            self.collection.add(
                ids=[m["id"] for m in batch],
                documents=[m.get("content", "") for m in batch],
                metadatas=[{"namespace": target, "source": m.get("source", ""),
                            "timestamp": m.get("timestamp", 0)} for m in batch],
                embeddings=[m["embedding"] for m in batch],
            )
            # Free this batch's float lists now that chroma has them.
            for m in batch:
                m["embedding"] = None
            done = min(start + batch_size, len(with_emb))
            report("chroma", done, total_units, f"向量进度 {done}/{len(with_emb)}")
        # Fall back: memories whose vector was missing in the export get embedded now.
        for start in range(0, len(without_emb), batch_size):
            batch = without_emb[start:start + batch_size]
            self.collection.add(
                ids=[m["id"] for m in batch],
                documents=[m.get("content", "") for m in batch],
                metadatas=[{"namespace": target, "source": m.get("source", ""),
                            "timestamp": m.get("timestamp", 0)} for m in batch],
            )
        report("chroma", total_units, total_units, "ChromaDB 写入完成")

        # 3. graph nodes (preserve community_id / external_id), edges, manifest
        report("graph", 0, 1, "写入图谱节点...")
        gn = data.get("graph_nodes", [])
        if gn:
            self.cursor.executemany(
                "INSERT OR REPLACE INTO graph_nodes (id, node_type, source_file, source_location, "
                "file_type, community_id, external_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [(n.get("id"), n.get("node_type"), n.get("source_file"), n.get("source_location"),
                  n.get("file_type"), n.get("community_id"), n.get("external_id")) for n in gn],
            )
        edges = data.get("graph_edges", [])
        if edges:
            self.cursor.executemany(
                "INSERT OR IGNORE INTO memory_edges (from_id, to_id, relation_type, confidence, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                [(e.get("from_id"), e.get("to_id"), e.get("relation"), e.get("confidence", 1.0),
                  e.get("created_at")) for e in edges],
            )
        manifest = data.get("graph_manifest", [])
        if manifest:
            self.cursor.executemany(
                "INSERT OR REPLACE INTO graph_manifest (namespace, source_file, content_hash, imported_at) "
                "VALUES (?, ?, ?, ?)",
                [(target, m.get("source_file"), m.get("content_hash"), m.get("imported_at")) for m in manifest],
            )
        self.conn.commit()
        report("graph", 1, 1, f"图谱写入完成: {len(gn)} 节点 / {len(edges)} 边")

        # 4. sessions + links + working memory
        report("sessions", 0, 1, "写入 sessions / working memory...")
        sessions = data.get("sessions", [])
        if sessions:
            self.cursor.executemany(
                "INSERT OR REPLACE INTO memory_sessions (id, namespace, created_at, last_active, status) "
                "VALUES (?, ?, ?, ?, ?)",
                [(s.get("id"), target, s.get("created_at"), s.get("last_active"), s.get("status", "active"))
                 for s in sessions],
            )
        sm = data.get("session_memories", [])
        if sm:
            self.cursor.executemany(
                "INSERT OR IGNORE INTO session_memories (session_id, memory_id, created_at) VALUES (?, ?, ?)",
                [(x.get("session_id"), x.get("memory_id"), x.get("created_at")) for x in sm],
            )
        wm = data.get("working_memory", [])
        if wm:
            self.cursor.executemany(
                "INSERT OR REPLACE INTO working_memory (namespace, key, value, timestamp) VALUES (?, ?, ?, ?)",
                [(target, w.get("key"), w.get("value"), w.get("timestamp")) for w in wm],
            )
        self.conn.commit()
        report("complete", 1, 1, "恢复完成")

        return {
            "namespace": target,
            "memories_imported": len(memories),
            "graph_nodes_imported": len(gn),
            "edges_imported": len(edges),
            "sessions_imported": len(sessions),
            "working_memory_imported": len(wm),
        }

    @db_lock
    def clear_files_in_namespace(self, namespace: str, source_files) -> int:
        """Delete ONLY the nodes belonging to the given source files within a
        namespace (not the whole namespace). Used by incremental extraction to
        reset changed/deleted files before re-importing them. Returns node count.
        """
        source_files = [sf for sf in source_files if sf]
        if not source_files:
            return 0
        # Nodes for a file live in graph_nodes.source_file; their ids are the same
        # as the memory_fts ids (doc_id).
        placeholders = ",".join(["?"] * len(source_files))
        self.cursor.execute(
            f"SELECT id FROM graph_nodes WHERE source_file IN ({placeholders}) "
            f"AND id IN (SELECT id FROM memory_fts WHERE namespace=?)",
            [*source_files, namespace],
        )
        ids = [row[0] for row in self.cursor.fetchall()]
        removed = self._delete_nodes_by_ids(ids)
        self.conn.commit()
        return removed

    @db_lock
    def get_manifest(self, namespace: str) -> dict:
        """Return {source_file: content_hash} for the last import into a namespace."""
        self.cursor.execute(
            "SELECT source_file, content_hash FROM graph_manifest WHERE namespace=?",
            (namespace,),
        )
        return {row[0]: row[1] for row in self.cursor.fetchall()}

    @db_lock
    def upsert_manifest(self, namespace: str, file_hashes: dict, imported_at: int):
        """Record/update content hashes for files just imported into a namespace."""
        rows = [(namespace, sf, h, imported_at) for sf, h in file_hashes.items()]
        self.cursor.executemany(
            "INSERT OR REPLACE INTO graph_manifest (namespace, source_file, content_hash, imported_at) "
            "VALUES (?, ?, ?, ?)",
            rows,
        )
        self.conn.commit()

    @db_lock
    def remove_manifest(self, namespace: str, source_files):
        """Drop manifest entries for files no longer present in the codebase."""
        source_files = [sf for sf in source_files if sf]
        if not source_files:
            return
        placeholders = ",".join(["?"] * len(source_files))
        self.cursor.execute(
            f"DELETE FROM graph_manifest WHERE namespace=? AND source_file IN ({placeholders})",
            [namespace, *source_files],
        )
        self.conn.commit()

    # =========================================================
    # Session Management Operations
    # =========================================================

    @db_lock
    def create_session(self, namespace: str, session_id: str = None) -> str:
        import uuid
        sid = session_id or str(uuid.uuid4())
        current_time = int(time.time())
        self.cursor.execute(
            "INSERT INTO memory_sessions (id, namespace, created_at, last_active, status) VALUES (?, ?, ?, ?, 'active')",
            (sid, namespace, current_time, current_time)
        )
        self.conn.commit()
        return sid

    @db_lock
    def list_sessions(self, namespace: str, status: str = None) -> List[Dict[str, Any]]:
        if status:
            self.cursor.execute(
                "SELECT id, namespace, created_at, last_active, status FROM memory_sessions WHERE namespace=? AND status=? ORDER BY last_active DESC",
                (namespace, status)
            )
        else:
            self.cursor.execute(
                "SELECT id, namespace, created_at, last_active, status FROM memory_sessions WHERE namespace=? ORDER BY last_active DESC",
                (namespace,)
            )
        return [{"id": r[0], "namespace": r[1], "created_at": r[2], "last_active": r[3], "status": r[4]} for r in self.cursor.fetchall()]

    @db_lock
    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        self.cursor.execute(
            "SELECT id, namespace, created_at, last_active, status FROM memory_sessions WHERE id=?",
            (session_id,)
        )
        row = self.cursor.fetchone()
        if row:
            return {"id": row[0], "namespace": row[1], "created_at": row[2], "last_active": row[3], "status": row[4]}
        return None

    @db_lock
    def update_session_status(self, session_id: str, status: str) -> bool:
        current_time = int(time.time())
        self.cursor.execute(
            "UPDATE memory_sessions SET status=?, last_active=? WHERE id=?",
            (status, current_time, session_id)
        )
        self.conn.commit()
        return self.cursor.rowcount > 0

    @db_lock
    def link_memory_to_session(self, session_id: str, memory_id: str) -> bool:
        current_time = int(time.time())
        self.cursor.execute(
            "INSERT OR IGNORE INTO session_memories (session_id, memory_id, created_at) VALUES (?, ?, ?)",
            (session_id, memory_id, current_time)
        )
        self.cursor.execute(
            "UPDATE memory_sessions SET last_active=? WHERE id=?",
            (current_time, session_id)
        )
        self.conn.commit()
        return True

    @db_lock
    def unlink_memory_from_session(self, session_id: str, memory_id: str) -> bool:
        self.cursor.execute(
            "DELETE FROM session_memories WHERE session_id=? AND memory_id=?",
            (session_id, memory_id)
        )
        self.conn.commit()
        return self.cursor.rowcount > 0

    @db_lock
    def get_session_memories(self, session_id: str) -> List[Dict[str, Any]]:
        # Single JOIN replaces the prior N+1 pattern (one SELECT per link).
        self.cursor.execute(
            "SELECT sm.memory_id, sm.created_at, m.content, m.source, m.timestamp "
            "FROM session_memories sm "
            "LEFT JOIN memory_fts m ON sm.memory_id = m.id "
            "WHERE sm.session_id = ?",
            (session_id,)
        )
        result = []
        for memory_id, linked_at, content, source, timestamp in self.cursor.fetchall():
            if content is None:
                # memory was deleted; keep the link record but skip it in results
                continue
            result.append({
                "id": memory_id,
                "content": content,
                "source": source,
                "timestamp": timestamp,
                "linked_at": linked_at,
            })
        return result

    @db_lock
    def get_session_context(self, session_id: str, max_tokens: int = 2000) -> str:
        session = self.get_session(session_id)
        if not session:
            return "<context></context>"

        memories = self.get_session_memories(session_id)
        if not memories:
            return "<context></context>"

        packed_content = f'<context session_id="{session_id}">\n'
        # Token budget tracked via litellm.token_counter (accurate for CJK);
        # the prior max_chars = max_tokens * 4 over-estimated Chinese by ~4x.
        current_tokens = _count_tokens(packed_content) + _count_tokens("</context>\n")

        for mem in memories:
            age = self._format_age(mem["timestamp"])
            block = f'  <memory source="{mem["source"]}" age="{age}">\n{mem["content"]}\n  </memory>\n'
            block_tokens = _count_tokens(block)
            if current_tokens + block_tokens <= max_tokens:
                packed_content += block
                current_tokens += block_tokens

        packed_content += "</context>"
        return packed_content

    @db_lock
    def delete_session(self, session_id: str) -> bool:
        self.cursor.execute("DELETE FROM session_memories WHERE session_id=?", (session_id,))
        self.cursor.execute("DELETE FROM memory_sessions WHERE id=?", (session_id,))
        self.conn.commit()
        return self.cursor.rowcount > 0

    # =========================================================
    # Knowledge Graph Operations (Graphify Integration)
    # =========================================================

    @db_lock
    def add_edge(self, from_id: str, to_id: str, relation_type: str, confidence: float = 1.0) -> bool:
        current_time = int(time.time())
        self.cursor.execute(
            '''INSERT OR REPLACE INTO memory_edges (from_id, to_id, relation_type, confidence, created_at)
               VALUES (?, ?, ?, ?, ?)''',
            (from_id, to_id, relation_type, confidence, current_time)
        )
        self.conn.commit()
        return True

    @db_lock
    def remove_edge(self, from_id: str, to_id: str, relation_type: str) -> bool:
        self.cursor.execute(
            "DELETE FROM memory_edges WHERE from_id=? AND to_id=? AND relation_type=?",
            (from_id, to_id, relation_type)
        )
        self.conn.commit()
        return self.cursor.rowcount > 0

    @db_lock
    def get_neighbors(self, node_id: str, relation_type: str = None, direction: str = "both", limit: int = 50) -> List[Dict[str, Any]]:
        results = []
        if direction in ("out", "both"):
            if relation_type:
                self.cursor.execute(
                    "SELECT to_id, relation_type, confidence, created_at FROM memory_edges WHERE from_id=? AND relation_type=? LIMIT ?",
                    (node_id, relation_type, limit)
                )
            else:
                self.cursor.execute(
                    "SELECT to_id, relation_type, confidence, created_at FROM memory_edges WHERE from_id=? LIMIT ?",
                    (node_id, limit)
                )
            for row in self.cursor.fetchall():
                results.append({"id": row[0], "relation": row[1], "confidence": row[2], "direction": "out", "created_at": row[3]})

        if direction in ("in", "both"):
            if relation_type:
                self.cursor.execute(
                    "SELECT from_id, relation_type, confidence, created_at FROM memory_edges WHERE to_id=? AND relation_type=? LIMIT ?",
                    (node_id, relation_type, limit)
                )
            else:
                self.cursor.execute(
                    "SELECT from_id, relation_type, confidence, created_at FROM memory_edges WHERE to_id=? LIMIT ?",
                    (node_id, limit)
                )
            for row in self.cursor.fetchall():
                results.append({"id": row[0], "relation": row[1], "confidence": row[2], "direction": "in", "created_at": row[3]})

        return results

    @db_lock
    def get_node_detail(self, node_id: str) -> Optional[Dict[str, Any]]:
        """Get a memory node with all its edges."""
        # Get the memory content
        self.cursor.execute("SELECT id, namespace, content, source, timestamp FROM memory_fts WHERE id=?", (node_id,))
        row = self.cursor.fetchone()
        if not row:
            return None
        node = {"id": row[0], "namespace": row[1], "content": row[2], "source": row[3], "timestamp": row[4]}
        node["edges"] = self.get_neighbors(node_id)
        return node

    @db_lock
    def precise_source_search(
        self,
        namespace: str,
        query: str,
        max_results: int = 8,
        context_lines: int = 4,
    ) -> List[Dict[str, Any]]:
        """Search exact terms inside source files referenced by graph nodes.

        This fills the gap between graph summaries and full-file reads: agents can
        retrieve line-numbered snippets for formulas, API payloads, constants, and
        other details without opening every related source file.
        """
        query = (query or "").strip()
        if not query:
            return []

        max_results = max(1, min(int(max_results), 50))
        context_lines = max(0, min(int(context_lines), 20))
        terms = [query.lower()]
        for term in query.replace('"', " ").replace("'", " ").split():
            term = term.strip().lower()
            if term and term not in terms:
                terms.append(term)

        if namespace == "all":
            self.cursor.execute(
                '''SELECT DISTINCT gn.source_file
                   FROM graph_nodes gn
                   WHERE gn.source_file IS NOT NULL AND gn.source_file != ''
                   ORDER BY gn.source_file'''
            )
        else:
            self.cursor.execute(
                '''SELECT DISTINCT gn.source_file
                   FROM graph_nodes gn
                   JOIN memory_fts m ON gn.id = m.id
                   WHERE m.namespace = ?
                     AND gn.source_file IS NOT NULL
                     AND gn.source_file != ''
                   ORDER BY gn.source_file''',
                (namespace,),
            )

        source_files = [row[0] for row in self.cursor.fetchall()]
        results: List[Dict[str, Any]] = []
        seen_files = set()

        for source_file in source_files:
            path = self._resolve_indexed_source_path(source_file)
            if not path or path in seen_files:
                continue
            seen_files.add(path)

            try:
                with open(path, "r", encoding="utf-8", errors="replace") as fh:
                    lines = fh.readlines()
            except OSError:
                continue

            for idx, line in enumerate(lines):
                line_lower = line.lower()
                matched_terms = [term for term in terms if term in line_lower]
                if not matched_terms:
                    continue

                start = max(0, idx - context_lines)
                end = min(len(lines), idx + context_lines + 1)
                snippet_lines = [
                    f"{line_no}: {lines[line_no - 1].rstrip()}"
                    for line_no in range(start + 1, end + 1)
                ]
                results.append({
                    "source_file": source_file,
                    "resolved_path": path,
                    "line": idx + 1,
                    "matched_terms": matched_terms,
                    "snippet": "\n".join(snippet_lines),
                })
                if len(results) >= max_results:
                    return results

        return results

    @staticmethod
    def _resolve_indexed_source_path(source_file: str, source_root: Optional[str] = None) -> Optional[str]:
        # Defense against path traversal (see _allowed_source_roots docs).
        # Reject `..` segments outright; the is_within_roots check below is
        # the real boundary, but this catches the obvious case early.
        if not source_file or ".." in Path(source_file).parts:
            return None

        candidates = []
        if os.path.isabs(source_file):
            candidates.append(source_file)
        else:
            if source_root:
                candidates.append(os.path.abspath(os.path.join(source_root, source_file)))
            candidates.append(os.path.abspath(source_file))
            candidates.append(os.path.abspath(os.path.join(os.path.dirname(__file__), source_file)))

        roots = _allowed_source_roots()
        for candidate in candidates:
            if not os.path.isfile(candidate):
                continue
            resolved = os.path.realpath(candidate)
            # Refuse to open paths that resolve outside every allowed root.
            if not _is_within_roots(resolved, roots):
                continue
            return resolved
        return None

    @db_lock
    def shortest_path(self, from_id: str, to_id: str) -> List[Dict[str, Any]]:
        """BFS shortest path between two memory nodes via edges. No depth limit."""
        from collections import deque
        visited = {from_id}
        queue = deque([(from_id, [])])

        while queue:
            current, path = queue.popleft()
            neighbors = self.get_neighbors(current, limit=100)
            for nb in neighbors:
                nb_id = nb["id"]
                if nb_id in visited:
                    continue
                new_path = path + [{"from": current, "to": nb_id, "relation": nb["relation"], "confidence": nb["confidence"]}]
                if nb_id == to_id:
                    return new_path
                visited.add(nb_id)
                queue.append((nb_id, new_path))
        return []

    @db_lock
    def get_graph_stats(self, namespace: str = None) -> Dict[str, Any]:
        if namespace:
            self.cursor.execute("SELECT count(*) FROM memory_fts WHERE namespace=?", (namespace,))
            node_count = self.cursor.fetchone()[0]
            self.cursor.execute(
                '''SELECT count(*) FROM memory_edges e
                   JOIN memory_fts m ON e.from_id = m.id
                   WHERE m.namespace = ?''', (namespace,)
            )
            edge_count = self.cursor.fetchone()[0]
        else:
            self.cursor.execute("SELECT count(*) FROM memory_fts")
            node_count = self.cursor.fetchone()[0]
            self.cursor.execute("SELECT count(*) FROM memory_edges")
            edge_count = self.cursor.fetchone()[0]

        self.cursor.execute("SELECT DISTINCT relation_type FROM memory_edges")
        relation_types = [row[0] for row in self.cursor.fetchall()]

        return {"nodes": node_count, "edges": edge_count, "relation_types": relation_types}

    @db_lock
    def project_overview(self) -> Dict[str, Any]:
        """Return a one-shot overview of every namespace so an AI agent can
        identify the project without spelunking the filesystem.

        Per namespace: node/edge counts, dominant source types (code vs dialog),
        sample content, and an estimated token cost to pack the whole namespace.
        Token estimate uses the 1 token ≈ 4 chars heuristic already used by
        pack_context.
        """
        # Aggregate per-namespace stats + total content length in one pass.
        self.cursor.execute(
            '''SELECT namespace,
                      COUNT(*) AS nodes,
                      COALESCE(SUM(LENGTH(content)), 0) AS chars,
                      COALESCE(SUM(CASE WHEN source LIKE 'graphify%' THEN 1 ELSE 0 END), 0) AS code_nodes
               FROM memory_fts
               GROUP BY namespace
               ORDER BY nodes DESC'''
        )
        namespaces = []
        total_nodes = 0
        total_edges = 0
        total_chars = 0

        for ns, node_count, chars, code_nodes in self.cursor.fetchall():
            # Edge count for this namespace (join via from_id).
            self.cursor.execute(
                '''SELECT count(*) FROM memory_edges e
                   JOIN memory_fts m ON e.from_id = m.id
                   WHERE m.namespace = ?''', (ns,)
            )
            edge_count = self.cursor.fetchone()[0]

            # Dominant type heuristic.
            if code_nodes >= node_count * 0.5:
                kind = "codebase"
            elif code_nodes == 0:
                kind = "dialog"
            else:
                kind = "mixed"

            # One representative sample (highest access or most recent).
            self.cursor.execute(
                '''SELECT content FROM memory_fts WHERE namespace = ?
                   ORDER BY timestamp DESC LIMIT 1''', (ns,)
            )
            sample_row = self.cursor.fetchone()
            sample = (sample_row[0][:120] + "...") if sample_row and sample_row[0] else ""

            namespaces.append({
                "namespace": ns,
                "nodes": node_count,
                "edges": edge_count,
                "type": kind,
                "estimated_tokens": (chars or 0) // 4,
                "sample": sample,
            })
            total_nodes += node_count
            total_edges += edge_count
            total_chars += chars or 0

        return {
            "total_namespaces": len(namespaces),
            "total_nodes": total_nodes,
            "total_edges": total_edges,
            "estimated_tokens_all": total_chars // 4,
            "note": "Call this once to identify the project; then use hybrid_search/pack_context with a specific namespace.",
            "namespaces": namespaces,
        }

    @db_lock
    def get_graph_data(self, namespace: str, limit: int = 500) -> Dict[str, Any]:
        """Get nodes and edges for graph visualization, capped at limit nodes.

        Joins graph_nodes metadata so the frontend can color nodes by community
        and edges by relation type.
        """
        if namespace == "all":
            self.cursor.execute("SELECT id, namespace, content, source, timestamp FROM memory_fts LIMIT ?", (limit,))
        else:
            self.cursor.execute("SELECT id, namespace, content, source, timestamp FROM memory_fts WHERE namespace = ? LIMIT ?", (namespace, limit))
        rows = self.cursor.fetchall()

        # Pre-fetch metadata for all returned ids in one query to avoid N+1
        node_id_list = [r[0] for r in rows]
        meta_map: Dict[str, Dict] = {}
        if node_id_list:
            placeholders = ",".join(["?"] * len(node_id_list))
            self.cursor.execute(
                f'''SELECT id, node_type, source_file, source_location, file_type, community_id
                    FROM graph_nodes WHERE id IN ({placeholders})''',
                node_id_list,
            )
            for mrow in self.cursor.fetchall():
                meta_map[mrow[0]] = {
                    "node_type": mrow[1],
                    "source_file": mrow[2],
                    "source_location": mrow[3],
                    "file_type": mrow[4],
                    "community_id": mrow[5],
                }

        # Pre-fetch stats for all returned ids in one query (avoids N+1
        # _get_stats calls inside the node loop below).
        stats_map: Dict[str, Dict] = {}
        if node_id_list:
            self.cursor.execute(
                f'SELECT id, access_count, is_pinned FROM memory_stats WHERE id IN ({placeholders})',
                node_id_list,
            )
            for srow in self.cursor.fetchall():
                stats_map[srow[0]] = {"access_count": srow[1], "is_pinned": bool(srow[2])}

        nodes = []
        node_ids = set()
        for r in rows:
            node_id = r[0]
            node_ids.add(node_id)
            stats = stats_map.get(node_id, {"access_count": 0, "is_pinned": False})
            meta = meta_map.get(node_id, {})
            nodes.append({
                "id": node_id,
                "namespace": r[1],
                "content": r[2],
                "source": r[3],
                "timestamp": int(r[4]) if r[4] else 0,
                "access_count": stats["access_count"],
                "is_pinned": bool(stats["is_pinned"]),
                "node_type": meta.get("node_type"),
                "source_file": meta.get("source_file"),
                "source_location": meta.get("source_location"),
                "file_type": meta.get("file_type"),
                "community_id": meta.get("community_id"),
            })
            
        if not node_ids:
            return {"nodes": [], "edges": []}

        # Optimized edge query: only fetch edges where both endpoints are in our node set
        # Use SQL IN clause instead of fetching all edges and filtering in Python
        placeholders = ",".join(["?"] * len(node_id_list))
        self.cursor.execute(
            f'''SELECT from_id, to_id, relation_type, confidence
                FROM memory_edges
                WHERE from_id IN ({placeholders}) AND to_id IN ({placeholders})''',
            node_id_list + node_id_list
        )

        edges = []
        for e in self.cursor.fetchall():
            from_id, to_id, relation_type, confidence = e
            edges.append({
                "source": from_id,
                "target": to_id,
                "relation": relation_type,
                "confidence": confidence
            })

        return {"nodes": nodes, "edges": edges}

    @db_lock
    def import_graph_data(self, nodes: List[Dict], edges: List[Dict], namespace: str, progress_callback=None,
                          incremental: bool = False, changed_source_files: Optional[set] = None) -> Dict[str, int]:
        """Batch import graph nodes (as memories) and edges from Graphify output.

        Detects communities via networkx Louvain so the visualization can color
        nodes by cluster. Stores Graphify provenance (source location, file type)
        in graph_nodes so code entities can be filtered out of regular memory search.

        progress_callback: optional function(stage, current, total, message) for progress updates.

        Incremental mode (incremental=True): nodes whose source_file is NOT in
        changed_source_files are assumed already imported and are SKIPPED (no new
        doc_id, no embedding) — only changed/added files' nodes get embedded. Edges
        are resolved against both the new id_map AND existing graph_nodes.external_id
        (so cross-file edges to unchanged nodes survive), and community detection is
        skipped (existing communities kept; new nodes get community_id=0).
        """
        import uuid
        id_map = {}
        node_count = 0
        edge_count = 0

        def report_progress(stage, current, total, message):
            if progress_callback:
                progress_callback(stage, current, total, message)

        # 1. Insert nodes as memories in bulk and build external->internal id map
        import time
        current_time = int(time.time())
        memory_fts_data = []
        memory_stats_data = []
        chroma_documents = []
        chroma_metadatas = []
        chroma_ids = []
        # node_meta carries the graph_nodes provenance rows (external_id, source_file, ...).
        node_meta = []

        report_progress("prepare", 0, len(nodes), "准备节点数据...")

        for idx, node in enumerate(nodes):
            external_id = node.get("id") or ""
            source_file = node.get("source_file", "unknown")

            # Incremental: skip unchanged files entirely — their nodes/vectors
            # are already in the DB with their old doc_ids (resolved later via
            # external_id when building edges). This is the embedding-time win.
            if incremental and changed_source_files is not None and source_file not in changed_source_files:
                continue

            doc_id = str(uuid.uuid4())
            label = node.get("label") or ""
            content = self._build_graph_memory_content(node, label)

            if not isinstance(content, str) or not content.strip():
                content = "empty_content"

            file_type = node.get("file_type", "code")
            source = f"graphify:{source_file}:{file_type}"

            memory_fts_data.append((doc_id, namespace, content, source, current_time))
            memory_stats_data.append((doc_id,))

            chroma_documents.append(content)
            chroma_metadatas.append({"namespace": namespace, "source": source, "timestamp": current_time})
            chroma_ids.append(doc_id)

            if external_id:
                id_map[external_id] = doc_id
            node_meta.append((node, external_id, doc_id))
            node_count += 1

            # Report progress every 10% or every 100 nodes
            if (idx + 1) % max(1, len(nodes) // 10) == 0 or (idx + 1) % 100 == 0:
                report_progress("prepare", idx + 1, len(nodes), f"已准备 {idx + 1}/{len(nodes)} 个节点")

        report_progress("prepare", len(nodes), len(nodes), "节点数据准备完成")
        report_progress("sqlite", 0, len(nodes), "写入 SQLite...")

        if memory_fts_data:
            self.cursor.executemany(
                "INSERT INTO memory_fts (id, namespace, content, source, timestamp) VALUES (?, ?, ?, ?, ?)",
                memory_fts_data
            )
            self.cursor.executemany(
                "INSERT OR IGNORE INTO memory_stats (id, access_count, is_pinned) VALUES (?, 0, 0)",
                memory_stats_data
            )
            self.conn.commit()

        report_progress("sqlite", len(nodes), len(nodes), "SQLite 写入完成")
        report_progress("chroma", 0, len(chroma_ids), "开始向量化写入 ChromaDB...")

        if chroma_ids:
            # Split into batches to provide progress updates and avoid timeout
            batch_size = 200  # Larger batch = fewer round-trips, better throughput
            total_batches = (len(chroma_ids) + batch_size - 1) // batch_size

            try:
                for batch_idx in range(0, len(chroma_ids), batch_size):
                    batch_end = min(batch_idx + batch_size, len(chroma_ids))
                    batch_docs = chroma_documents[batch_idx:batch_end]
                    batch_metas = chroma_metadatas[batch_idx:batch_end]
                    batch_ids = chroma_ids[batch_idx:batch_end]

                    self.collection.add(
                        documents=batch_docs,
                        metadatas=batch_metas,
                        ids=batch_ids
                    )

                    # Report progress after each batch
                    report_progress("chroma", batch_end, len(chroma_ids), f"向量化进度 {batch_end}/{len(chroma_ids)}")

                report_progress("chroma", len(chroma_ids), len(chroma_ids), "ChromaDB 批量写入成功")
            except Exception as e:
                import sys
                print(f"Error adding to ChromaDB in bulk: {e}", file=sys.stderr)
                report_progress("chroma_fallback", 0, len(chroma_ids), "批量写入失败，切换为逐条写入...")
                for idx, (doc, meta, cid) in enumerate(zip(chroma_documents, chroma_metadatas, chroma_ids)):
                    try:
                        self.collection.add(documents=[doc], metadatas=[meta], ids=[cid])
                        if (idx + 1) % max(1, len(chroma_ids) // 20) == 0:
                            report_progress("chroma_fallback", idx + 1, len(chroma_ids), f"已写入 {idx + 1}/{len(chroma_ids)} 个向量")
                    except Exception as ex:
                        pass
                report_progress("chroma_fallback", len(chroma_ids), len(chroma_ids), "ChromaDB 逐条写入完成")

        # 2. Resolve edges to internal ids, dedup before DB write.
        # In incremental mode, also resolve against EXISTING graph_nodes so edges
        # spanning changed↔unchanged files survive (the unchanged endpoint's doc_id
        # is only in the DB, not in this batch's id_map).
        report_progress("edges", 0, len(edges), "解析边关系...")
        if incremental:
            self.cursor.execute(
                "SELECT external_id, id FROM graph_nodes "
                "WHERE external_id IS NOT NULL AND external_id != '' "
                "AND id IN (SELECT id FROM memory_fts WHERE namespace=?)",
                (namespace,),
            )
            existing_id_map = {row[0]: row[1] for row in self.cursor.fetchall()}
            # New batch ids take precedence (a changed file's node may reuse an
            # external_id that existed before the scoped clear).
            edge_id_map = {**existing_id_map, **id_map}
        else:
            edge_id_map = id_map

        resolved_edges = []
        for edge in edges:
            from_external = edge.get("source", "")
            to_external = edge.get("target", "")
            from_id = edge_id_map.get(from_external)
            to_id = edge_id_map.get(to_external)
            if from_id and to_id:
                resolved_edges.append((from_id, to_id, edge.get("relation", "unknown"), edge.get("confidence", 1.0)))

        report_progress("edges", len(edges), len(edges), f"已解析 {len(resolved_edges)} 条有效边")

        # 3. Community detection via networkx Louvain (fallback to trivial partition).
        # Skipped in incremental mode: Louvain is global and recomputing it per
        # partial update would erase the (still-valid) communities of unchanged
        # nodes. New/changed nodes get community_id=0; run rebuild=true for a full
        # re-clustering when visualization coloring matters.
        if incremental:
            community_map = {}
            report_progress("community", 100, 100, "增量模式: 跳过社区重算")
        else:
            report_progress("community", 0, 100, "检测社区结构...")
            community_map = self._detect_communities(resolved_edges)
            report_progress("community", 100, 100, f"检测到 {len(set(community_map.values())) if community_map else 0} 个社区")

        # 4. Persist node metadata + community assignment (only for nodes we
        # actually imported this batch — node_meta skips unchanged files).
        report_progress("metadata", 0, len(node_meta), "写入节点元数据...")
        for idx, (node, external_id, doc_id) in enumerate(node_meta):
            self.cursor.execute(
                '''INSERT OR REPLACE INTO graph_nodes
                   (id, node_type, source_file, source_location, file_type, community_id, external_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?)''',
                (
                    doc_id,
                    node.get("node_type") or self._infer_node_type(node),
                    node.get("source_file", "unknown"),
                    node.get("source_location", ""),
                    node.get("file_type", "code"),
                    community_map.get(doc_id, 0),
                    external_id,
                ),
            )

        self.conn.commit()
        report_progress("metadata", len(node_meta), len(node_meta), "节点元数据写入完成")

        # 5. Persist edges (batch — single executemany + one commit; replaces
        # the prior N+1 pattern of one add_edge() call per edge, each doing
        # its own INSERT + commit). For 10k edges this drops 10k commits to 1.
        report_progress("persist_edges", 0, len(resolved_edges), "持久化边关系...")
        if resolved_edges:
            self.cursor.executemany(
                'INSERT OR REPLACE INTO memory_edges (from_id, to_id, relation_type, confidence, created_at) VALUES (?, ?, ?, ?, ?)',
                [(from_id, to_id, relation, confidence, current_time) for (from_id, to_id, relation, confidence) in resolved_edges]
            )
            self.conn.commit()
            edge_count = len(resolved_edges)

        report_progress("persist_edges", edge_count, len(resolved_edges), f"已写入 {edge_count} 条边")

        return {
            "nodes_imported": node_count,
            "edges_imported": edge_count,
            "id_map_size": len(id_map),
            "communities": len(set(community_map.values())) if community_map else 0,
        }

    def _build_graph_memory_content(self, node: Dict, label: str) -> str:
        """Build the text stored in SQLite/Chroma for a Graphify node."""
        raw_content = node.get("content")
        source_file = node.get("source_file") or ""
        source_location = node.get("source_location") or ""
        file_type = node.get("file_type") or "code"
        node_type = node.get("node_type") or self._infer_node_type(node)

        parts = [
            f"label: {label or raw_content or 'empty_content'}",
            f"type: {node_type}",
            f"file_type: {file_type}",
        ]
        if source_file:
            location = f"{source_file}:{source_location}" if source_location else source_file
            parts.append(f"source: {location}")

        if raw_content and raw_content != label:
            parts.append(f"summary: {raw_content}")

        snippet = self._read_source_snippet(
            source_file,
            source_location,
            source_root=node.get("source_root"),
        )
        if snippet:
            parts.append("snippet:\n" + snippet)

        return "\n".join(parts)

    def _read_source_snippet(
        self,
        source_file: str,
        source_location: str,
        source_root: Optional[str] = None,
        context_lines: int = 6,
    ) -> str:
        line_no = self._parse_source_line(source_location)
        if not source_file or not line_no:
            return ""

        path = self._resolve_indexed_source_path(source_file, source_root=source_root)
        if not path:
            return ""

        try:
            with open(path, "r", encoding="utf-8", errors="replace") as fh:
                lines = fh.readlines()
        except OSError:
            return ""

        start = max(0, line_no - context_lines - 1)
        end = min(len(lines), line_no + context_lines)
        return "\n".join(
            f"{idx}: {lines[idx - 1].rstrip()}"
            for idx in range(start + 1, end + 1)
        )

    @staticmethod
    def _parse_source_line(source_location: str) -> Optional[int]:
        if not source_location:
            return None
        text = str(source_location).strip()
        if text.startswith("L"):
            text = text[1:]
        text = text.split(":", 1)[0].split("-", 1)[0]
        try:
            line_no = int(text)
        except ValueError:
            return None
        return line_no if line_no > 0 else None

    @staticmethod
    def _infer_node_type(node: Dict) -> str:
        """Infer a coarse node_type from Graphify provenance when none is given."""
        ft = (node.get("file_type") or "").lower()
        if ft in ("document", "doc", "markdown", "md"):
            return "document"
        if ft == "rationale":
            return "rationale"
        label = (node.get("label") or "").lower()
        if label.endswith("()") or "(" in label:
            return "function"
        if "class " in label:
            return "class"
        if label.endswith(".py") or label.endswith(".js") or label.endswith(".ts"):
            return "file"
        return "symbol"

    @staticmethod
    def _detect_communities(resolved_edges: List[tuple]) -> Dict[str, int]:
        """Run Louvain community detection on resolved edges (networkx optional)."""
        if not resolved_edges:
            return {}
        try:
            import networkx as nx
            try:
                from networkx.algorithms.community import louvain_communities
            except ImportError:
                return {}
            g = nx.Graph()
            for f, t, _r, _c in resolved_edges:
                g.add_edge(f, t)
            communities = louvain_communities(g, seed=42)
            return {nid: idx for idx, comm in enumerate(communities) for nid in comm}
        except Exception as exc:
            print(f"[graph] community detection skipped: {exc}", file=sys.stderr)
            return {}

    @db_lock
    def get_graph_node_meta(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """Fetch graph_nodes metadata row for a given memory id."""
        self.cursor.execute(
            '''SELECT node_type, source_file, source_location, file_type, community_id, external_id
               FROM graph_nodes WHERE id = ?''',
            (doc_id,),
        )
        row = self.cursor.fetchone()
        if not row:
            return None
        return {
            "node_type": row[0],
            "source_file": row[1],
            "source_location": row[2],
            "file_type": row[3],
            "community_id": row[4],
            "external_id": row[5],
        }

    @db_lock
    def list_communities(self, namespace: Optional[str] = None) -> List[Dict[str, Any]]:
        """Aggregate community_id -> {node_count, edge_count, top_relations}."""
        if namespace:
            self.cursor.execute(
                '''SELECT gn.community_id, COUNT(*) as n,
                          COUNT(DISTINCT gn.node_type) as type_count
                   FROM graph_nodes gn
                   JOIN memory_fts m ON gn.id = m.id
                   WHERE m.namespace = ? AND gn.community_id IS NOT NULL
                   GROUP BY gn.community_id
                   ORDER BY n DESC''',
                (namespace,),
            )
        else:
            self.cursor.execute(
                '''SELECT community_id, COUNT(*) as n, COUNT(DISTINCT node_type) as type_count
                   FROM graph_nodes
                   WHERE community_id IS NOT NULL
                   GROUP BY community_id
                   ORDER BY n DESC''',
            )
        out = []
        for row in self.cursor.fetchall():
            out.append({"community_id": row[0], "node_count": row[1], "type_count": row[2]})
        return out
