import React from 'react';
import { ChevronDown } from 'lucide-react';

interface ControlGroupProps {
  title: string;
  icon: React.ReactNode;
  /** Optional element shown at the right of the title (badge, value). */
  aside?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/** Collapsible settings card shared by the legal and funeral editors. */
export function ControlGroup({ title, icon, aside, defaultOpen = true, children }: ControlGroupProps) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-stone-200 bg-white shadow-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-stone-800 hover:bg-stone-50 [&::-webkit-details-marker]:hidden">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-stone-100 text-stone-600">{icon}</span>
        <span className="flex-1">{title}</span>
        {aside}
        <ChevronDown className="h-4 w-4 text-stone-400 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 border-t border-stone-100 p-4">{children}</div>
    </details>
  );
}
