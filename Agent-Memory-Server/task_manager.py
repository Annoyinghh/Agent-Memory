"""
Background Task Manager for long-running imports.
Manages task state, progress tracking, and results.
"""

import uuid
import time
import threading
from typing import Dict, Optional, Any
from dataclasses import dataclass, asdict

@dataclass
class TaskProgress:
    task_id: str
    status: str  # 'running', 'completed', 'failed'
    stage: str
    current: int
    total: int
    message: str
    percent: int
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: float = 0
    updated_at: float = 0

class TaskManager:
    """Thread-safe task manager for background operations."""

    def __init__(self):
        self.tasks: Dict[str, TaskProgress] = {}
        self.lock = threading.Lock()
        # Auto-cleanup tasks older than 1 hour
        self.cleanup_interval = 3600
        self._start_cleanup_thread()

    def create_task(self) -> str:
        """Create a new task and return its ID."""
        task_id = str(uuid.uuid4())
        now = time.time()
        with self.lock:
            self.tasks[task_id] = TaskProgress(
                task_id=task_id,
                status='running',
                stage='init',
                current=0,
                total=0,
                message='任务已创建',
                percent=0,
                created_at=now,
                updated_at=now
            )
        return task_id

    def update_progress(self, task_id: str, stage: str, current: int, total: int, message: str):
        """Update task progress."""
        with self.lock:
            if task_id in self.tasks:
                task = self.tasks[task_id]
                task.stage = stage
                task.current = current
                task.total = total
                task.message = message
                task.percent = int((current / total * 100)) if total > 0 else 0
                task.updated_at = time.time()

    def complete_task(self, task_id: str, result: Dict[str, Any]):
        """Mark task as completed with result."""
        with self.lock:
            if task_id in self.tasks:
                task = self.tasks[task_id]
                task.status = 'completed'
                task.result = result
                task.message = '任务完成'
                task.percent = 100
                task.updated_at = time.time()

    def fail_task(self, task_id: str, error: str):
        """Mark task as failed with error."""
        with self.lock:
            if task_id in self.tasks:
                task = self.tasks[task_id]
                task.status = 'failed'
                task.error = error
                task.updated_at = time.time()

    def get_task(self, task_id: str) -> Optional[TaskProgress]:
        """Get task progress."""
        with self.lock:
            return self.tasks.get(task_id)

    def get_task_dict(self, task_id: str) -> Optional[Dict]:
        """Get task progress as dict."""
        task = self.get_task(task_id)
        return asdict(task) if task else None

    def delete_task(self, task_id: str):
        """Delete a task."""
        with self.lock:
            self.tasks.pop(task_id, None)

    def _cleanup_old_tasks(self):
        """Remove tasks older than cleanup_interval."""
        now = time.time()
        with self.lock:
            to_delete = [
                task_id for task_id, task in self.tasks.items()
                if now - task.updated_at > self.cleanup_interval
            ]
            for task_id in to_delete:
                del self.tasks[task_id]

    def _start_cleanup_thread(self):
        """Start background thread to cleanup old tasks."""
        def cleanup_loop():
            while True:
                time.sleep(300)  # Cleanup every 5 minutes
                self._cleanup_old_tasks()

        thread = threading.Thread(target=cleanup_loop, daemon=True)
        thread.start()

# Global task manager instance
task_manager = TaskManager()
