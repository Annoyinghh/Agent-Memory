import pytest
from chunker import TextChunker

def test_chunker_merges_and_filters_correctly():
    chunker = TextChunker(chunk_size=100, chunk_overlap=0, min_chunk_size=15)
    
    text2 = "This is a long chunk of text that easily passes the minimum threshold and is close to the limit.\n\nA.\n\nB.\n\nC."
    
    chunks2 = chunker.split_text(text2)
    # The first chunk will be the long text. (96 chars)
    # The second chunk will be "A.\n\nB.\n\nC." -> len is 11.
    # It should FAIL the min_chunk_size of 15!
    for chunk in chunks2:
        assert len(chunk) >= 15
        
    assert len(chunks2) == 1
    assert "This is a long chunk" in chunks2[0]
