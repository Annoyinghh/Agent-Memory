import sqlite3
import time
import os
import chromadb
from typing import List, Dict, Any
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

    def _init_sqlite(self):
        # Create FTS5 virtual table. FTS5 doesn't strictly support filtering by non-text columns efficiently 
        # out of the box, but we can store namespace and source as text and filter during the query.
        self.cursor.execute('''
            CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
                id, namespace, content, source, timestamp UNINDEXED
            )
        ''')
        self.conn.commit()

    def insert_memory(self, doc_id: str, namespace: str, content: str, source: str) -> str:
        """Insert a memory chunk into both SQLite and ChromaDB."""
        current_time = int(time.time())
        
        # 1. Insert into SQLite
        self.cursor.execute(
            "INSERT INTO memory_fts (id, namespace, content, source, timestamp) VALUES (?, ?, ?, ?, ?)",
            (doc_id, namespace, content, source, current_time)
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
        return self.insert_memory(doc_id, namespace, summary, source="snapshot")

    def hybrid_search(self, namespace: str, query: str, top_k: int = 5) -> List[MemoryItem]:
        """Perform Hybrid Search: Keyword (FTS5) + Semantic (Chroma)."""
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

        # 3. Apply Time Decay & Snapshot Boost
        current_time = int(time.time())
        final_list = list(results.values())
        for item in final_list:
            # Snapshots get a massive boost
            if item.source == "snapshot":
                item.score *= 1.5
                
            # Time decay: reduce score slightly for older items
            # e.g., half-life of 30 days (2592000 seconds)
            age_seconds = current_time - item.timestamp
            decay_factor = 0.5 ** (age_seconds / 2592000.0)
            item.score *= decay_factor

        # 4. Sort by final score
        final_list.sort(key=lambda x: x.score, reverse=True)
        return final_list[:top_k]

    def close(self):
        self.conn.close()
