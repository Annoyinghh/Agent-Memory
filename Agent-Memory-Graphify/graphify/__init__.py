"""graphify - AST extraction core (trimmed for Agent-Memory).

Only the extraction closure is kept: extract, cache, mcp_ingest, security,
detect, google_workspace. The build/cluster/analyze/report/export/wiki modules
and the skill .md assets were removed; graphify is used here purely as a
library (graphify_bridge.py: `from graphify.extract import extract, collect_files`).
"""


def __getattr__(name):
    # Lazy attribute access on the package. Only the extraction entry points
    # remain after trimming.
    _map = {
        "extract": ("graphify.extract", "extract"),
        "collect_files": ("graphify.extract", "collect_files"),
    }
    if name in _map:
        import importlib
        mod_name, attr = _map[name]
        mod = importlib.import_module(mod_name)
        return getattr(mod, attr)
    raise AttributeError(f"module 'graphify' has no attribute {name!r}")
