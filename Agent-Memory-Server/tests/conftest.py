"""Offline integration fixtures: real SQLite/Chroma, deterministic test vectors.

These vectors exercise persistence/ranking contracts, NOT semantic model quality.
"""
import hashlib
import re
import pytest
from chromadb.api.types import EmbeddingFunction


class TestEmbedding(EmbeddingFunction):
    def __call__(self, input):
        result = []
        for text in input:
            vector = [0.0] * 64
            for word in re.findall(r'\w+', text.lower()):
                slot = int.from_bytes(hashlib.sha256(word.encode()).digest()[:4], 'little') % 64
                vector[slot] += 1.0
            norm = sum(v*v for v in vector) ** 0.5 or 1.0
            result.append([v / norm for v in vector])
        return result

    @staticmethod
    def name():
        return 'agent-memory-test-hash'

    def get_config(self):
        return {}

    @staticmethod
    def build_from_config(config):
        return TestEmbedding()


@pytest.fixture
def test_embedding():
    return TestEmbedding()


@pytest.fixture(autouse=True)
def isolated_source_root(tmp_path, monkeypatch):
    monkeypatch.setenv('CODEBASE_SOURCE_ROOTS', str(tmp_path))
    monkeypatch.setenv('MEMORY_SEARCH_MODE', 'rrf')
    monkeypatch.delenv('PROTECTED_NAMESPACES', raising=False)
