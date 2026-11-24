import { useCallback, useReducer } from 'react';
import type { NoticeConfig } from '../types';

export const HISTORY_LIMIT = 100;
/** Consecutive edits to the same fields within this window form one undo step. */
export const COALESCE_MS = 700;
/** View-only fields: they change the screen, not the notice, so they never create undo steps. */
const VIEW_ONLY_KEYS = new Set<keyof NoticeConfig>(['showMarginGuides']);

export interface HistoryState {
  past: NoticeConfig[];
  present: NoticeConfig;
  future: NoticeConfig[];
  /** Fields and time of the last edit, to merge typing bursts into one step. */
  lastEdit: { keys: string; at: number } | null;
}

export type HistoryAction =
  | { type: 'update'; changes: Partial<NoticeConfig>; at: number }
  | { type: 'replace'; config: NoticeConfig }
  | { type: 'reset-silently'; config: NoticeConfig }
  | { type: 'undo' }
  | { type: 'redo' };

export function createHistory(initial: NoticeConfig): HistoryState {
  return { past: [], present: initial, future: [], lastEdit: null };
}

const pushPast = (past: NoticeConfig[], config: NoticeConfig) => [...past, config].slice(-HISTORY_LIMIT);

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'update': {
      const keys = Object.keys(action.changes) as (keyof NoticeConfig)[];
      const changed = keys.filter((key) => !Object.is(state.present[key], action.changes[key]));
      if (changed.length === 0) return state;
      const present = { ...state.present, ...action.changes };
      if (changed.every((key) => VIEW_ONLY_KEYS.has(key))) return { ...state, present };

      const signature = [...changed].sort().join(',');
      const coalesce = state.lastEdit !== null
        && state.lastEdit.keys === signature
        && action.at - state.lastEdit.at < COALESCE_MS
        && state.past.length > 0;
      return {
        past: coalesce ? state.past : pushPast(state.past, state.present),
        present,
        future: [],
        lastEdit: { keys: signature, at: action.at },
      };
    }
    case 'replace':
      if (action.config === state.present) return state;
      return { past: pushPast(state.past, state.present), present: action.config, future: [], lastEdit: null };
    case 'reset-silently':
      return { ...state, present: action.config, lastEdit: null };
    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: { ...previous, showMarginGuides: state.present.showMarginGuides },
        future: [state.present, ...state.future],
        lastEdit: null,
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const [next, ...future] = state.future;
      return {
        past: pushPast(state.past, state.present),
        present: { ...next, showMarginGuides: state.present.showMarginGuides },
        future,
        lastEdit: null,
      };
    }
  }
}

/** Notice config with undo/redo. `replace` is a standalone step (load, reset); `setSilently` bypasses history. */
export function useConfigHistory(initial: NoticeConfig) {
  const [state, dispatch] = useReducer(historyReducer, initial, createHistory);
  return {
    config: state.present,
    update: useCallback((changes: Partial<NoticeConfig>) => dispatch({ type: 'update', changes, at: Date.now() }), []),
    replace: useCallback((config: NoticeConfig) => dispatch({ type: 'replace', config }), []),
    setSilently: useCallback((config: NoticeConfig) => dispatch({ type: 'reset-silently', config }), []),
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
