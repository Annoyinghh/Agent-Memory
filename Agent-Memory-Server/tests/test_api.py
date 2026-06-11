import pytest
import os
import shutil
import tempfile
from fastapi.testclient import TestClient
from unittest.mock import patch

# Mock environment variable for the test to use a temporary DB
temp_dir = tempfile.mkdtemp()
os.environ["MEMORY_DB_DIR"] = temp_dir

from api import app, engine

@pytest.fixture
def client():
    # Use TestClient as a context manager to trigger lifespan events
    with TestClient(app) as client:
        yield client
        
@pytest.fixture(autouse=True)
def cleanup():
    yield
    # Cleanup DB files after each test module is run. This might need 
    # to be adjusted if tests run concurrently, but fine for simple tests.
    if engine:
        engine.close()
    shutil.rmtree(temp_dir, ignore_errors=True)


def test_api_update_memory(client):
    doc_id = "api_test_doc_1"
    namespace = "api_test_ns"
    original_content = "Original API content"
    original_source = "api.txt"
    
    global engine
    insert_resp = client.post("/api/memory/insert", json={
        "namespace": namespace,
        "content": original_content,
        "source": original_source
    })
    assert insert_resp.status_code == 200
    doc_id = insert_resp.json()["id"]
    
    new_content = "Updated API content"
    new_source = "updated_api.txt"
    
    update_resp = client.post("/api/memory/update", json={
        "doc_id": doc_id,
        "namespace": namespace,
        "content": new_content,
        "source": new_source
    })
    
    assert update_resp.status_code == 200
    assert update_resp.json()["message"] == "updated"
    
    search_resp = client.get(f"/api/memory/search?namespace={namespace}&query=Updated")
    assert search_resp.status_code == 200
    results = search_resp.json()["results"]
    
    assert len(results) >= 1
    updated_item = next((item for item in results if item["id"] == doc_id), None)
    assert updated_item is not None
    assert updated_item["content"] == new_content
    assert updated_item["source"] == new_source

def test_api_insert_deduplication(client):
    namespace = "api_dedup_ns"
    
    resp1 = client.post("/api/memory/insert", json={
        "namespace": namespace,
        "content": "The backend framework is FastAPI using Python.",
        "source": "docs",
        "dedup_threshold": 0.5
    })
    assert resp1.status_code == 200
    doc_id1 = resp1.json()["id"]
    
    resp2 = client.post("/api/memory/insert", json={
        "namespace": namespace,
        "content": "Python FastAPI is the framework for the backend.",
        "source": "chat",
        "dedup_threshold": 0.5
    })
    
    assert resp2.status_code == 200
    doc_id2 = resp2.json()["id"]
    
    assert doc_id1 == doc_id2
    
    stats_resp = client.get("/api/stats")
    assert stats_resp.json()["namespaces"].get(namespace, 0) == 1

def test_api_pack_context(client):
    namespace = "api_pack_ns"
    
    # Insert multiple items
    client.post("/api/memory/insert", json={"namespace": namespace, "content": "Short mem 1.", "source": "src1"})
    client.post("/api/memory/insert", json={"namespace": namespace, "content": "Detailed memory number 2 regarding the specific system.", "source": "src2"})
    
    # Request packed context
    resp = client.post("/api/memory/pack", json={
        "namespace": namespace,
        "query": "memory",
        "max_tokens": 100
    })
    
    assert resp.status_code == 200
    data = resp.json()
    assert "packed_context" in data
    assert "<context>" in data["packed_context"]
    assert "<memory source=" in data["packed_context"]

def test_api_short_term_memory(client):
    namespace = "api_stm_ns"
    
    # Add messages
    resp1 = client.post("/api/memory/short_term", json={
        "namespace": namespace,
        "role": "user",
        "content": "Hello!"
    })
    # Should fail if endpoint not implemented (404)
    assert resp1.status_code == 200
    
    client.post("/api/memory/short_term", json={
        "namespace": namespace,
        "role": "assistant",
        "content": "Hi there!"
    })
    
    # Retrieve messages
    resp_get = client.get(f"/api/memory/short_term?namespace={namespace}")
    assert resp_get.status_code == 200
    history = resp_get.json()["history"]
    
    assert len(history) == 2
    assert history[0]["role"] == "user"
    assert history[0]["content"] == "Hello!"
    assert history[1]["role"] == "assistant"
    assert history[1]["content"] == "Hi there!"

def test_api_working_memory_crud(client):
    namespace = "api_wm_ns"
    
    # Write
    resp_write = client.post("/api/memory/working", json={
        "namespace": namespace,
        "key": "test_key",
        "value": "test_value"
    })
    assert resp_write.status_code == 200
    
    # Read
    resp_read = client.get(f"/api/memory/working?namespace={namespace}&key=test_key")
    assert resp_read.status_code == 200
    assert resp_read.json()["value"] == "test_value"
    
    # List
    resp_list = client.get(f"/api/memory/working/list?namespace={namespace}")
    assert resp_list.status_code == 200
    state = resp_list.json()["state"]
    assert "test_key" in state
    assert state["test_key"] == "test_value"
    
    # Delete
    resp_del = client.delete(f"/api/memory/working?namespace={namespace}&key=test_key")
    assert resp_del.status_code == 200
    
    # Read after delete (should be None/404 or just return null value)
    resp_read_missing = client.get(f"/api/memory/working?namespace={namespace}&key=test_key")
    assert resp_read_missing.status_code == 404

@patch('api.engine.consolidate_memory')
def test_api_consolidate_memory(mock_consolidate, client):
    namespace = "api_consolidate_ns"
    mock_consolidate.return_value = "mock_doc_id"
    
    resp = client.post("/api/memory/consolidate", json={
        "namespace": namespace
    })
    
    # This will fail initially because the endpoint doesn't exist
    assert resp.status_code == 200
    assert resp.json()["id"] == "mock_doc_id"
    mock_consolidate.assert_called_once_with(namespace)

def test_api_importance_scoring(client):
    namespace = "api_importance_ns"
    insert_resp = client.post("/api/memory/insert", json={"namespace": namespace, "content": "Important test memory", "source": "test"})
    doc_id = insert_resp.json()["id"]
    
    # Test pin
    pin_resp = client.post("/api/memory/pin", json={"doc_id": doc_id, "is_pinned": True})
    assert pin_resp.status_code == 200
    
    # Test record access
    access_resp = client.post("/api/memory/access", json={"doc_id": doc_id})
    assert access_resp.status_code == 200
\
def test_api_active_forgetting(client):
    namespace = 'api_forget_ns'
    for i in range(5):
        client.post('/api/memory/insert', json={'namespace': namespace, 'content': f'content {i}', 'source': 'test'})
    resp = client.post('/api/memory/forget', json={'namespace': namespace, 'max_capacity': 3})
    assert resp.status_code == 200
    assert resp.json()['deleted_count'] == 2
\
