import sqlite3
import time
import os
import chromadb
import litellm
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

class MemoryItem(BaseModel):
    id: str
    namespace: str
    content: str
    source: str
    timestamp: int
    score: float = 1.0

class MemoryEngine:
    def __init__(self, db_dir: str = "./data"):
        os.makedirs(db_dir, exist_ok=True)
        
        # 1. Initialize SQLite (FTS5 + Metadata)
        self.sqlite_path = os.path.join(db_dir, "memory_metadata.db")
        self.conn = sqlite3.connect(self.sqlite_path, check_same_thread=False)
        self.cursor = self.conn.cursor()
        self._init_sqlite()

        # 2. Initialize ChromaDB (Vector Search)
        self.chroma_client = chromadb.PersistentClient(path=os.path.join(db_dir, "chroma_db"))
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
        self.conn.commit()

    def insert_memory(self, doc_id: str, namespace: str, content: str, source: str, dedup_threshold: float = 0.0) -> str:
        """Insert a memory chunk into both SQLite and ChromaDB, with optional deduplication."""
        
        # 0. Deduplication Check
        if dedup_threshold > 0.0:
            # We want to check for semantic similarity using Chroma
            vector_results = self.collection.query(
                query_texts=[content],
                n_results=1,
                where={"namespace": namespace}
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

    def freeze_snapshot(self, namespace: str, summary: str, doc_id: str) -> str:
        """A snapshot is a special high-priority memory."""
        # Source explicitly marked as 'snapshot'
        inserted_id = self.insert_memory(doc_id, namespace, summary, source="snapshot")
        self.set_pinned(inserted_id, True)
        return inserted_id

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

    def record_access(self, doc_id: str) -> None:
        """Increment the access count for a specific memory."""
        self.cursor.execute(
            "UPDATE memory_stats SET access_count = access_count + 1 WHERE id = ?", 
            (doc_id,)
        )
        self.conn.commit()
        
    def set_pinned(self, doc_id: str, is_pinned: bool) -> None:
        """Pin or unpin a specific memory."""
        pinned_val = 1 if is_pinned else 0
        self.cursor.execute(
            "UPDATE memory_stats SET is_pinned = ? WHERE id = ?", 
            (pinned_val, doc_id)
        )
        self.conn.commit()
        
    def _get_stats(self, doc_id: str) -> dict:
        self.cursor.execute("SELECT access_count, is_pinned FROM memory_stats WHERE id = ?", (doc_id,))
        row = self.cursor.fetchone()
        if row:
            return {"access_count": row[0], "is_pinned": bool(row[1])}
        return {"access_count": 0, "is_pinned": False}

    def hybrid_search(self, namespace: str, query: str, top_k: int = 5) -> List[MemoryItem]:
        """Perform Hybrid Search: Keyword (FTS5) + Semantic (Chroma)."""
        if not query or query == "__all__" or query.strip() == "":
            # Return all memories of this namespace sorted by current decay score
            if namespace == "all":
                self.cursor.execute("SELECT id, namespace, content, source, timestamp FROM memory_fts")
            else:
                self.cursor.execute("SELECT id, namespace, content, source, timestamp FROM memory_fts WHERE namespace = ?", (namespace,))
            
            rows = self.cursor.fetchall()
            results_list = []
            current_time = int(time.time())
            import math
            for row in rows:
                doc_id, ns, content, source, timestamp = row
                stats = self._get_stats(doc_id)
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
            
        vector_results = self.collection.query(**query_args)
        
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
        for item in final_list:
            stats = self._get_stats(item.id)
            
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

    def pack_context(self, namespace: str, query: str, max_tokens: int = 2000) -> str:
        """
        Assemble the most relevant context within a given token budget using LLM-friendly XML.
        Approximate 1 token = 4 characters.
        """
        max_chars = max_tokens * 4
        
        # Over-fetch slightly to ensure we have enough good candidates
        top_k_fetch = max(10, max_tokens // 50)
        results = self.hybrid_search(namespace, query, top_k=top_k_fetch)
        
        if not results:
            return "<context></context>"
            
        packed_content = "<context>\n"
        current_chars = len(packed_content) + len("</context>\n")
        added_chunks = 0
        
        for r in results:
            age = self._format_age(r.timestamp)
            relevance = self._get_relevance(r.score)
            
            block = f'  <memory source="{r.source}" relevance="{relevance}" age="{age}">\n{r.content}\n  </memory>\n'
            block_len = len(block)
            
            if current_chars + block_len <= max_chars:
                packed_content += block
                current_chars += block_len
                added_chunks += 1
                # Record access for Importance Scoring
                self.record_access(r.id)
            else:
                # We skip chunks that don't fit entirely, no hard truncations.
                continue
                
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

    def read_working_memory(self, namespace: str, key: str) -> Optional[str]:
        """Read a value from the working memory scratchpad."""
        self.cursor.execute('SELECT value FROM working_memory WHERE namespace=? AND key=?', (namespace, key))
        row = self.cursor.fetchone()
        if row:
            return row[0]
        return None

    def list_working_memory(self, namespace: str) -> Dict[str, str]:
        """Get all working memory keys and values for a namespace."""
        self.cursor.execute('SELECT key, value FROM working_memory WHERE namespace=?', (namespace,))
        return {row[0]: row[1] for row in self.cursor.fetchall()}

    def delete_working_memory(self, namespace: str, key: str) -> None:
        """Delete a specific key from the working memory scratchpad."""
        self.cursor.execute('DELETE FROM working_memory WHERE namespace=? AND key=?', (namespace, key))
        self.conn.commit()

    def clear_working_memory(self, namespace: str) -> None:
        """Clear the entire working memory scratchpad for a namespace."""
        self.cursor.execute('DELETE FROM working_memory WHERE namespace=?', (namespace,))
        self.conn.commit()

    def close(self):
        self.conn.close()

    def active_forgetting(self, namespace: str, max_capacity: int = 10000) -> int:
        self.cursor.execute('SELECT id FROM memory_fts WHERE namespace=?', (namespace,))
        rows = self.cursor.fetchall()
        total_count = len(rows)
        if total_count <= max_capacity: return 0
        docs_to_delete = total_count - max_capacity
        all_ids = [row[0] for row in rows]
        scored_items = []
        current_time = int(time.time())
        import math
        for doc_id in all_ids:
            stats = self._get_stats(doc_id)
            if stats['is_pinned']: continue
            self.cursor.execute('SELECT timestamp FROM memory_fts WHERE id=?', (doc_id,))
            ts_row = self.cursor.fetchone()
            if not ts_row: continue
            timestamp = ts_row[0]
            score = 1.0
            score *= (1.0 + 0.1 * math.log1p(stats['access_count']))
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

    # =========================================================
    # Session Management Operations
    # =========================================================

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

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        self.cursor.execute(
            "SELECT id, namespace, created_at, last_active, status FROM memory_sessions WHERE id=?",
            (session_id,)
        )
        row = self.cursor.fetchone()
        if row:
            return {"id": row[0], "namespace": row[1], "created_at": row[2], "last_active": row[3], "status": row[4]}
        return None

    def update_session_status(self, session_id: str, status: str) -> bool:
        current_time = int(time.time())
        self.cursor.execute(
            "UPDATE memory_sessions SET status=?, last_active=? WHERE id=?",
            (status, current_time, session_id)
        )
        self.conn.commit()
        return self.cursor.rowcount > 0

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

    def unlink_memory_from_session(self, session_id: str, memory_id: str) -> bool:
        self.cursor.execute(
            "DELETE FROM session_memories WHERE session_id=? AND memory_id=?",
            (session_id, memory_id)
        )
        self.conn.commit()
        return self.cursor.rowcount > 0

    def get_session_memories(self, session_id: str) -> List[Dict[str, Any]]:
        self.cursor.execute(
            "SELECT memory_id, created_at FROM session_memories WHERE session_id=?",
            (session_id,)
        )
        links = self.cursor.fetchall()
        result = []
        for memory_id, linked_at in links:
            self.cursor.execute(
                "SELECT content, source, timestamp FROM memory_fts WHERE id=?",
                (memory_id,)
            )
            row = self.cursor.fetchone()
            if row:
                result.append({"id": memory_id, "content": row[0], "source": row[1], "timestamp": row[2], "linked_at": linked_at})
        return result

    def get_session_context(self, session_id: str, max_tokens: int = 2000) -> str:
        session = self.get_session(session_id)
        if not session:
            return "<context></context>"

        max_chars = max_tokens * 4
        memories = self.get_session_memories(session_id)
        if not memories:
            return "<context></context>"

        packed_content = f'<context session_id="{session_id}">\n'
        current_chars = len(packed_content) + len("</context>\n")

        for mem in memories:
            age = self._format_age(mem["timestamp"])
            block = f'  <memory source="{mem["source"]}" age="{age}">\n{mem["content"]}\n  </memory>\n'
            block_len = len(block)
            if current_chars + block_len <= max_chars:
                packed_content += block
                current_chars += block_len

        packed_content += "</context>"
        return packed_content

    def delete_session(self, session_id: str) -> bool:
        self.cursor.execute("DELETE FROM session_memories WHERE session_id=?", (session_id,))
        self.cursor.execute("DELETE FROM memory_sessions WHERE id=?", (session_id,))
        self.conn.commit()
        return self.cursor.rowcount > 0

    # =========================================================
    # Knowledge Graph Operations (Graphify Integration)
    # =========================================================

    def add_edge(self, from_id: str, to_id: str, relation_type: str, confidence: float = 1.0) -> bool:
        current_time = int(time.time())
        self.cursor.execute(
            '''INSERT OR REPLACE INTO memory_edges (from_id, to_id, relation_type, confidence, created_at)
               VALUES (?, ?, ?, ?, ?)''',
            (from_id, to_id, relation_type, confidence, current_time)
        )
        self.conn.commit()
        return True

    def remove_edge(self, from_id: str, to_id: str, relation_type: str) -> bool:
        self.cursor.execute(
            "DELETE FROM memory_edges WHERE from_id=? AND to_id=? AND relation_type=?",
            (from_id, to_id, relation_type)
        )
        self.conn.commit()
        return self.cursor.rowcount > 0

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

    def shortest_path(self, from_id: str, to_id: str, max_depth: int = 5) -> List[Dict[str, Any]]:
        """BFS shortest path between two memory nodes via edges."""
        from collections import deque
        visited = {from_id}
        queue = deque([(from_id, [])])

        while queue:
            current, path = queue.popleft()
            if len(path) >= max_depth:
                continue
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

    def get_graph_data(self, namespace: str, limit: int = 500) -> Dict[str, Any]:
        """Get nodes and edges for graph visualization, capped at limit nodes."""
        if namespace == "all":
            self.cursor.execute("SELECT id, namespace, content, source, timestamp FROM memory_fts LIMIT ?", (limit,))
        else:
            self.cursor.execute("SELECT id, namespace, content, source, timestamp FROM memory_fts WHERE namespace = ? LIMIT ?", (namespace, limit))
        rows = self.cursor.fetchall()

        nodes = []
        node_ids = set()
        for r in rows:
            node_id = r[0]
            node_ids.add(node_id)
            stats = self._get_stats(node_id)
            nodes.append({
                "id": node_id,
                "namespace": r[1],
                "content": r[2],
                "source": r[3],
                "timestamp": int(r[4]) if r[4] else 0,
                "access_count": stats["access_count"],
                "is_pinned": bool(stats["is_pinned"])
            })
            
        if not node_ids:
            return {"nodes": [], "edges": []}
            
        self.cursor.execute("SELECT from_id, to_id, relation_type, confidence FROM memory_edges")
        all_edges = self.cursor.fetchall()
        
        edges = []
        for e in all_edges:
            from_id, to_id, relation_type, confidence = e
            if from_id in node_ids and to_id in node_ids:
                edges.append({
                    "source": from_id,
                    "target": to_id,
                    "relation": relation_type,
                    "confidence": confidence
                })
                
        return {"nodes": nodes, "edges": edges}

    def import_graph_data(self, nodes: List[Dict], edges: List[Dict], namespace: str) -> Dict[str, int]:
        """Batch import graph nodes (as memories) and edges from Graphify output."""
        import uuid
        id_map = {}
        node_count = 0
        edge_count = 0

        for node in nodes:
            doc_id = str(uuid.uuid4())
            external_id = node.get("id", "")
            label = node.get("label", "")
            content = node.get("content", label)
            source = f"graphify:{node.get('source_file', 'unknown')}:{node.get('file_type', 'code')}"

            self.insert_memory(doc_id, namespace, content, source)
            if external_id:
                id_map[external_id] = doc_id
            node_count += 1

        for edge in edges:
            from_external = edge.get("source", "")
            to_external = edge.get("target", "")
            from_id = id_map.get(from_external)
            to_id = id_map.get(to_external)
            if from_id and to_id:
                self.add_edge(
                    from_id, to_id,
                    edge.get("relation", "unknown"),
                    edge.get("confidence", 1.0)
                )
                edge_count += 1

        return {"nodes_imported": node_count, "edges_imported": edge_count, "id_map_size": len(id_map)}
