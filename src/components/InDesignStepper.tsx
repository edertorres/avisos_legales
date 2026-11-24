import React, { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface InDesignStepperProps {
  label: string;
  value: number;
  onChange: (newValue: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  presets?: number[];
  decimals?: number;
  icon?: React.ReactNode;
}

export const InDesignStepper: React.FC<InDesignStepperProps> = ({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  presets,
  decimals,
  icon,
}) => {
  const dec = decimals ?? (step < 0.1 ? 2 : step < 1 ? 1 : 0);
  const formatValue = (nextValue: number) => Number(nextValue.toFixed(dec)).toString();
  const [draftValue, setDraftValue] = useState<string>(formatValue(value));
  const [isEditing, setIsEditing] = useState<boolean>(false);

  useEffect(() => {
    if (!isEditing) {
      setDraftValue(formatValue(value));
    }
  }, [value, dec, isEditing]);

  const clampValue = (nextValue: number) => Math.min(max, Math.max(min, nextValue));

  const commitDraftValue = () => {
    const normalized = draftValue.replace(',', '.');
    const parsed = parseFloat(normalized);
    if (Number.isNaN(parsed)) {
      setDraftValue(formatValue(value));
      return;
    }

    const next = Number(clampValue(parsed).toFixed(4));
    onChange(next);
    setDraftValue(formatValue(next));
  };

  const stepBy = (direction: 1 | -1, multiplier = 1) => {
    const next = clampValue(Number((value + direction * step * multiplier).toFixed(4)));
    onChange(next);
    setDraftValue(formatValue(next));
  };

  const range = `${min}–${max}${unit ? ` ${unit}` : ''}`;

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-stone-600">
        {icon}
        <span className="truncate">{label}</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => stepBy(-1)}
          disabled={value <= min}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-stone-300 bg-white text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 active:bg-stone-200 disabled:opacity-30"
          title="Disminuir"
          aria-label={`Disminuir ${label}`}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>

        <div className="relative flex flex-1 items-center">
          <input
            type="text"
            inputMode="decimal"
            aria-label={label}
            title={`${label}: ${range}. Flechas ↑/↓ para ajustar (Mayús = ×10).`}
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onFocus={() => setIsEditing(true)}
            onBlur={() => {
              commitDraftValue();
              setIsEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setDraftValue(formatValue(value));
                e.currentTarget.blur();
              }
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                stepBy(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 10 : 1);
              }
            }}
            className="h-8 w-full rounded-md border border-stone-300 bg-white px-1 text-center text-sm font-medium tabular-nums text-stone-900 focus:border-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-100"
          />
          {unit && (
            <span className="pointer-events-none absolute right-2 select-none text-xs text-stone-400">
              {unit}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => stepBy(1)}
          disabled={value >= max}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-stone-300 bg-white text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 active:bg-stone-200 disabled:opacity-30"
          title="Aumentar"
          aria-label={`Aumentar ${label}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {presets && presets.length > 0 && (
        <div className="no-scrollbar mt-1.5 flex items-center gap-1 overflow-x-auto pb-0.5">
          {presets.map((p) => {
            const isSelected = Math.abs(value - p) < 0.01;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  onChange(p);
                  setDraftValue(formatValue(p));
                }}
                className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] tabular-nums transition-colors ${
                  isSelected
                    ? 'border-accent-700 bg-accent-700 text-white'
                    : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-100'
                }`}
              >
                {p}{unit}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
