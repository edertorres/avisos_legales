import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, Sparkles, Printer, BookOpen, Upload, Save, FolderOpen, FileDown, FileUp, History, MoreHorizontal, FlaskConical } from 'lucide-react';
import manualText from '../../MANUAL_USUARIO.md?raw';
import { ModalShell } from './ModalShell';
import * as ui from './ui';

interface HeaderProps {
  onLoadSample: () => void;
  onReset: () => void;
  onExportWeasyPdf: () => void;
  onOpenGrayPdfConverter: () => void;
  onSaveNotice: () => void;
  onOpenSavedNotices: () => void;
  onOpenGeneratedLog: () => void;
  onExportNoticeJson: () => void;
  onImportNoticeJson: () => void;
  isWeasyExporting: boolean;
  isOverflowing: boolean;
}

function renderManualMarkdown(markdown: string) {
  return markdown.split('\n').map((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return <div key={index} className="h-2" />;
    }

    if (trimmed.startsWith('# ')) {
      return (
        <h1 key={index} className="mt-1 mb-3 text-xl font-semibold text-stone-900">
          {trimmed.replace(/^#\s+/, '')}
        </h1>
      );
    }

    if (trimmed.startsWith('## ')) {
      return (
        <h2 key={index} className="mt-6 mb-2 border-b border-stone-200 pb-1 text-base font-semibold text-stone-900">
          {trimmed.replace(/^##\s+/, '')}
        </h2>
      );
    }

    if (trimmed.startsWith('### ')) {
      return (
        <h3 key={index} className="mt-4 mb-1 text-sm font-bold text-stone-800">
          {trimmed.replace(/^###\s+/, '')}
        </h3>
      );
    }

    if (trimmed.startsWith('- ')) {
      return (
        <div key={index} className="ml-3 flex gap-2 text-sm leading-relaxed text-stone-700">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-600" />
          <span>{trimmed.replace(/^-\s+/, '')}</span>
        </div>
      );
    }

    if (/^\d+\.\s/.test(trimmed)) {
      return (
        <p key={index} className="pl-2 text-sm leading-relaxed text-stone-700">
          {trimmed}
        </p>
      );
    }

    if (trimmed.startsWith('```')) {
      return null;
    }

    return (
      <p key={index} className="text-sm leading-relaxed text-stone-700">
        {trimmed}
      </p>
    );
  });
}

export const Header: React.FC<HeaderProps> = ({
  onLoadSample,
  onReset,
  onExportWeasyPdf,
  onOpenGrayPdfConverter,
  onSaveNotice,
  onOpenSavedNotices,
  onOpenGeneratedLog,
  onExportNoticeJson,
  onImportNoticeJson,
  isWeasyExporting,
  isOverflowing,
}) => {
  const [showManual, setShowManual] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMore) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !moreRef.current?.contains(event.target as Node)) {
        setShowMore(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [showMore]);

  const menuItem = 'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50';
  const runMenuAction = (action: () => void) => () => {
    setShowMore(false);
    action();
  };

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-stone-200 bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-900 text-white">
            <Printer className="h-4 w-4" />
          </div>
          <div className="min-w-0 max-sm:hidden">
            <h1 className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-stone-900">
              Avisos legales
              <span className={`${isOverflowing ? ui.chip.error : ui.chip.ok} max-sm:hidden`}>
                {isOverflowing ? 'Revisar desborde' : 'Listo para rotativa'}
              </span>
            </h1>
            <p className="hidden truncate text-xs text-stone-500 sm:block">Edictos y avisos en centímetros reales</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button type="button" onClick={onSaveNotice} className={ui.btn.primary} title="Guardar el anuncio actual para todos">
            <Save className="h-4 w-4" />
            <span className="hidden sm:inline">Guardar</span>
          </button>
          <button type="button" onClick={onOpenSavedNotices} className={ui.btn.secondary} title="Ver anuncios guardados">
            <FolderOpen className="h-4 w-4 text-stone-500" />
            <span className="hidden sm:inline">Guardados</span>
          </button>
          <button type="button" onClick={onOpenGeneratedLog} className={ui.btn.secondary} title="Ver historial de PDFs generados">
            <History className="h-4 w-4 text-stone-500" />
            <span className="hidden md:inline">Historial</span>
          </button>
          <button type="button" onClick={() => setShowManual(true)} className={ui.btn.ghost} title="Abrir manual de usuario">
            <BookOpen className="h-4 w-4" />
            <span className="hidden md:inline">Manual</span>
          </button>

          <div className="relative" ref={moreRef}>
            <button
              type="button"
              onClick={() => setShowMore((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={showMore}
              className={ui.btn.ghost}
              title="Más acciones"
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Más</span>
            </button>
            {showMore && (
              <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
                <button role="menuitem" className={menuItem} onClick={runMenuAction(onLoadSample)}>
                  <Sparkles className="h-4 w-4 text-stone-500" /> Cargar ejemplo
                </button>
                <button role="menuitem" className={menuItem} onClick={runMenuAction(onReset)}>
                  <RotateCcw className="h-4 w-4 text-stone-500" /> Limpiar formulario
                </button>
                <div className="my-1 border-t border-stone-100" />
                <button role="menuitem" className={menuItem} onClick={runMenuAction(onExportNoticeJson)}>
                  <FileDown className="h-4 w-4 text-stone-500" /> Exportar anuncio (JSON)
                </button>
                <button role="menuitem" className={menuItem} onClick={runMenuAction(onImportNoticeJson)}>
                  <FileUp className="h-4 w-4 text-stone-500" /> Importar anuncio (JSON)
                </button>
                <div className="my-1 border-t border-stone-100" />
                <button role="menuitem" className={menuItem} onClick={runMenuAction(onOpenGrayPdfConverter)}>
                  <Upload className="h-4 w-4 text-stone-500" /> Convertir PDF externo a grises
                </button>
                <button
                  role="menuitem"
                  className={menuItem}
                  disabled={isWeasyExporting || isOverflowing}
                  onClick={runMenuAction(onExportWeasyPdf)}
                  title={isOverflowing ? 'No disponible con texto desbordado.' : 'Motor alternativo WeasyPrint + Ghostscript'}
                >
                  <FlaskConical className="h-4 w-4 text-stone-500" /> {isWeasyExporting ? 'Generando PDF WeasyPrint...' : 'PDF experimental (WeasyPrint)'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showManual && (
        <ModalShell
          title="Manual de usuario"
          subtitle="Avisos impresos PDF para prensa y rotativa"
          icon={<BookOpen className="h-5 w-5" />}
          onClose={() => setShowManual(false)}
          footer={<button type="button" onClick={() => setShowManual(false)} className={ui.btn.secondary}>Cerrar</button>}
        >
          <div className="space-y-1 px-6 py-5">{renderManualMarkdown(manualText)}</div>
        </ModalShell>
      )}
    </header>
  );
};
