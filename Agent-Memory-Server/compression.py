"""
compression.py - optional, reversible context compression via headroom.

Agent-Memory *selects* the right memories (pack_context / hybrid_search); headroom
*compresses* them before they reach the LLM. This module wraps headroom's real
compression entry point - ``headroom.compress(messages, config=CompressConfig(...))`` -
so a memory chunk can be shrunk for injection and its full original fetched back on
demand via retrieve(key).

headroom is an OPTIONAL dependency. If it is not installed, or an import / a
compression call fails, every function degrades to returning the original text
unchanged - existing Agent-Memory behavior is preserved 100%. Callers never need
to check availability themselves.

Reversibility: headroom's library ``compress()`` returns compressed messages but no
retrieve key, so we cache the original ourselves on disk under CCR_DIR (keyed). The
REST container and the per-call MCP containers share that volume, so retrieve()
works across processes regardless of headroom internals.

Content routing (measured on headroom 0.27): structured/JSON -> SmartCrusher (~-58%),
logs -> LogCompressor (~-97%), code/prose often pass through unchanged when the
router marks them no-op. The module is honest: if a call yields no savings, it
returns the original verbatim with method="passthrough".

Env:
  HEADROOM_ENABLED       - "0"/"false"/"off" forces compression off even if installed.
  HEADROOM_CCR_DIR       - on-disk originals cache dir (shared volume). Default
                           /app/data/headroom-ccr.
  HEADROOM_MIN_TOKENS    - min estimated tokens before headroom is invoked (default 50;
                           mirrors CompressConfig.min_tokens_to_compress).
  HEADROOM_TELEMETRY     - asserted off defensively (set in the image).
"""
from __future__ import annotations

import logging
import os
import threading
import uuid
from typing import Optional

log = logging.getLogger("agent-memory.compression")

CCR_DIR = os.environ.get("HEADROOM_CCR_DIR", "/app/data/headroom-ccr")
MIN_TOKENS = int(os.environ.get("HEADROOM_MIN_TOKENS", "50"))


def _approx_tokens(text: str) -> int:
    """Token estimate matching pack_context's 1-token ~ 4-chars heuristic (no new dep)."""
    return max(0, len(text or "") // 4)


# --------------------------------------------------------------------------- #
# On-disk originals cache = the reversibility mechanism. One file per key:
# <CCR_DIR>/<key>.orig . Survives container recreate; shared by the REST container
# and per-call MCP containers (both mount /app/data).
# --------------------------------------------------------------------------- #
_cache_lock = threading.Lock()


def _cache_path(key: str) -> str:
    return os.path.join(CCR_DIR, f"{key}.orig")


def _cache_put(key: str, original: str) -> None:
    try:
        with _cache_lock:
            os.makedirs(CCR_DIR, exist_ok=True)
            with open(_cache_path(key), "w", encoding="utf-8") as fh:
                fh.write(original)
    except Exception as e:  # cache is best-effort; never break compression
        log.warning("CCR on-disk cache write failed for %s: %r", key, e)


def _cache_get(key: str) -> Optional[str]:
    try:
        p = _cache_path(key)
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as fh:
                return fh.read()
    except Exception as e:
        log.warning("CCR on-disk cache read failed for %s: %r", key, e)
    return None


# --------------------------------------------------------------------------- #
# Optional headroom dependency (lazy, thread-safe, cached).
# We use headroom.compress() + CompressConfig - NOT SharedContext (which is a
# cross-agent store that does not run the compression pipeline).
# --------------------------------------------------------------------------- #
_lock = threading.Lock()
_state: dict = {"tried": False, "ok": False, "compress": None, "config": None, "err": None}


def _build_engine():
    """Return (compress_fn, CompressConfig) configured for aggressive local compression."""
    from headroom import compress as _hr_compress, CompressConfig  # type: ignore

    # compress_user_messages=True + no protection so memory chunks (which arrive as
    # user-role content) are actually routed to SmartCrusher/Log/etc. With defaults
    # headroom protects user messages and only compresses tool results.
    cfg = CompressConfig(
        compress_user_messages=True,
        compress_system_messages=True,
        protect_analysis_context=False,
        protect_recent=0,
        min_tokens_to_compress=MIN_TOKENS,
    )
    return _hr_compress, cfg


def _available() -> bool:
    if os.environ.get("HEADROOM_ENABLED", "1").lower() in ("0", "false", "off", "no"):
        return False
    if _state["tried"]:
        return _state["ok"]
    with _lock:
        if _state["tried"]:
            return _state["ok"]
        _state["tried"] = True
        try:
            _state["compress"], _state["config"] = _build_engine()
            _state["ok"] = True
            log.info("headroom compression enabled (CCR dir=%s)", CCR_DIR)
        except Exception as e:  # optional dep - never fatal
            _state["ok"] = False
            _state["err"] = repr(e)
            log.info("headroom unavailable, compression disabled: %s", _state["err"])
        return _state["ok"]


def _engine():
    return (_state["compress"], _state["config"]) if _available() else (None, None)


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
def _passthrough(text: str, tokens: int) -> dict:
    return {
        "compressed": text,
        "key": None,
        "original_tokens": tokens,
        "compressed_tokens": tokens,
        "ratio": 1.0,
        "method": "passthrough",
    }


def compress_text(text: str, language: Optional[str] = None) -> dict:
    """Compress a text block, caching the original under a retrievable key.

    Returns:
      compressed        str        - the (possibly) shortened text
      key               str|None   - pass to retrieve() to get the original back
      original_tokens   int
      compressed_tokens int
      ratio             float      - compressed_tokens / original_tokens (1.0 = none)
      method            str        - "headroom" | "passthrough"

    On ANY failure (or headroom absent, or no savings) returns the text unchanged
    with method="passthrough", key=None, ratio=1.0.
    """
    original = text or ""
    o_tokens = _approx_tokens(original)
    if not original.strip() or o_tokens < MIN_TOKENS:
        return _passthrough(original, o_tokens)

    compress_fn, cfg = _engine()
    if compress_fn is None:
        return _passthrough(original, o_tokens)

    try:
        result = compress_fn([{"role": "user", "content": original}], config=cfg)
        msgs = getattr(result, "messages", None)
        compressed = ""
        if msgs and isinstance(msgs[-1], dict):
            compressed = msgs[-1].get("content", "") or ""
        # No savings (router no-op / protected) -> honest passthrough, no key needed.
        if not compressed or compressed == original:
            return _passthrough(original, o_tokens)
    except Exception as e:
        log.warning("headroom compress failed, returning original: %r", e)
        return _passthrough(original, o_tokens)

    # Real compression happened: cache the original for reversible retrieve().
    key = f"hr-{uuid.uuid4().hex[:16]}"
    _cache_put(key, original)

    c_tokens = getattr(result, "tokens_after", None) or _approx_tokens(compressed)
    before = getattr(result, "tokens_before", None) or o_tokens
    ratio = round(c_tokens / before, 3) if before else 1.0
    return {
        "compressed": compressed,
        "key": key,
        "original_tokens": o_tokens,
        "compressed_tokens": c_tokens,
        "ratio": ratio,
        "method": "headroom",
    }


def retrieve(key: str) -> Optional[str]:
    """Return the original (full) text cached under `key`, or None if unavailable.

    headroom's library compress() exposes no CCR key, so the on-disk mirror IS the
    mechanism - and it is shared across the REST and MCP processes via the volume.
    """
    if not key:
        return None
    return _cache_get(key)


def stats() -> dict:
    """Best-effort availability snapshot for the stats tool/endpoint."""
    return {
        "available": _available(),
        "ccr_dir": CCR_DIR,
        "min_tokens": MIN_TOKENS,
        "enabled_env": os.environ.get("HEADROOM_ENABLED", "1"),
        "error": _state.get("err"),
    }
