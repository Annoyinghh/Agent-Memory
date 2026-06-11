import re
from typing import List

class TextChunker:
    """
    A lightweight recursive text chunker optimized for Markdown and source code.
    It splits text by largest structural delimiters first (e.g., Headers, then double newlines, then newlines).
    """
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 150):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        # Delimiters in order of priority (Markdown headers, paragraphs, single lines, spaces, chars)
        self.delimiters = [
            "\n# ", "\n## ", "\n### ", "\n#### ", 
            "\n\n", "\n", " ", ""
        ]

    def split_text(self, text: str) -> List[str]:
        if not text:
            return []
        return self._split_text(text, self.delimiters)

    def _split_text(self, text: str, delimiters: List[str]) -> List[str]:
        # If the text already fits in the chunk, return it
        if len(text) <= self.chunk_size:
            return [text]

        # Find the best delimiter to split on
        separator = delimiters[-1]
        new_delimiters = []
        for i, d in enumerate(delimiters):
            if d == "":
                separator = d
                break
            if d in text:
                separator = d
                new_delimiters = delimiters[i+1:]
                break

        # Split the text
        if separator:
            splits = text.split(separator)
        else:
            splits = list(text)

        # Merge splits into chunks
        chunks = []
        current_chunk = []
        current_len = 0

        for split in splits:
            split_len = len(split) if not separator else len(split) + len(separator)
            
            if current_len + split_len > self.chunk_size and current_len > 0:
                # current chunk is full
                chunk_text = separator.join(current_chunk)
                if chunk_text:
                    chunks.append(chunk_text.strip())
                
                # Backtrack for overlap
                overlap_len = 0
                overlap_splits = []
                for s in reversed(current_chunk):
                    s_len = len(s) if not separator else len(s) + len(separator)
                    if overlap_len + s_len > self.chunk_overlap and overlap_len > 0:
                        break
                    overlap_splits.insert(0, s)
                    overlap_len += s_len
                
                current_chunk = overlap_splits + [split]
                current_len = overlap_len + split_len
            else:
                current_chunk.append(split)
                current_len += split_len

        # Add the last chunk
        if current_chunk:
            chunk_text = separator.join(current_chunk)
            if chunk_text.strip():
                chunks.append(chunk_text.strip())

        # Further split chunks that are still too large
        final_chunks = []
        for chunk in chunks:
            if len(chunk) > self.chunk_size and new_delimiters:
                final_chunks.extend(self._split_text(chunk, new_delimiters))
            else:
                final_chunks.append(chunk)

        return final_chunks
