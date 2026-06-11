import os
import argparse
import uuid
from chunker import TextChunker
from memory_engine import MemoryEngine

def ingest_directory(directory: str, namespace: str, extensions: list):
    engine = MemoryEngine(db_dir="./data")
    chunker = TextChunker(chunk_size=1000, chunk_overlap=150)
    
    total_files = 0
    total_chunks = 0

    print(f"Starting ingestion for directory: {directory}")
    print(f"Namespace: {namespace}")
    print(f"Extensions: {extensions}")
    print("-" * 40)

    for root, dirs, files in os.walk(directory):
        # Skip common hidden/build dirs to save time
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('node_modules', 'venv', '__pycache__')]
        
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in extensions:
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    chunks = chunker.split_text(content)
                    total_files += 1
                    
                    for i, chunk in enumerate(chunks):
                        doc_id = f"ingest_{uuid.uuid4()}"
                        source = f"{file_path}#chunk_{i+1}"
                        engine.insert_memory(doc_id, namespace, chunk, source)
                        total_chunks += 1
                        
                    print(f"Ingested: {file_path} ({len(chunks)} chunks)")
                except Exception as e:
                    print(f"Error reading {file_path}: {e}")

    engine.close()
    print("-" * 40)
    print(f"Ingestion complete!")
    print(f"Files processed: {total_files}")
    print(f"Total memory chunks created: {total_chunks}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bulk Ingest Files into Agent Memory")
    parser.add_argument("--dir", type=str, required=True, help="Directory to scan")
    parser.add_argument("--namespace", type=str, required=True, help="Namespace to store the memories under")
    parser.add_argument("--ext", type=str, default=".md,.txt,.py", help="Comma-separated list of file extensions to include")
    
    args = parser.parse_args()
    
    ext_list = [e.strip() for e in args.ext.split(',')]
    ingest_directory(args.dir, args.namespace, ext_list)
