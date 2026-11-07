"""Resolve indexed source within allowed roots and compare file fingerprints."""

import hashlib
import os
from pathlib import Path


def allowed_source_roots() -> list[str]:
    configured = os.environ.get("CODEBASE_SOURCE_ROOTS", "").split(",")
    roots = [part.strip() for part in configured if part.strip()]
    roots.extend(["/workspace", str(Path(__file__).absolute().parent.parent)])
    return list(dict.fromkeys(os.path.realpath(root) for root in roots))


def is_within_roots(resolved_path: str, roots: list[str]) -> bool:
    """Check a canonical path against canonical roots, including on Windows."""
    for root in roots:
        try:
            if os.path.commonpath([resolved_path, root]) == root:
                return True
        except ValueError:
            # Windows paths on different drives have no common path.
            continue
    return False


def resolve_indexed_source_path(source_file: str, source_root: str | None = None) -> str | None:
    if not source_file or ".." in Path(source_file).parts:
        return None

    if os.path.isabs(source_file):
        candidates = [source_file]
    else:
        candidates = [os.path.abspath(source_file), os.path.join(os.path.dirname(__file__), source_file)]
        if source_root:
            candidates.insert(0, os.path.abspath(os.path.join(source_root, source_file)))

    roots = allowed_source_roots()
    for candidate in candidates:
        if os.path.isfile(candidate):
            resolved = os.path.realpath(candidate)
            if is_within_roots(resolved, roots):
                return resolved
    return None


def file_sha256(path: str | Path) -> str:
    with open(path, "rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def changed_indexed_files(manifest: dict[str, str]) -> list[str]:
    """Compare readable indexed files. The indexer handles added/removed files."""
    changed = []
    for source_file, old_hash in manifest.items():
        path = resolve_indexed_source_path(source_file)
        if path is None:
            continue
        try:
            current_hash = file_sha256(path)
        except OSError:
            continue
        if current_hash != old_hash:
            changed.append(source_file)
    return changed


def read_source_snippet(
    source_file: str,
    source_location: str,
    source_root: str | None = None,
    context_lines: int = 6,
) -> str:
    line_no = _parse_source_line(source_location)
    if not source_file or not line_no:
        return ""

    path = resolve_indexed_source_path(source_file, source_root=source_root)
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

def _parse_source_line(source_location: str) -> int | None:
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
