import re
from typing import List

class TextChunker:
    """
    A lightweight recursive text chunker optimized for Markdown and source code.
    It splits text by largest structural delimiters first (e.g., Headers, then double newlines, then newlines).
    """
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 150, min_chunk_size: int = 20):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.min_chunk_size = min_chunk_size
        # Delimiters in order of priority
        self.delimiters = [
            "\n# ", "\n## ", "\n### ", "\n#### ", 
            "\n\n", "\n", " ", ""
        ]

    def split_text(self, text: str) -> List[str]:
        if not text:
            return []
            
        chunks = self._split_text(text, self.delimiters)
        
        # Filter out chunks that are too small or just whitespace
        filtered_chunks = []
        for chunk in chunks:
            stripped_chunk = chunk.strip()
            if len(stripped_chunk) >= self.min_chunk_size:
                filtered_chunks.append(stripped_chunk)
                
        return filtered_chunks

    def _split_text(self, text: str, delimiters: List[str]) -> List[str]:
        # Find the best delimiter
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

        # If we couldn't find a delimiter (other than ""), or the text is small and we don't want to split by chars
        if separator == "" and len(text) <= self.chunk_size:
             return [text]

        # Split the text
        if separator:
            splits = text.split(separator)
        else:
            splits = list(text)

        # Merge splits
        good_splits = []
        for s in splits:
            if s:
                good_splits.append(s)

        if not good_splits:
            return []

        chunks = []
        current_chunk = []
        current_len = 0
        separator_len = len(separator)

        for s in good_splits:
            s_len = len(s)
            
            # If a single split is larger than chunk_size, we need to recursively split it
            if s_len > self.chunk_size and new_delimiters:
                # yield current chunk before we dive into the huge one
                if current_chunk:
                    chunks.append(separator.join(current_chunk))
                    current_chunk = []
                    current_len = 0
                
                chunks.extend(self._split_text(s, new_delimiters))
                continue

            # Check if adding this split exceeds the chunk size
            if current_len > 0 and current_len + separator_len + s_len > self.chunk_size:
                # Yield current chunk
                chunks.append(separator.join(current_chunk))
                
                # Setup overlap for next chunk
                overlap_len = 0
                overlap_chunk = []
                for prev_s in reversed(current_chunk):
                    prev_s_len = len(prev_s)
                    if overlap_len > 0:
                        prev_s_len += separator_len
                    
                    if overlap_len + prev_s_len > self.chunk_overlap and overlap_len > 0:
                        break
                    
                    overlap_chunk.insert(0, prev_s)
                    overlap_len += prev_s_len
                
                current_chunk = overlap_chunk
                current_len = overlap_len
                
                if current_len > 0:
                    current_len += separator_len
                current_len += s_len
                current_chunk.append(s)
            else:
                if current_len > 0:
                    current_len += separator_len
                current_len += s_len
                current_chunk.append(s)

        if current_chunk:
            chunks.append(separator.join(current_chunk))

        # We need to filter chunks here too, so that we drop small segments before they get merged back incorrectly?
        # No, if we drop small segments here, they are lost forever. We want to merge them if possible,
        # but if they end up as a standalone chunk and are too small, they get dropped by split_text.
        # Wait, if we use `\n\n` as separator, and we have `["Short.", "Long...", "A.", "Good."]`.
        # `Short.` -> len 6. < 100. current_chunk = ["Short."]
        # `Long...` -> len 90. 6 + 2 + 90 = 98 < 100. current_chunk = ["Short.", "Long..."]
        # `A.` -> len 2. 98 + 2 + 2 = 102 > 100. 
        #   yield `Short.\n\nLong...`
        #   overlap: `Long...` fits in overlap? 90 <= 20? No. overlap is empty.
        #   current_chunk = ["A."]
        # `Good.` -> len 50. 2 + 2 + 50 = 54 < 100. current_chunk = ["A.", "Good."]
        # yield `A.\n\nGood.`
        # 
        # In this scenario, "Short." is MERGED with "Long...", so it is NOT dropped.
        # Is that what we want? The user asked "为什么有些东西看上去像是没用的就只是一句话几个字而已" (Why are some chunks just a few words).
        # This implies they are standalone chunks.
        # If they are merged with useful context, that's fine. If they are standalone, they should be dropped.
        # Let's fix the test to reflect this understanding.
        
        return chunks
