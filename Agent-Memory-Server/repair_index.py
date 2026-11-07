"""Replay durable Chroma jobs. Use --requeue-all for a full source/index repair."""
import argparse
import json
from memory_engine import MemoryEngine


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db-dir', required=True, help='Absolute database directory')
    parser.add_argument('--requeue-all', action='store_true')
    args = parser.parse_args()
    import os
    if not os.path.isabs(args.db_dir):
        parser.error('--db-dir must be absolute')
    engine = MemoryEngine(args.db_dir)
    try:
        if args.requeue_all:
            engine.requeue_vector_index()
        while engine.pending_vector_sync():
            status = engine.sync_vector_index()
            print(json.dumps(status))
            if status['error']:
                return 1
        print(json.dumps({'pending': 0}))
        return 0
    finally:
        engine.close()


if __name__ == '__main__':
    raise SystemExit(main())
