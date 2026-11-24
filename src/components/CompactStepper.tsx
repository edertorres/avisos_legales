import React, { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface CompactStepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  decimals?: number;
  icon?: React.ReactNode;
}

/** Single-line − value + control for toolbars. Accepts comma decimals and ↑/↓ (Shift = ×10). */
export function CompactStepper({ label, value, onChange, min, max, step, unit, decimals = 2, icon }: CompactStepperProps) {
  const format = (n: number) => Number(n.toFixed(decimals)).toString();
  const [draft, setDraft] = useState(format(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(format(value));
  }, [value, editing]);

  const clamp = (n: number) => Math.min(max, Math.max(min, Number(n.toFixed(4))));
  const commit = () => {
    const parsed = parseFloat(draft.replace(',', '.'));
    const next = Number.isNaN(parsed) ? value : clamp(parsed);
    onChange(next);
    setDraft(format(next));
  };
  const stepBy = (direction: 1 | -1, multiplier = 1) => {
    const next = clamp(value + direction * step * multiplier);
    onChange(next);
    setDraft(format(next));
  };

  const buttonClass = 'flex h-7 w-7 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-white hover:text-stone-900 disabled:opacity-30';

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-100 py-0.5 pl-2 pr-0.5" title={`${label}: ${min}–${max}${unit ? ` ${unit}` : ''}`}>
      {icon}
      <span className="mr-0.5 text-xs font-medium text-stone-600">{label}</span>
      <button type="button" className={buttonClass} onClick={() => stepBy(-1)} disabled={value <= min} aria-label={`Reducir ${label}`}>
        <Minus className="h-3 w-3" />
      </button>
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setEditing(true)}
          onBlur={() => {
            commit();
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setDraft(format(value));
              e.currentTarget.blur();
            }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              stepBy(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 10 : 1);
            }
          }}
          className={`h-7 rounded-md border border-stone-300 bg-white text-center text-sm font-medium tabular-nums text-stone-900 focus:border-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-100 ${unit ? 'w-16 pr-5' : 'w-14'}`}
        />
        {unit && <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] text-stone-400">{unit}</span>}
      </div>
      <button type="button" className={buttonClass} onClick={() => stepBy(1)} disabled={value >= max} aria-label={`Aumentar ${label}`}>
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}
