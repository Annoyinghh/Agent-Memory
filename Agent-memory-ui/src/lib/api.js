/**
 * Agent Memory API Client Utility
 * Handles communications with the local memory backend at http://127.0.0.1:8900
 */

export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8900';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.detail || `HTTP Error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`API request error on ${path}:`, error);
    throw error;
  }
}

export const api = {
  /**
   * Get database statistics
   * @returns {Promise<{total_chunks: number, namespaces: Record<string, number>}>}
   */
  getStats: () => request('/api/stats', { method: 'GET' }),

  /**
   * List all namespaces
   * @returns {Promise<{namespaces: string[]}>}
   */
  getNamespaces: () => request('/api/namespaces', { method: 'GET' }),

  /**
   * Search database
   * @param {string} namespace
   * @param {string} query
   * @param {number} topK
   * @returns {Promise<{query: string, namespace: string, total: number, results: Array<{id: string, namespace: string, content: string, source: string, timestamp: number, score: number}>}>}
   */
  search: (namespace, query, topK = 5) =>
    request('/api/memory/search', {
      method: 'POST',
      body: JSON.stringify({ namespace, query, top_k: topK }),
    }),

  /**
   * Insert new memory chunk
   * @param {string} namespace
   * @param {string} content
   * @param {string} source
   * @param {number} dedupThreshold
   * @returns {Promise<{id: string, namespace: string, message: string}>}
   */
  insert: (namespace, content, source, dedupThreshold = 0.0) =>
    request('/api/memory/insert', {
      method: 'POST',
      body: JSON.stringify({ namespace, content, source, dedup_threshold: dedupThreshold }),
    }),

  /**
   * Update existing memory chunk by ID
   * @param {string} docId
   * @param {string} namespace
   * @param {string} content
   * @param {string} source
   * @returns {Promise<{id: string, namespace: string, message: string}>}
   */
  update: (docId, namespace, content, source) =>
    request('/api/memory/update', {
      method: 'POST',
      body: JSON.stringify({ doc_id: docId, namespace, content, source }),
    }),

  /**
   * Pack best context under a token budget
   * @param {string} namespace
   * @param {string} query
   * @param {number} maxTokens
   * @returns {Promise<{query: string, namespace: string, packed_context: string}>}
   */
  pack: (namespace, query, maxTokens = 2000) =>
    request('/api/memory/pack', {
      method: 'POST',
      body: JSON.stringify({ namespace, query, max_tokens: maxTokens }),
    }),

  /**
   * Create high priority state snapshot
   * @param {string} namespace
   * @param {string} summary
   * @returns {Promise<{id: string, namespace: string, message: string}>}
   */
  createSnapshot: (namespace, summary) =>
    request('/api/memory/snapshot', {
      method: 'POST',
      body: JSON.stringify({ namespace, summary }),
    }),

  /**
   * Delete memory by ID
   * @param {string} namespace
   * @param {string} docId
   * @returns {Promise<{deleted_count: number, message: string}>}
   */
  deleteById: (namespace, docId) =>
    request('/api/memory/delete', {
      method: 'DELETE',
      body: JSON.stringify({ namespace, doc_id: docId }),
    }),

  /**
   * Delete memory by Source Prefix
   * @param {string} namespace
   * @param {string} sourcePrefix
   * @returns {Promise<{deleted_count: number, message: string}>}
   */
  deleteBySourcePrefix: (namespace, sourcePrefix) =>
    request('/api/memory/delete', {
      method: 'DELETE',
      body: JSON.stringify({ namespace, source_prefix: sourcePrefix }),
    }),

  /**
   * Get short term dialog memory history
   * @param {string} namespace
   * @returns {Promise<{namespace: string, history: Array<{role: string, content: string, timestamp?: number}>}>}
   */
  getShortTermMemory: (namespace) =>
    request(`/api/memory/short_term?namespace=${encodeURIComponent(namespace)}`, {
      method: 'GET',
    }),

  /**
   * Add a dialogue turn to short term memory
   * @param {string} namespace
   * @param {string} role
   * @param {string} content
   * @returns {Promise<{namespace: string, message: string}>}
   */
  addShortTermMemory: (namespace, role, content) =>
    request('/api/memory/short_term', {
      method: 'POST',
      body: JSON.stringify({ namespace, role, content }),
    }),

  /**
   * Delete or clear short term dialog memory
   * @param {string} namespace
   * @param {number} [index] - Optional. If provided, deletes specific turn. Otherwise clears all.
   * @returns {Promise<{namespace: string, message: string}>}
   */
  deleteShortTermMemory: (namespace, index = null) => {
    const hasIndex = index !== null && index !== undefined && index !== '';
    const url = hasIndex 
      ? `/api/memory/short_term?namespace=${encodeURIComponent(namespace)}&index=${index}`
      : `/api/memory/short_term?namespace=${encodeURIComponent(namespace)}`;
    console.log('[API Client] deleteShortTermMemory URL:', url);
    return request(url, { method: 'DELETE' });
  },

  /**
   * List working memory state (scratchpad)
   * @param {string} namespace
   * @returns {Promise<{namespace: string, state: Record<string, string>}>}
   */
  listWorkingMemory: (namespace) =>
    request(`/api/memory/working/list?namespace=${encodeURIComponent(namespace)}`, {
      method: 'GET',
    }),

  /**
   * Write a key-value pair to working memory
   * @param {string} namespace
   * @param {string} key
   * @param {string} value
   * @returns {Promise<{message: string}>}
   */
  writeWorkingMemory: (namespace, key, value) =>
    request('/api/memory/working', {
      method: 'POST',
      body: JSON.stringify({ namespace, key, value }),
    }),

  /**
   * Delete a key from working memory
   * @param {string} namespace
   * @param {string} key
   * @returns {Promise<{message: string}>}
   */
  deleteWorkingMemory: (namespace, key) =>
    request(`/api/memory/working?namespace=${encodeURIComponent(namespace)}&key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
    }),

  /**
   * Clear all working memory keys for a namespace
   * @param {string} namespace
   * @returns {Promise<{message: string}>}
   */
  clearWorkingMemory: (namespace) =>
    request(`/api/memory/working/clear?namespace=${encodeURIComponent(namespace)}`, {
      method: 'DELETE',
    }),

  /**
   * Consolidate short term memories into long term memories
   * @param {string} namespace
   * @returns {Promise<{namespace: string, id: string|null, message: string}>}
   */
  consolidateMemory: (namespace) =>
    request('/api/memory/consolidate', {
      method: 'POST',
      body: JSON.stringify({ namespace }),
    }),
};
