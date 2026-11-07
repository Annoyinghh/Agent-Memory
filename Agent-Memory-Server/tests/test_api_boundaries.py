import pytest
import gzip
import json
import threading
from fastapi.testclient import TestClient
import api
from memory_engine import MemoryEngine


@pytest.mark.parametrize('endpoint', ['/api/restore', '/api/graph/artifact/restore'])
def test_restore_routes_replace_data_and_keep_task_contract(client, endpoint):
    record = client.post('/api/memory/insert', json={
        'namespace': 'project', 'content': 'original source evidence', 'source': 'notes',
    }).json()
    backup = client.get('/api/backup', params={'namespace': 'project'}).content
    assert json.loads(gzip.decompress(backup))['format'] == 'agent-memory-backup'
    client.post('/api/memory/update', json={
        'doc_id': record['id'], 'namespace': 'project', 'content': 'changed', 'source': 'notes',
    })
    response = client.post(endpoint, files={'file': ('project.json.gz', backup, 'application/gzip')})
    assert response.status_code == 200
    task_id = response.json()['task_id']
    for thread in threading.enumerate():
        if thread.name == f'memory-task-{task_id}':
            thread.join(5)
    task = client.get(f'/api/tasks/{task_id}').json()
    assert task['status'] == 'completed', task
    assert task['percent'] == 100
    results = client.post('/api/memory/search', json={'namespace': 'project', 'query': ''}).json()['results']
    assert results[0]['content'] == 'original source evidence'


@pytest.mark.parametrize('endpoint', ['/api/restore', '/api/graph/artifact/restore'])
def test_restore_routes_reject_invalid_or_protected_uploads(client, endpoint):
    assert client.post(endpoint, files={'file': ('bad.gz', b'invalid')}).status_code == 400
    client.post('/api/namespaces/protect', json={'namespace': 'project'})
    backup = {'format': 'agent-memory-backup', 'namespace': 'project'}
    response = client.post(endpoint, files={'file': ('project.json', json.dumps(backup).encode())})
    assert response.status_code == 403


@pytest.fixture
def client(tmp_path, monkeypatch, test_embedding):
    monkeypatch.setenv('MEMORY_DB_DIR', str(tmp_path/'api'))
    monkeypatch.setattr(api, 'MemoryEngine', lambda **kwargs: MemoryEngine(**kwargs, embedding_function=test_embedding))
    with TestClient(api.app) as client:
        yield client


def test_api_update_delete_and_source_prefix_are_namespace_scoped(client):
    item = client.post('/api/memory/insert',json={'namespace':'private','content':'secret port','source':'shared/path'}).json()
    assert client.post('/api/memory/update',json={'doc_id':item['id'],'namespace':'public','content':'overwritten','source':'s'}).status_code == 404
    for selection in [{'doc_id':item['id']},{'source_prefix':'shared/'}]:
        response = client.request('DELETE','/api/memory/delete',json={'namespace':'public',**selection})
        assert response.json()['deleted_count'] == 0
    assert client.get('/api/memory/search',params={'namespace':'private','query':'port'}).json()['results'][0]['content'] == 'secret port'


def test_api_exposes_rank_contract_and_request_local_degradation(client, monkeypatch):
    client.post('/api/memory/insert',json={'namespace':'n','content':'port configuration','source':'s'})
    monkeypatch.setattr(api.engine, '_safe_chroma_query', lambda args: (_ for _ in ()).throw(RuntimeError()))
    for response in [client.post('/api/memory/search',json={'namespace':'n','query':'port'}),
                     client.get('/api/memory/search',params={'namespace':'n','query':'port'})]:
        body = response.json()
        assert body['degraded_channels'] == ['vector']
        assert body['results'][0]['score_kind'] == 'rrf'
        assert body['results'][0]['channels'] == ['fts']
        assert body['results'][0]['score'] == 0.5
