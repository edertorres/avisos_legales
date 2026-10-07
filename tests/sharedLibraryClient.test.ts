import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { loadAndMigrateLibrary, SAVED_NOTICES_KEY, GENERATED_LOG_KEY } from '../src/utils/sharedLibraryClient';
import { DEFAULT_NOTICE_CONFIG } from '../src/data/samples';

function storage(t: TestContext) {
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
  } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  return values;
}
const item = { id: 'legacy', name: 'Legacy', config: DEFAULT_NOTICE_CONFIG,
  createdAt: '2026-10-07T15:00:00Z', updatedAt: '2026-10-07T15:00:00Z' };

test('local data is removed only after successful server migration', async t => {
  const values = storage(t);
  values.set(SAVED_NOTICES_KEY, JSON.stringify([item]));
  values.set(GENERATED_LOG_KEY, '[]');
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, '/api/library/migrate');
    assert.equal(options.method, 'POST');
    assert.equal(JSON.parse(String(options.body)).savedNotices[0].id, item.id);
    return Response.json({ savedNotices: [item], generatedLog: [] });
  });
  assert.equal((await loadAndMigrateLibrary()).savedNotices.length, 1);
  assert.equal(values.has(SAVED_NOTICES_KEY), false);
  assert.equal(values.has(GENERATED_LOG_KEY), false);
});

test('failed migration retains the complete local copy', async t => {
  const values = storage(t);
  const original = JSON.stringify([item]);
  values.set(SAVED_NOTICES_KEY, original);
  values.set(GENERATED_LOG_KEY, '[]');
  t.mock.method(globalThis, 'fetch', async () => new Response('Unavailable', { status: 500 }));
  await assert.rejects(loadAndMigrateLibrary());
  assert.equal(values.get(SAVED_NOTICES_KEY), original);
  assert.equal(values.get(GENERATED_LOG_KEY), '[]');
});
