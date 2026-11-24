import React from 'react';
import { Download, FileText, Trash2 } from 'lucide-react';
import type { GeneratedLogEntry } from '../types/sharedLibrary';
import { ModalShell } from './ModalShell';
import * as ui from './ui';

interface GeneratedLogModalProps {
  entries: GeneratedLogEntry[];
  onLoad: (entry: GeneratedLogEntry) => void;
  onClear: () => void;
  onExportCsv: () => void;
  onClose: () => void;
}

export const GeneratedLogModal: React.FC<GeneratedLogModalProps> = ({
  entries,
  onLoad,
  onClear,
  onExportCsv,
  onClose,
}) => (
  <ModalShell
    title="Historial de PDFs"
    subtitle="Registro compartido de avisos generados"
    icon={<FileText className="h-5 w-5" />}
    onClose={onClose}
    maxWidthClass="max-w-4xl"
    footer={
      <>
        <button
          type="button"
          onClick={onClear}
          disabled={entries.length === 0}
          className={ui.btn.danger}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Borrar historial
        </button>
        <button
          type="button"
          onClick={onExportCsv}
          disabled={entries.length === 0}
          className={ui.btn.secondary}
        >
          <Download className="h-3.5 w-3.5" />
          CSV
        </button>
        <button
          type="button"
          onClick={onClose}
          className={ui.btn.secondary}
        >
          Cerrar
        </button>
      </>
    }
  >
    <div className="p-4">
      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-10 text-center">
          <p className="text-sm font-medium text-stone-800">Aún no hay PDFs registrados.</p>
          <p className="mt-1 text-xs text-stone-500">El historial se crea automáticamente cuando una exportación termina bien.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-stone-200 bg-white p-3 hover:border-stone-300">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-stone-900">{entry.title}</h3>
                  <p className="mt-1 text-xs text-stone-500">
                    {entry.config.size.widthCm} × {entry.config.size.heightCm} cm · PDF tamaño real · {new Date(entry.generatedAt).toLocaleString('es-CO')}
                  </p>
                  <p className="mt-1 truncate text-xs text-stone-500">
                    {entry.filename} · {entry.config.fontFamily} · cuerpo {entry.config.bodyFontSizePt} pt · inter {entry.config.lineHeight.toFixed(2)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onLoad(entry)}
                  className={ui.btn.primary}
                >
                  Cargar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </ModalShell>
);
