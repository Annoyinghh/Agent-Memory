"""Regression coverage for rank fusion, isolation and durable vector repair."""
import pytest
from memory_engine import MemoryEngine
from retrieval import lexical_query, reciprocal_rank_fusion


@pytest.fixture
def engine(tmp_path, test_embedding):
    instance = MemoryEngine(str(tmp_path / 'db'), embedding_function=test_embedding)
    yield instance
    instance.close()


def vector_result(ids, docs):
    return {'ids': [ids], 'documents': [docs]}


def test_rank_fusion_consensus_and_duplicates():
    scores = reciprocal_rank_fusion({'fts': ['lexical', 'both', 'both'], 'vector': ['dense', 'both']})
    assert scores['both'] > scores['lexical'] == scores['dense']
    assert scores['lexical'] == pytest.approx(0.5)
    assert reciprocal_rank_fusion({'fts': ['x'], 'vector': ['x']})['x'] == pytest.approx(1)


def test_bm25_uses_relevance_not_insertion_order(engine, monkeypatch):
    engine.insert_memory('long', 'project', 'port alpha beta gamma delta epsilon', 'test')
    engine.insert_memory('short', 'project', 'port port port', 'test')
    monkeypatch.setattr(engine, '_safe_chroma_query', lambda args: vector_result([], []))
    rows = engine.hybrid_search('project', 'port')
    assert [r.id for r in rows] == ['short', 'long']
    assert rows[0].relevance == 'medium'
    assert rows[0].score_kind == 'rrf'


@pytest.mark.parametrize('namespace', ['shared:p', 'agent:one:private', 'project-name'])
def test_exact_namespace_in_both_channels(engine, monkeypatch, namespace):
    engine.insert_memory('own', namespace, 'port configuration', 'test')
    engine.insert_memory('foreign', namespace + ':private', 'port secret', 'test')
    # Even a broken vector index must not bypass the SQLite namespace check.
    monkeypatch.setattr(engine, '_safe_chroma_query', lambda args: vector_result(['foreign','own'], ['port secret','port configuration']))
    assert [r.id for r in engine.hybrid_search(namespace, 'port')] == ['own']


@pytest.mark.parametrize('query', ['" OR namespace:private', 'path/to/memory_engine.py', 'AND NOT NEAR()', '"', '端口配置'])
def test_fts_input_is_literal(engine, monkeypatch, query):
    engine.insert_memory('x', 'n', '端口配置 memory_engine.py path AND', 's')
    monkeypatch.setattr(engine, '_safe_chroma_query', lambda args: vector_result([], []))
    _, diagnostics = engine.search_with_diagnostics('n', query)
    assert diagnostics['degraded_channels'] == []


def test_update_and_delete_cannot_move_or_remove_foreign_record(engine):
    engine.insert_memory('x', 'private', 'old', 'same%_prefix.txt')
    assert engine.update_memory('x', 'public', 'new', 's') is False
    assert engine.delete_memory('public', doc_id='x') == 0
    assert engine.delete_memory('public', source_prefix='same') == 0
    assert engine.conn.execute('SELECT namespace,content FROM memory_fts WHERE id=?', ('x',)).fetchone() == ('private','old')
    assert engine.delete_memory('private', source_prefix='same%_') == 1


def test_duplicate_ids_are_rejected(engine):
    engine.insert_memory('x', 'a', 'old', 's')
    with pytest.raises(ValueError):
        engine.insert_memory('x', 'b', 'new', 's')
    assert engine.conn.execute('SELECT count(*) FROM memory_fts WHERE id="x"').fetchone()[0] == 1


def test_failed_insert_is_durable_and_replayed_after_restart(engine, monkeypatch, test_embedding):
    def fail(**kwargs):
        raise RuntimeError('injected outage')
    monkeypatch.setattr(engine.collection, 'upsert', fail)
    engine.insert_memory('x', 'n', 'port 8900', 's')
    assert engine.pending_vector_sync() == 1
    assert engine.conn.execute('SELECT content FROM memory_fts WHERE id="x"').fetchone()[0] == 'port 8900'
    # A second process/engine reopens the same files and replays committed jobs.
    restarted = MemoryEngine(str(__import__('pathlib').Path(engine.sqlite_path).parent), embedding_function=test_embedding)
    try:
        assert restarted.sync_vector_index()['pending'] == 0
        assert restarted.collection.get(ids=['x'])['documents'] == ['port 8900']
        assert restarted.sync_vector_index()['synced'] == 0
    finally:
        restarted.close()


def test_failed_update_never_returns_stale_vector(engine, monkeypatch):
    engine.insert_memory('x', 'n', 'old port 8000', 's')
    monkeypatch.setattr(engine.collection, 'upsert', lambda **kwargs: (_ for _ in ()).throw(RuntimeError()))
    engine.update_memory('x', 'n', 'new port 8900', 's')
    monkeypatch.setattr(engine, '_safe_chroma_query', lambda args: vector_result(['x'], ['old port 8000']))
    results = engine.hybrid_search('n', 'port')
    assert results[0].content == 'new port 8900'
    assert results[0].channels == ['fts']
    assert engine.export_namespace('n')['memories'][0]['embedding'] is None


def test_source_and_repair_job_are_atomic(engine, monkeypatch):
    monkeypatch.setattr(engine, '_queue_vector_sync', lambda ids: (_ for _ in ()).throw(RuntimeError()))
    with pytest.raises(RuntimeError):
        engine.insert_memory('x', 'n', 'port', 's')
    assert engine.conn.execute('SELECT count(*) FROM memory_fts').fetchone()[0] == 0
    assert engine.collection.count() == 0


def test_partial_vector_success_is_safe_to_retry(engine, monkeypatch):
    original = engine.collection.upsert
    def partial(**kwargs):
        original(**kwargs)
        raise RuntimeError('crash after successful vector write')
    with monkeypatch.context() as scoped:
        scoped.setattr(engine.collection, 'upsert', partial)
        engine.insert_memory('x', 'n', 'port', 's')
    assert engine.pending_vector_sync() == 1
    assert engine.sync_vector_index()['pending'] == 0
    assert engine.collection.count() == 1


def test_failed_delete_never_resurrects_vector(engine, monkeypatch):
    engine.insert_memory('x', 'n', 'port', 's')
    monkeypatch.setattr(engine.collection, 'delete', lambda **kwargs: (_ for _ in ()).throw(RuntimeError()))
    assert engine.delete_memory('n', doc_id='x') == 1
    assert engine.pending_vector_sync() == 1
    assert engine.hybrid_search('n', 'port') == []


def test_vector_outage_degrades_to_fts(engine, monkeypatch):
    engine.insert_memory('x', 'n', 'port 8900', 's')
    monkeypatch.setattr(engine, '_safe_chroma_query', lambda args: (_ for _ in ()).throw(RuntimeError()))
    rows, info = engine.search_with_diagnostics('n', 'port')
    assert [r.id for r in rows] == ['x']
    assert info['degraded_channels'] == ['vector']


def test_old_code_is_not_decayed_out_of_relevance_search(engine):
    engine.insert_memory('x', 'n', 'port', 's')
    initial = engine.hybrid_search('n', 'port')[0].score
    engine.conn.execute('UPDATE memory_fts SET timestamp=1 WHERE id="x"')
    engine.conn.commit()
    assert engine.hybrid_search('n', 'port')[0].score == initial


def test_backup_restore_preserves_contents_stats_and_graph(engine, tmp_path, test_embedding):
    engine.insert_memory('x', 'n', 'port configuration', 's')
    engine.insert_memory('y', 'n', 'server', 's')
    engine.set_pinned('x', True)
    engine.record_access('x')
    engine.add_edge('x','y','calls')
    backup = engine.export_namespace('n')
    restored = MemoryEngine(str(tmp_path/'restored'), embedding_function=test_embedding)
    try:
        restored.import_namespace(backup)
        assert restored.pending_vector_sync() == 0
        assert restored._get_stats('x') == {'access_count':1,'is_pinned':True}
        assert restored.get_neighbors('x')[0]['id'] == 'y'
        assert restored.hybrid_search('n','configuration')[0].id == 'x'
    finally:
        restored.close()


def test_schema_initialization_is_repeatable(engine):
    engine.insert_memory('x','n','port','s')
    engine._init_sqlite()
    engine._init_sqlite()
    assert engine.hybrid_search('n','port')[0].id == 'x'


def test_protected_core_writes_are_checked_by_engine(engine):
    engine.insert_memory('x','n','port','s')
    engine.protect_namespace('n')
    for action in [lambda: engine.insert_memory('y','n','new','s'),
                   lambda: engine.update_memory('x','n','new','s'),
                   lambda: engine.delete_memory('n',doc_id='x'),
                   lambda: engine.clear_namespace('n')]:
        with pytest.raises(PermissionError):
            action()
