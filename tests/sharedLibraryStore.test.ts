import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SharedLibraryStore } from '../sharedLibraryStore';
import { DEFAULT_NOTICE_CONFIG } from '../src/data/samples';
import type { SavedNotice, GeneratedLogEntry } from '../src/types/sharedLibrary';

const notice = (id: string): SavedNotice => ({ id, name: id, config: DEFAULT_NOTICE_CONFIG, createdAt: '2026-10-07T15:00:00Z', updatedAt: '2026-10-07T15:00:00Z' });
const entry = (index: number): GeneratedLogEntry => ({ id: `entry-${index}`, title: 'Aviso', filename: 'aviso.pdf', config: DEFAULT_NOTICE_CONFIG, exportType: 'single-exact', generatedAt: new Date(1760000000000 + index * 1000).toISOString() });

async function fixture(t: TestContext) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'avisos-library-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, store: new SharedLibraryStore(directory) };
}

test('concurrent saves persist after a fresh store instance', async t => {
  const { directory, store } = await fixture(t);
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.addNotice(notice(`notice-${i}`))));
  const loaded = await new SharedLibraryStore(directory).get();
  assert.equal(loaded.savedNotices.length, 20);
  assert.deepEqual(loaded.savedNotices[0].config, DEFAULT_NOTICE_CONFIG);
});

test('migration merges, is idempotent, and does not restore deleted items', async t => {
  const { store } = await fixture(t);
  const local = { savedNotices: [notice('local')], generatedLog: [entry(1)] };
  await store.addNotice(notice('server'));
  await store.migrate(local);
  await store.migrate(local);
  assert.equal((await store.get()).savedNotices.length, 2);
  await store.deleteNotice('local');
  await store.clearLog();
  await store.migrate(local);
  const loaded = await store.get();
  assert.deepEqual(loaded.savedNotices.map(item => item.id), ['server']);
  assert.equal(loaded.generatedLog.length, 0);
});

test('history retains latest 200 records without resurrecting trimmed records', async t => {
  const { store } = await fixture(t);
  await store.migrate({ savedNotices: [], generatedLog: Array.from({ length: 205 }, (_, i) => entry(i)) });
  let loaded = await store.get();
  assert.equal(loaded.generatedLog.length, 200);
  assert.equal(loaded.generatedLog[0].id, 'entry-204');
  assert.equal(loaded.generatedLog.at(-1)?.id, 'entry-5');
  await store.clearLog();
  await store.migrate({ savedNotices: [], generatedLog: [entry(0)] });
  assert.equal((await store.get()).generatedLog.length, 0);
});

test('invalid existing storage fails without overwriting data', async t => {
  const { directory, store } = await fixture(t);
  const filename = path.join(directory, 'shared-library.json');
  await fs.writeFile(filename, 'invalid-json');
  await assert.rejects(store.addNotice(notice('new')));
  assert.equal(await fs.readFile(filename, 'utf8'), 'invalid-json');
  await fs.rm(filename);
  await store.addNotice(notice('recovered'));
  assert.equal((await store.get()).savedNotices.length, 1);
});
