import test from 'node:test';
import assert from 'node:assert/strict';
import { readServerError } from '../src/utils/pdfGenerator';

test('readServerError uses the JSON error field', async () => {
  const response = new Response(JSON.stringify({ error: 'Texto desbordado en aviso 3' }), { status: 422 });
  assert.equal(await readServerError(response, 'fallback'), 'Texto desbordado en aviso 3');
});

test('readServerError falls back to plain text for non-JSON bodies', async () => {
  const response = new Response('Bad Gateway', { status: 502 });
  assert.equal(await readServerError(response, 'fallback'), 'Bad Gateway');
});

test('readServerError uses the fallback for empty bodies or JSON without error', async () => {
  assert.equal(await readServerError(new Response('', { status: 500 }), 'fallback'), 'fallback');
  assert.equal(await readServerError(new Response('{}', { status: 500 }), 'fallback'), 'fallback');
});
