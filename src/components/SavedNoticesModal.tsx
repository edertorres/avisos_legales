import React from 'react';
import { Download, FileText, Trash2, Upload } from 'lucide-react';
import type { SavedNotice } from '../types/sharedLibrary';
import { ModalShell } from './ModalShell';
import * as ui from './ui';

interface SavedNoticesModalProps {
  notices: SavedNotice[];
  onLoad: (notice: SavedNotice) => void;
  onExport: (notice: SavedNotice) => void;
  onDelete: (id: string) => void;
  onImport: () => void;
  onClose: () => void;
}

export const SavedNoticesModal: React.FC<SavedNoticesModalProps> = ({
  notices,
  onLoad,
  onExport,
  onDelete,
  onImport,
  onClose,
}) => (
  <ModalShell
    title="Anuncios Guardados"
    subtitle="Biblioteca compartida para todos"
    icon={<FileText className="h-5 w-5" />}
    onClose={onClose}
    footer={
      <>
        <button
          type="button"
          onClick={onImport}
          className={`${ui.btn.secondary} mr-auto`}
        >
          <Upload className="h-3.5 w-3.5" />
          Importar JSON
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
      {notices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-10 text-center">
          <p className="text-sm font-medium text-stone-800">Aún no hay anuncios guardados.</p>
          <p className="mt-1 text-xs text-stone-500">Usa Guardar para conservar el anuncio actual y acceder desde cualquier PC.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notices.map((notice) => (
            <div key={notice.id} className="rounded-lg border border-stone-200 bg-white p-3 hover:border-stone-300">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-stone-900">{notice.name}</h3>
                  <p className="mt-1 text-xs text-stone-500">
                    {notice.config.noticeType === 'funeral' ? 'Plantilla funeraria · ' : ''}
                    {notice.config.size.widthCm} × {notice.config.size.heightCm} cm · {new Date(notice.updatedAt).toLocaleString('es-CO')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onLoad(notice)}
                    className={ui.btn.primary}
                  >
                    Cargar
                  </button>
                  <button
                    type="button"
                    onClick={() => onExport(notice)}
                    className={ui.btn.icon}
                    title="Exportar este anuncio"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(notice.id)}
                    className={`${ui.btn.icon} hover:!border-rose-200 hover:!bg-rose-50 hover:!text-rose-700`}
                    title="Eliminar este anuncio"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </ModalShell>
);
