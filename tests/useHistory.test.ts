import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_NOTICE_CONFIG, SAMPLE_NOTICE_IMAGE } from '../src/data/samples';
import { COALESCE_MS, HISTORY_LIMIT, createHistory, historyReducer, type HistoryState } from '../src/hooks/useHistory';

const update = (state: HistoryState, changes: object, at: number) =>
  historyReducer(state, { type: 'update', changes, at });

test('agrupa la escritura rápida en el mismo campo en un solo paso', () => {
  let state = createHistory(DEFAULT_NOTICE_CONFIG);
  state = update(state, { bodyText: 'A' }, 1000);
  state = update(state, { bodyText: 'AB' }, 1200);
  state = update(state, { bodyText: 'ABC' }, 1400);
  assert.equal(state.past.length, 1);
  state = historyReducer(state, { type: 'undo' });
  assert.equal(state.present.bodyText, '');
});

test('separa pasos por pausa o por cambio de campo', () => {
  let state = createHistory(DEFAULT_NOTICE_CONFIG);
  state = update(state, { bodyText: 'A' }, 1000);
  state = update(state, { bodyText: 'AB' }, 1000 + COALESCE_MS + 1);
  state = update(state, { headerTitle: 'AVISO' }, 1000 + COALESCE_MS + 2);
  assert.equal(state.past.length, 3);
});

test('replace es un paso propio y se puede deshacer', () => {
  let state = createHistory(DEFAULT_NOTICE_CONFIG);
  state = historyReducer(state, { type: 'replace', config: SAMPLE_NOTICE_IMAGE });
  state = historyReducer(state, { type: 'replace', config: DEFAULT_NOTICE_CONFIG });
  state = historyReducer(state, { type: 'undo' });
  assert.equal(state.present.bodyText, SAMPLE_NOTICE_IMAGE.bodyText);
});

test('rehacer funciona y se vacía tras un cambio nuevo', () => {
  let state = createHistory(DEFAULT_NOTICE_CONFIG);
  state = update(state, { bodyFontSizePt: 7 }, 0);
  state = historyReducer(state, { type: 'undo' });
  assert.equal(state.future.length, 1);
  state = historyReducer(state, { type: 'redo' });
  assert.equal(state.present.bodyFontSizePt, 7);
  state = historyReducer(state, { type: 'undo' });
  state = update(state, { lineHeight: 1.2 }, 5000);
  assert.equal(state.future.length, 0);
});

test('las guías de margen no crean pasos ni se revierten al deshacer', () => {
  let state = createHistory(DEFAULT_NOTICE_CONFIG);
  state = update(state, { bodyFontSizePt: 7 }, 0);
  state = update(state, { showMarginGuides: !DEFAULT_NOTICE_CONFIG.showMarginGuides }, 5000);
  assert.equal(state.past.length, 1);
  state = historyReducer(state, { type: 'undo' });
  assert.equal(state.present.showMarginGuides, !DEFAULT_NOTICE_CONFIG.showMarginGuides);
});

test('limita el historial y no registra cambios sin efecto', () => {
  let state = createHistory(DEFAULT_NOTICE_CONFIG);
  for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) state = update(state, { bodyText: `t${i}` }, i * 10_000);
  assert.equal(state.past.length, HISTORY_LIMIT);
  const same = update(state, { bodyText: state.present.bodyText }, 9e9);
  assert.equal(same, state);
});
