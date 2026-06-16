import pytest
import os
import shutil
import tempfile
from unittest.mock import patch
from memory_engine import MemoryEngine

@pytest.fixture
def memory_engine():
    # Use a temporary directory for tests
    temp_dir = tempfile.mkdtemp()
    engine = MemoryEngine(db_dir=temp_dir)
    yield engine
    # Cleanup after test
    engine.close()
    shutil.rmtree(temp_dir, ignore_errors=True)

def test_update_memory_updates_content_and_source(memory_engine):
    doc_id = "test_doc_1"
    namespace = "test_ns"
    original_content = "This is the original content."
    original_source = "original.txt"
    
    # Insert initial memory
    memory_engine.insert_memory(doc_id, namespace, original_content, original_source)
    
    # Verify it exists
    results = memory_engine.hybrid_search(namespace, "original", top_k=1)
    assert len(results) == 1
    assert results[0].content == original_content
    
    # Perform update
    new_content = "This is the updated content."
    new_source = "updated.txt"
    
    success = memory_engine.update_memory(doc_id, namespace, new_content, new_source)
    assert success is True
    
    # Verify the update in SQLite (FTS5) via search
    updated_results = memory_engine.hybrid_search(namespace, "updated", top_k=1)
    assert len(updated_results) == 1
    assert updated_results[0].content == new_content
    assert updated_results[0].source == new_source

def test_insert_memory_deduplicates_similar_content(memory_engine):
    namespace = "test_dedup_ns"
    
    content1 = "The user prefers to use Python for backend development."
    source1 = "chat_log_1"
    doc_id1 = memory_engine.insert_memory("doc_1", namespace, content1, source1)
    
    content2 = "User's preferred language for the backend is Python."
    source2 = "chat_log_2"
    
    doc_id2 = memory_engine.insert_memory("doc_2", namespace, content2, source2, dedup_threshold=0.5)
    
    assert doc_id2 == doc_id1
    
    results = memory_engine.hybrid_search(namespace, "Python backend", top_k=5)
    assert len(results) == 1
    assert results[0].content == content2
    
def test_insert_memory_allows_distinct_content(memory_engine):
    namespace = "test_dedup_ns"
    
    content1 = "The user prefers to use Python for backend development."
    doc_id1 = memory_engine.insert_memory("doc_1", namespace, content1, "src1")
    
    content2 = "The server is running on port 8900."
    doc_id2 = memory_engine.insert_memory("doc_2", namespace, content2, "src2", dedup_threshold=0.5)
    
    assert doc_id1 != doc_id2
    
    results = memory_engine.hybrid_search(namespace, "server", top_k=5)
    assert memory_engine.collection.count() == 2

def test_pack_context(memory_engine):
    # RED Phase: Test new LLM-friendly XML context packing
    namespace = "test_pack_ns"
    
    # Insert multiple memories
    memory_engine.insert_memory("doc_1", namespace, "First memory block, relatively short.", "src1")
    memory_engine.insert_memory("doc_2", namespace, "Second memory block, contains more details about the system.", "src2")
    memory_engine.insert_memory("doc_3", namespace, "Third memory block, just extra info.", "src3")
    
    packed_context = memory_engine.pack_context(namespace, "memory", max_tokens=100)
    
    assert isinstance(packed_context, str)
    assert "<context>" in packed_context
    assert "</context>" in packed_context
    assert "<memory source=" in packed_context
    assert 'relevance=' in packed_context
    assert 'age=' in packed_context
    
    # Test budget constraint (no hard truncation, skips if it doesn't fit)
    packed_tight = memory_engine.pack_context(namespace, "memory", max_tokens=10)
    # Should probably be empty or just <context></context> because a full block won't fit in 40 chars
    assert packed_tight == "<context></context>" or "memory block" not in packed_tight

def test_short_term_memory_sliding_window(memory_engine):
    # RED Phase: Test short term memory sliding window behavior
    namespace = "stm_test_ns"
    
    # We should be able to configure the window size. 
    # Let's say we set the limit to 3 for this namespace.
    # Note: the engine could accept it globally or per method. We'll assume a property we can change or default.
    memory_engine.short_term_window_size = 3
    
    memory_engine.add_short_term_memory(namespace, "user", "Message 1")
    memory_engine.add_short_term_memory(namespace, "assistant", "Response 1")
    memory_engine.add_short_term_memory(namespace, "user", "Message 2")
    
    history = memory_engine.get_short_term_memory(namespace)
    assert len(history) == 3
    assert history[0]["content"] == "Message 1"
    
    # Add a 4th message, should push out the 1st
    memory_engine.add_short_term_memory(namespace, "assistant", "Response 2")
    history = memory_engine.get_short_term_memory(namespace)
    
    assert len(history) == 3
    assert history[0]["content"] == "Response 1"
    assert history[-1]["content"] == "Response 2"
    
    # Ensure it's not in ChromaDB
    results = memory_engine.hybrid_search(namespace, "Message 1", top_k=5)
    assert len(results) == 0

def test_working_memory_crud(memory_engine):
    # RED Phase: Working Memory (Scratchpad)
    namespace = "wm_test_ns"
    
    # 1. Write to working memory (key, value)
    memory_engine.write_working_memory(namespace, "current_plan", "Plan phase 1: Write tests.")
    
    # 2. Read from working memory
    val = memory_engine.read_working_memory(namespace, "current_plan")
    assert val == "Plan phase 1: Write tests."
    
    # 3. Update existing key
    memory_engine.write_working_memory(namespace, "current_plan", "Plan phase 1: Done.")
    val_updated = memory_engine.read_working_memory(namespace, "current_plan")
    assert val_updated == "Plan phase 1: Done."
    
    # 4. Read non-existent key
    val_missing = memory_engine.read_working_memory(namespace, "non_existent")
    assert val_missing is None
    
    # 5. List keys
    memory_engine.write_working_memory(namespace, "bug_001", "Exception on line 42")
    state = memory_engine.list_working_memory(namespace)
    assert "current_plan" in state
    assert "bug_001" in state
    assert state["current_plan"] == "Plan phase 1: Done."
    
    # 6. Delete key
    memory_engine.delete_working_memory(namespace, "current_plan")
    state_after_delete = memory_engine.list_working_memory(namespace)
    assert "current_plan" not in state_after_delete
    assert "bug_001" in state_after_delete

    # 7. Clear all working memory for namespace
    memory_engine.clear_working_memory(namespace)
    state_after_clear = memory_engine.list_working_memory(namespace)
    assert len(state_after_clear) == 0

def test_precise_source_search_reads_indexed_source_snippets(memory_engine, tmp_path):
    namespace = "source_search_ns"
    source_file = tmp_path / "client.py"
    source_file.write_text(
        "\n".join([
            "def build_payload():",
            "    payload = {",
            "        'api_key': 'secret',",
            "        'timeout_seconds': 30,",
            "    }",
            "    return payload",
        ]),
        encoding="utf-8",
    )

    doc_id = "node_payload"
    memory_engine.cursor.execute(
        "INSERT INTO memory_fts (id, namespace, content, source, timestamp) VALUES (?, ?, ?, ?, ?)",
        (
            doc_id,
            namespace,
            "build_payload() creates the private request payload.",
            f"graphify:{source_file}:code",
            1,
        ),
    )
    memory_engine.cursor.execute(
        "INSERT OR IGNORE INTO memory_stats (id, access_count, is_pinned) VALUES (?, 0, 0)",
        (doc_id,),
    )
    memory_engine.cursor.execute(
        '''INSERT OR REPLACE INTO graph_nodes
           (id, node_type, source_file, source_location, file_type, community_id, external_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)''',
        (doc_id, "function", str(source_file), "1:6", "code", 0, "build_payload"),
    )
    memory_engine.conn.commit()

    results = memory_engine.precise_source_search(namespace, "timeout_seconds", max_results=3, context_lines=1)

    assert len(results) == 1
    assert results[0]["source_file"] == str(source_file)
    assert results[0]["line"] == 4
    assert "3:         'api_key': 'secret'," in results[0]["snippet"]
    assert "4:         'timeout_seconds': 30," in results[0]["snippet"]

def test_precise_source_search_only_reads_graph_indexed_files(memory_engine, tmp_path):
    namespace = "source_search_ns"
    unindexed_file = tmp_path / "unindexed.py"
    unindexed_file.write_text("PRIVATE_TOKEN = 'not indexed'\n", encoding="utf-8")

    results = memory_engine.precise_source_search(namespace, "PRIVATE_TOKEN", max_results=3)

    assert results == []

def test_import_graph_data_preserves_location_and_embeds_source_context(memory_engine, tmp_path, monkeypatch):
    namespace = "graph_import_ns"
    source_file = tmp_path / "service.py"
    source_file.write_text(
        "\n".join([
            "class Client:",
            "    def post_payload(self):",
            "        body = {'tracked_field_ids': [1, 2, 3]}",
            "        return body",
        ]),
        encoding="utf-8",
    )
    added_documents = []

    def fake_add(documents, metadatas, ids):
        added_documents.extend(documents)

    monkeypatch.setattr(memory_engine.collection, "add", fake_add)

    result = memory_engine.import_graph_data(
        nodes=[{
            "id": "post_payload",
            "label": "post_payload()",
            "content": "post_payload()",
            "source_file": "service.py",
            "source_location": "L2",
            "source_root": str(tmp_path),
            "file_type": "code",
        }],
        edges=[],
        namespace=namespace,
    )

    assert result["nodes_imported"] == 1
    memory_engine.cursor.execute(
        '''SELECT m.content, gn.source_file, gn.source_location
           FROM memory_fts m JOIN graph_nodes gn ON m.id = gn.id
           WHERE m.namespace = ?''',
        (namespace,),
    )
    content, stored_source_file, stored_location = memory_engine.cursor.fetchone()
    assert stored_source_file == "service.py"
    assert stored_location == "L2"
    assert "label: post_payload()" in content
    assert "source: service.py:L2" in content
    assert "tracked_field_ids" in content
    assert added_documents == [content]

@patch('memory_engine.litellm.completion')
def test_consolidate_memory(mock_completion, memory_engine):
    namespace = "consolidation_test_ns"
    
    memory_engine.add_short_term_memory(namespace, "user", "I want to use Python.")
    memory_engine.add_short_term_memory(namespace, "assistant", "Great, Python it is.")
    memory_engine.add_short_term_memory(namespace, "user", "And let's use FastAPI for the backend.")
    
    class MockMessage:
        content = "The user decided to use Python and FastAPI for the backend."
    class MockChoice:
        message = MockMessage()
    class MockResponse:
        choices = [MockChoice()]
        
    mock_completion.return_value = MockResponse()
    
    result_doc_id = memory_engine.consolidate_memory(namespace)
    
    assert len(memory_engine.get_short_term_memory(namespace)) == 0
    assert result_doc_id is not None
    results = memory_engine.hybrid_search(namespace, "Python FastAPI", top_k=1)
    assert len(results) == 1
    assert "Python and FastAPI" in results[0].content
    assert results[0].source == "consolidation"

def test_importance_scoring_access_count(memory_engine):
    # RED Phase: Importance Scoring (Access Count)
    namespace = "importance_test_ns"
    doc_id = memory_engine.insert_memory("doc_freq_1", namespace, "This is a frequently accessed memory.", "test")
    
    # Initial score should be 1.0 (approx, depending on search match)
    results1 = memory_engine.hybrid_search(namespace, "frequently accessed memory", top_k=1)
    initial_score = results1[0].score
    
    # Simulate multiple accesses
    for _ in range(5):
        memory_engine.record_access(doc_id)
        
    # Score should increase
    results2 = memory_engine.hybrid_search(namespace, "frequently accessed memory", top_k=1)
    assert results2[0].score > initial_score

def test_importance_scoring_pinned(memory_engine):
    # RED Phase: Importance Scoring (Pinned)
    namespace = "importance_test_ns"
    doc_id = memory_engine.insert_memory("doc_pin_1", namespace, "This is a normal memory.", "test")
    
    results1 = memory_engine.hybrid_search(namespace, "normal memory", top_k=1)
    initial_score = results1[0].score
    
    # Pin it
    memory_engine.set_pinned(doc_id, True)
    
    # Score should get a massive boost
    results2 = memory_engine.hybrid_search(namespace, "normal memory", top_k=1)
    assert results2[0].score >= initial_score * 1.9
\
def test_active_forgetting(memory_engine):
    namespace = 'forget_test_ns'
    ids = []
    for i in range(5):
        ids.append(memory_engine.insert_memory(f'doc_forget_{i}', namespace, f'Forgettable memory {i}', 'test'))
    memory_engine.set_pinned(ids[0], True)
    deleted_count = memory_engine.active_forgetting(namespace, max_capacity=3)
    assert deleted_count == 2
    memory_engine.cursor.execute('SELECT COUNT(*) FROM memory_fts WHERE namespace=?', (namespace,))
    assert memory_engine.cursor.fetchone()[0] == 3
    memory_engine.cursor.execute('SELECT COUNT(*) FROM memory_fts WHERE id=?', (ids[0],))
    assert memory_engine.cursor.fetchone()[0] == 1

def test_session_management_and_isolation(memory_engine):
    namespace = "session_test_ns"
    session1 = "sess_001"
    session2 = "sess_002"
    
    # 1. Create sessions
    memory_engine.create_session(session1, namespace)
    memory_engine.create_session(session2, namespace)
    
    # 2. List sessions
    sessions = memory_engine.list_sessions(namespace)
    assert len(sessions) == 2
    assert session1 in [s["id"] for s in sessions]
    
    # 3. Short-term memory isolation
    memory_engine.add_short_term_memory(namespace, "user", "Hello session 1", session_id=session1)
    memory_engine.add_short_term_memory(namespace, "user", "Hello session 2", session_id=session2)
    
    history1 = memory_engine.get_short_term_memory(namespace, session_id=session1)
    history2 = memory_engine.get_short_term_memory(namespace, session_id=session2)
    
    assert len(history1) == 1 and history1[0]["content"] == "Hello session 1"
    assert len(history2) == 1 and history2[0]["content"] == "Hello session 2"
    
    # 4. Working memory isolation
    memory_engine.write_working_memory(namespace, "current_task", "Task 1", session_id=session1)
    memory_engine.write_working_memory(namespace, "current_task", "Task 2", session_id=session2)
    
    task1 = memory_engine.read_working_memory(namespace, "current_task", session_id=session1)
    task2 = memory_engine.read_working_memory(namespace, "current_task", session_id=session2)
    
    assert task1 == "Task 1"
    assert task2 == "Task 2"
