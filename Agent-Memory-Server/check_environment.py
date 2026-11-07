"""Read-only startup preflight: no database, model downloads or API calls."""
import importlib
import sqlite3
import sys


def main():
    if sys.version_info < (3, 10):
        raise SystemExit('Python 3.10 or later required')
    for name in ['chromadb', 'litellm', 'fastapi', 'uvicorn', 'multipart', 'mcp.server.fastmcp']:
        importlib.import_module(name)
    with sqlite3.connect(':memory:') as db:
        db.execute('CREATE VIRTUAL TABLE probe USING fts5(text)')
    print('Python and backend dependencies OK')
    try:
        importlib.import_module('graphify.extract')
    except ImportError:
        print('Optional Graphify dependencies missing; install ./Agent-Memory-Graphify for AST extraction.')


if __name__ == '__main__':
    main()
