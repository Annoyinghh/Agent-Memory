import threading
import pytest
import gzip

from graph_adapter import parse_graphify_json
from task_manager import TaskManager
from memory_engine import MemoryEngine


@pytest.mark.parametrize('payload', [b'', b'source', b'code context\n' * 100000],
                         ids=['empty', 'short', 'multi-chunk'])
def test_streamed_gzip_roundtrips_empty_and_multichunk_payloads(payload):
    from api import _gzip_stream
    assert gzip.decompress(b''.join(_gzip_stream(payload, chunk_size=17))) == payload


def test_background_operation_reports_progress_and_result():
    manager = TaskManager()
    finished = threading.Event()

    def operation(progress_callback):
        progress_callback('import', 1, 2, 'halfway')
        finished.set()
        return {'nodes_imported': 2}

    task_id = manager.submit(operation)
    assert finished.wait(2)
    # Join only this test's operation, without timing-dependent sleeps.
    for thread in threading.enumerate():
        if thread.name == f'memory-task-{task_id}':
            thread.join(2)
    task = manager.get_task_dict(task_id)
    assert task['status'] == 'completed'
    assert task['percent'] == 100
    assert task['result'] == {'nodes_imported': 2}


def test_background_failure_is_inspectable():
    manager = TaskManager()

    def operation(progress_callback):
        raise ValueError('invalid graph')

    task_id = manager.submit(operation)
    for thread in threading.enumerate():
        if thread.name == f'memory-task-{task_id}':
            thread.join(2)
    task = manager.get_task_dict(task_id)
    assert task['status'] == 'failed'
    assert 'invalid graph' in task['error']


def test_graph_parser_preserves_evidence_for_both_input_shapes():
    node = {'id': 'f', 'label': 'function: load', 'source_file': 'main.py',
            'source_location': 'L4', 'community': 3, 'summary': 'Load records'}
    edges = [{'source': 'f', 'target': 'g', 'confidence': 0.95},
             {'source': 'g', 'target': 'h', 'confidence': 'EXTRACTED'},
             {'source': 'h', 'target': 'f', 'confidence': 'INFERRED'}]
    for raw in ([node], {'f': node}):
        nodes, parsed = parse_graphify_json({'nodes': raw, 'edges': edges}, source_root='/repo')
        assert nodes[0]['community'] == 3
        assert nodes[0]['summary'] == 'Load records'
        assert nodes[0]['source_root'] == '/repo'
        assert nodes[0]['source_location'] == 'L4'
        assert [edge['confidence'] for edge in parsed] == [0.95, 1.0, 0.7]


def test_source_lookup_requires_disambiguation(tmp_path, test_embedding):
    engine = MemoryEngine(str(tmp_path / 'db'), embedding_function=test_embedding)
    try:
        engine.import_graph_data([
            {'id': 'a', 'label': 'function: handler', 'source_file': 'a.py'},
            {'id': 'b', 'label': 'function: handler', 'source_file': 'b.py'},
        ], [], 'project')
        result = engine.get_code_snippet('project', qualified_name='handler')
        assert result.get('error') == 'ambiguous'
        assert {row['source_file'] for row in result['candidates']} == {'a.py', 'b.py'}
    finally:
        engine.close()


def test_call_trace_does_not_match_names_in_other_nodes_source(tmp_path, test_embedding):
    source = tmp_path / 'orders.py'
    source.write_text('def load_orders():\n    return [42]\n\ndef process_orders():\n    return load_orders()\n', encoding='utf-8')
    engine = MemoryEngine(str(tmp_path / 'db'), embedding_function=test_embedding)
    try:
        engine.import_graph_data([
            {'id': 'load', 'label': 'load_orders()', 'source_file': str(source), 'source_location': 'L1'},
            {'id': 'process', 'label': 'process_orders()', 'source_file': str(source), 'source_location': 'L4'},
        ], [{'source': 'process', 'target': 'load', 'relation': 'calls'}], 'project')
        result = engine.trace_path('project', 'process_orders')
        assert 'error' not in result, result
        assert [node['label'] for node in result['nodes']] == ['process_orders()', 'load_orders()']
        pages = [engine.search_graph('project', name_regex='orders', limit=1, offset=offset) for offset in (0, 1)]
        assert [page['total'] for page in pages] == [2, 2]
        assert {page['results'][0]['label'] for page in pages} == {'process_orders()', 'load_orders()'}
    finally:
        engine.close()


def test_change_detection_fallback_respects_source_roots(tmp_path, monkeypatch, test_embedding):
    from hashlib import sha256

    allowed = tmp_path / 'source'
    allowed.mkdir()
    changed = allowed / 'changed.py'
    unchanged = allowed / 'unchanged.py'
    outside = tmp_path / 'outside.py'
    for path, content in [(changed, b'new'), (unchanged, b'old'), (outside, b'new')]:
        path.write_bytes(content)
    monkeypatch.setenv('CODEBASE_SOURCE_ROOTS', str(allowed))
    monkeypatch.setattr('shutil.which', lambda _command: None)

    engine = MemoryEngine(str(tmp_path / 'db'), embedding_function=test_embedding)
    try:
        files = [changed, unchanged, outside, allowed / 'missing.py']
        engine.upsert_manifest('project', {str(path): sha256(b'old').hexdigest() for path in files}, 0)
        result = engine.detect_changes('project')
        assert result['fallback'] == 'hash_diff'
        assert result['changed_files'] == [str(changed)]
    finally:
        engine.close()
