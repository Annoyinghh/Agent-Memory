import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, waitForTask } from '../src/lib/api.js';

test('graph requests retain namespace and explicit sample limit', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.equal(url, '/api/graph/data?namespace=project%3Aone&limit=75');
      return Response.json({ nodes: [], edges: [] });
    };
    await api.getGraphData('project:one', 75);
  } finally { globalThis.fetch = original; }
});

test('both restore routes send multipart uploads and propagate validation errors', async () => {
  const original = globalThis.fetch;
  try {
    const paths = [];
    globalThis.fetch = async (url, options) => {
      paths.push(url);
      assert.ok(options.body instanceof FormData);
      assert.equal(new Headers(options.headers).get('content-type'), null);
      return Response.json({ detail: 'protected namespace' }, { status: 403 });
    };
    for (const restore of [api.restoreNamespace, api.restoreArtifact]) {
      await assert.rejects(() => restore(new Blob(['{}']), 'project:one'), /protected namespace/);
    }
    assert.deepEqual(paths, ['/api/restore?target_namespace=project%3Aone', '/api/graph/artifact/restore?target_namespace=project%3Aone']);
  } finally { globalThis.fetch = original; }
});

test('task polling returns completion, exposes failure, and stops on cancellation', async () => {
  const original = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async () => Response.json(++calls === 1
      ? { status: 'running', percent: 20 }
      : { status: 'completed', result: { nodes_imported: 4 } });
    const progress = [];
    assert.deepEqual(await waitForTask('task', { intervalMs: 1, onProgress: value => progress.push(value.percent) }), { nodes_imported: 4 });
    assert.equal(calls, 2);
    assert.equal(progress[0], 20);
    globalThis.fetch = async () => Response.json({ status: 'failed', error: 'index failed' });
    await assert.rejects(() => waitForTask('task'), /index failed/);
    const controller = new AbortController();
    controller.abort();
    calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({ status: 'running' }); };
    await assert.rejects(() => waitForTask('task', { signal: controller.signal }), { name: 'AbortError' });
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});
