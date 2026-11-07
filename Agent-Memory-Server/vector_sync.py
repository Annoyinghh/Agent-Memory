"""Durable index repair. SQLite records are authoritative; Chroma is an index."""
import logging

logger = logging.getLogger(__name__)


class VectorSyncMixin:
    def _queue_vector_sync(self, ids):
        """Call inside the SAME transaction as the corresponding SQLite write."""
        self.cursor.executemany(
            "INSERT INTO vector_sync_jobs(doc_id) VALUES (?) "
            "ON CONFLICT(doc_id) DO UPDATE SET attempts=0, last_error=NULL",
            [(doc_id,) for doc_id in dict.fromkeys(ids)],
        )

    def pending_vector_sync(self) -> int:
        with self.lock:
            return self.conn.execute("SELECT count(*) FROM vector_sync_jobs").fetchone()[0]

    def sync_vector_index(self, limit: int = 100, ids=None, embeddings=None) -> dict:
        """Idempotent upsert/delete, with bounded batches and durable retries.

        A SQLite write reservation serializes index writes across REST/MCP
        processes. This deliberately trades write concurrency for correctness
        until indexing moves to a dedicated worker. Never run LLMs here.
        """
        limit = max(1, min(int(limit), 500))
        with self.lock:
            if self.conn.in_transaction:
                raise RuntimeError("Commit the source transaction before syncing vectors")
            self.conn.execute("BEGIN IMMEDIATE")
            try:
                if ids is None:
                    jobs = self.conn.execute(
                        "SELECT doc_id FROM vector_sync_jobs ORDER BY attempts, doc_id LIMIT ?", (limit,)
                    ).fetchall()
                else:
                    selected = list(dict.fromkeys(ids))[:limit]
                    marks = ','.join('?' for _ in selected)
                    jobs = self.conn.execute(
                        f"SELECT doc_id FROM vector_sync_jobs WHERE doc_id IN ({marks}) ORDER BY doc_id",
                        selected,
                    ).fetchall() if selected else []
                rows, deleted = [], []
                for (doc_id,) in jobs:
                    matches = self.conn.execute(
                        "SELECT id,namespace,content,source,timestamp FROM memory_fts WHERE id=?", (doc_id,)
                    ).fetchall()
                    if len(matches) > 1:
                        raise ValueError("Duplicate memory IDs must be resolved before index repair")
                    if matches:
                        rows.append(matches[0])
                    else:
                        deleted.append(doc_id)
                if rows:
                    extra = {}
                    if embeddings and all(row[0] in embeddings and embeddings[row[0]][0] == row[2] for row in rows):
                        extra['embeddings'] = [embeddings[row[0]][1] for row in rows]
                    self.collection.upsert(
                        ids=[r[0] for r in rows], documents=[r[2] for r in rows],
                        metadatas=[{"namespace": r[1], "source": r[3], "timestamp": int(r[4])} for r in rows],
                        **extra,
                    )
                if deleted:
                    self.collection.delete(ids=deleted)
                self.conn.executemany("DELETE FROM vector_sync_jobs WHERE doc_id=?", jobs)
                self.conn.commit()
                return {"synced": len(jobs), "pending": self.pending_vector_sync(), "error": None}
            except Exception as exc:
                self.conn.rollback()
                # Source writes were already committed. A partial index write is
                # harmless: all jobs survive and can be replayed after a restart.
                self.conn.executemany(
                    "UPDATE vector_sync_jobs SET attempts=attempts+1,last_error=? WHERE doc_id=?",
                    [(type(exc).__name__, row[0]) for row in locals().get('jobs', [])],
                )
                self.conn.commit()
                logger.warning("Vector index sync deferred (%s)", type(exc).__name__)
                return {"synced": 0, "pending": self.pending_vector_sync(), "error": type(exc).__name__}

    def requeue_vector_index(self) -> int:
        """Queue all source records and orphan vectors for explicit repair."""
        with self.lock:
            source_ids = [r[0] for r in self.conn.execute("SELECT id FROM memory_fts")]
            vector_ids = self.collection.get(include=[])['ids']
            with self.conn:
                self._queue_vector_sync(source_ids + vector_ids)
            return self.pending_vector_sync()
