/**
 * Shared control styles (Tailwind class strings) so legal and funeral editors,
 * the header and the modals look and behave the same. Palette tokens live in index.css.
 */
const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600';
const base = `inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${focus}`;

export const btn = {
  primary: `${base} min-h-9 bg-accent-700 px-3.5 py-2 text-white shadow-sm hover:bg-accent-800`,
  secondary: `${base} min-h-9 border border-stone-300 bg-white px-3 py-2 text-stone-700 shadow-xs hover:bg-stone-50 hover:border-stone-400`,
  ghost: `${base} min-h-8 px-2.5 py-1.5 text-stone-600 hover:bg-stone-100 hover:text-stone-900`,
  danger: `${base} min-h-9 border border-rose-200 bg-white px-3 py-2 text-rose-700 hover:bg-rose-50`,
  icon: `${base} h-8 w-8 shrink-0 border border-stone-300 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900`,
};

export const field = `w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-xs outline-none transition placeholder:text-stone-400 focus:border-accent-600 focus:ring-2 focus:ring-accent-100 disabled:bg-stone-100`;

export const label = 'block text-xs font-medium text-stone-600 mb-1';

export const segmented = {
  group: 'inline-flex items-center gap-0.5 rounded-lg border border-stone-200 bg-stone-100 p-0.5',
  option: (active: boolean) =>
    `inline-flex min-h-7 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${focus} ${
      active ? 'bg-white text-accent-800 shadow-sm ring-1 ring-stone-200' : 'text-stone-600 hover:bg-white/70 hover:text-stone-900'
    }`,
};

export const chip = {
  neutral: 'inline-flex items-center gap-1 rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-medium tabular-nums text-stone-700',
  ok: 'inline-flex items-center gap-1 rounded-md border border-accent-200 bg-accent-50 px-2 py-1 text-xs font-medium text-accent-800',
  warn: 'inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900',
  error: 'inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-800',
};

export const card = 'rounded-xl border border-stone-200 bg-white shadow-xs';
