import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalShellProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  onClose: () => void;
  /** Blocks closing (button, Escape) while a long operation runs. */
  closeDisabled?: boolean;
  maxWidthClass?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export const ModalShell: React.FC<ModalShellProps> = ({
  title,
  subtitle,
  icon,
  onClose,
  closeDisabled = false,
  maxWidthClass = 'max-w-3xl',
  footer,
  children,
}) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, closeDisabled]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[86vh] w-full ${maxWidthClass} flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100 text-stone-600">{icon}</span>
            <div>
              <h2 className="text-base font-semibold text-stone-900">{title}</h2>
              {subtitle && <p className="text-xs text-stone-500">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 disabled:opacity-40"
            title="Cerrar"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-200 bg-stone-50 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
