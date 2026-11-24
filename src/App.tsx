import { FuneralWorkspace } from './components/FuneralWorkspace';
import { isNoticeConfig, type SavedNotice, type GeneratedLogEntry, type SharedLibrary } from './types/sharedLibrary';
import { requestSharedLibrary, loadAndMigrateLibrary } from './utils/sharedLibraryClient';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { NoticeConfig, SizeOption, OverflowStatus } from './types';
import { INITIAL_SIZES, SAMPLE_NOTICE_IMAGE, DEFAULT_NOTICE_CONFIG } from './data/samples';
import { Header } from './components/Header';
import { EditorPanel } from './components/EditorPanel';
import { NoticePreview, type EditTarget } from './components/NoticePreview';
import { NoticeCanvas } from './components/NoticeCanvas';
import { generateNoticePDF, generateNoticePDFWithWeasyPrint } from './utils/pdfGenerator';
import { calculateAutoFitFont } from './utils/autoFitAlgorithm';
import { SavedNoticesModal } from './components/SavedNoticesModal';
import { GeneratedLogModal } from './components/GeneratedLogModal';
import { GrayPdfConverterModal } from './components/GrayPdfConverterModal';
import { downloadBlob } from './utils/download';
import { useConfigHistory } from './hooks/useHistory';
import { FileText, Flower2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface NoticeJsonPayload {
  schemaVersion: 1;
  exportedAt: string;
  notice: {
    name: string;
    config: NoticeConfig;
  };
  customSizes: SizeOption[];
}

const CUSTOM_SIZES_KEY = 'avisos.customSizes.v1';

function filenameSafeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'aviso';
}

function isSizeOption(value: unknown): value is SizeOption {
  if (!value || typeof value !== 'object') return false;
  const size = value as Partial<SizeOption>;
  return (
    typeof size.id === 'string' &&
    typeof size.name === 'string' &&
    typeof size.widthCm === 'number' &&
    typeof size.heightCm === 'number' &&
    size.widthCm > 0 &&
    size.heightCm > 0
  );
}

function mergeSizes(baseSizes: SizeOption[], extraSizes: SizeOption[]): SizeOption[] {
  return extraSizes.reduce<SizeOption[]>((merged, size) => {
    const exists = merged.some((item) => item.id === size.id || (item.widthCm === size.widthCm && item.heightCm === size.heightCm));
    return exists ? merged : [...merged, size];
  }, baseSizes);
}

export default function App() {
  const [funeralTemplate, setFuneralTemplate] = useState<SavedNotice | null>(null);
  const [section, setSection] = useState<'standard' | 'funeral'>('standard');
  const {
    config,
    update: handleConfigChange,
    replace: setConfig,
    setSilently: setConfigWithoutHistory,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useConfigHistory(DEFAULT_NOTICE_CONFIG);
  const [sizes, setSizes] = useState<SizeOption[]>(INITIAL_SIZES);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isWeasyExporting, setIsWeasyExporting] = useState<boolean>(false);
  const [isGrayModalOpen, setIsGrayModalOpen] = useState<boolean>(false);
  const [isEditorPanelCollapsed, setIsEditorPanelCollapsed] = useState<boolean>(false);
  const [savedNotices, setSavedNotices] = useState<SavedNotice[]>([]);
  const [isSavedNoticesOpen, setIsSavedNoticesOpen] = useState<boolean>(false);
  const [generatedLog, setGeneratedLog] = useState<GeneratedLogEntry[]>([]);
  const [isGeneratedLogOpen, setIsGeneratedLogOpen] = useState<boolean>(false);
  const [pdfExportMode, setPdfExportMode] = useState<boolean>(false);
  const [overflowStatus, setOverflowStatus] = useState<OverflowStatus>({
    isOverflowing: false,
    overflowHeightPx: 0,
    overflowPercentage: 0,
    recommendedHeightCm: config.size.heightCm,
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const noticeJsonInputRef = useRef<HTMLInputElement>(null);
  const libraryInitialization = useRef<Promise<SharedLibrary> | null>(null);
  const libraryRequestNumber = useRef(0);
  const libraryWrites = useRef(0);
  const libraryMutationQueue = useRef<Promise<unknown>>(Promise.resolve());

  const applySharedLibrary = (library: SharedLibrary) => {
    setSavedNotices(library.savedNotices);
    setGeneratedLog(library.generatedLog);
  };

  const initializeLibrary = () => {
    if (!libraryInitialization.current) {
      libraryInitialization.current = loadAndMigrateLibrary().catch(error => {
        libraryInitialization.current = null;
        throw error;
      });
    }
    return libraryInitialization.current;
  };

  const mutateLibrary = (endpoint: string, method: string, body?: unknown) => {
    libraryWrites.current += 1;
    libraryRequestNumber.current += 1;
    const operation = libraryMutationQueue.current.then(async () => {
      await initializeLibrary();
      const library = await requestSharedLibrary(endpoint, method, body);
      applySharedLibrary(library);
    }).finally(() => { libraryWrites.current -= 1; });
    libraryMutationQueue.current = operation.catch(() => undefined);
    return operation;
  };

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (libraryWrites.current > 0) return;
      const requestNumber = ++libraryRequestNumber.current;
      try {
        await initializeLibrary();
        const library = await requestSharedLibrary();
        if (active && requestNumber === libraryRequestNumber.current) applySharedLibrary(library);
      } catch (error) {
        if (active) showToast(error instanceof Error ? error.message : 'No se pudo cargar la biblioteca compartida.');
      }
    };
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    window.addEventListener('focus', refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);

  useEffect(() => {
    if (!isSavedNoticesOpen && !isGeneratedLogOpen) return;
    const requestNumber = ++libraryRequestNumber.current;
    if (libraryWrites.current > 0) return;
    void initializeLibrary().then(() => requestSharedLibrary()).then(library => {
      if (requestNumber === libraryRequestNumber.current) applySharedLibrary(library);
    }).catch(error => showToast(error.message));
  }, [isSavedNoticesOpen, isGeneratedLogOpen]);

  useEffect(() => {
    try {
      const rawSizes = localStorage.getItem(CUSTOM_SIZES_KEY);
      if (!rawSizes) return;

      const parsedSizes = JSON.parse(rawSizes);
      if (Array.isArray(parsedSizes)) {
        setSizes(mergeSizes(INITIAL_SIZES, parsedSizes.filter(isSizeOption).map((size) => ({ ...size, isCustom: true }))));
      }
    } catch (err) {
      console.warn('Custom sizes load error:', err);
    }
  }, []);

  // Expose global functions for Puppeteer PDF rendering.
  // Puppeteer opens the app URL, calls __setNoticeConfig with the config,
  // then __setPdfExportMode(true) so React renders a clean full-page canvas
  // at zoom=1 — no sidebar, no header, no UI chrome.
  useEffect(() => {
    (window as any).__setNoticeConfig = (newConfig: NoticeConfig) => {
      setConfigWithoutHistory(newConfig);
    };
    (window as any).__setPdfExportMode = (mode: boolean) => {
      setPdfExportMode(mode);
    };
    (window as any).__pdfReady = false;
    return () => {
      delete (window as any).__setNoticeConfig;
      delete (window as any).__setPdfExportMode;
      delete (window as any).__pdfReady;
      delete (window as any).__pdfExportReady;
    };
  }, []);

  // Signal PDF readiness when config changes
  useEffect(() => {
    (window as any).__pdfReady = true;
  }, [config]);

  // Signal canvas readiness when entering PDF export mode
  useEffect(() => {
    if (pdfExportMode) {
      requestAnimationFrame(() => {
        (window as any).__pdfExportReady = true;
      });
    }
  }, [pdfExportMode]);

  // Undo / redo shortcuts for the legal notice editor. Controlled React inputs lose
  // reliable native undo, so the app history handles it everywhere in that section.
  useEffect(() => {
    if (section !== 'standard' || pdfExportMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      // Inside dialogs (table editor, crop…) undo belongs to the dialog's own fields.
      if ((event.target as HTMLElement | null)?.closest?.('[role="dialog"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [section, pdfExportMode, undo, redo]);

  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.clearTimeout(toastTimer.current);
    // Longer messages (errors) stay longer on screen.
    toastTimer.current = window.setTimeout(() => setToastMessage(null), Math.min(9000, 3000 + msg.length * 40));
  };

  // Clicking an element on the canvas focuses the matching field in the side panel.
  const [tableEditRequest, setTableEditRequest] = useState<{ index: number; nonce: number } | null>(null);
  const handleEditTarget = (target: EditTarget, index?: number) => {
    setIsEditorPanelCollapsed(false);
    if (target === 'table') {
      // The panel owns the table editor; it opens it for this table.
      setTableEditRequest({ index: index ?? 0, nonce: Date.now() });
      return;
    }
    window.setTimeout(() => {
      const field = document.getElementById(`editor-${target}`);
      if (!field) return;
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      field.focus({ preventScroll: true });
    }, 0);
  };


  const persistCustomSizes = (nextSizes: SizeOption[]) => {
    const nextCustomSizes = nextSizes.filter((size) => size.isCustom);
    localStorage.setItem(CUSTOM_SIZES_KEY, JSON.stringify(nextCustomSizes));
  };

  const ensureSizeAvailable = (size: SizeOption) => {
    setSizes((prev) => {
      const exists = prev.some((item) => item.id === size.id || (item.widthCm === size.widthCm && item.heightCm === size.heightCm));
      if (exists) return prev;

      const nextSizes = [...prev, { ...size, isCustom: true }];
      persistCustomSizes(nextSizes);
      return nextSizes;
    });
  };

  const getSuggestedNoticeName = () => {
    const title = config.headerTitle.trim() || config.subheaderTitle.trim();
    const date = new Date().toLocaleDateString('es-CO');
    return title ? `${title} - ${date}` : `Aviso ${config.size.widthCm}x${config.size.heightCm} cm - ${date}`;
  };

  const getLogTitle = (noticeConfig: NoticeConfig) => {
    return noticeConfig.headerTitle.trim() || noticeConfig.subheaderTitle.trim() || 'Aviso sin título';
  };

  const registerGeneratedNotice = async (filename: string) => {
    const entry: GeneratedLogEntry = {
      id: `generated-${crypto.randomUUID()}`,
      generatedAt: new Date().toISOString(),
      title: getLogTitle(config),
      filename,
      exportType: 'single-exact',
      config,
    };

    try {
      await mutateLibrary('/history', 'POST', entry);
      return true;
    } catch {
      showToast('PDF descargado, pero no se pudo guardar en el historial compartido.');
      return false;
    }
  };

  const handleSaveNotice = async () => {
    const name = window.prompt('Nombre para guardar este anuncio:', getSuggestedNoticeName());
    if (!name?.trim()) return;

    const now = new Date().toISOString();
    const savedNotice: SavedNotice = {
      id: `notice-${crypto.randomUUID()}`,
      name: name.trim(),
      config,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await mutateLibrary('/notices', 'POST', savedNotice);
      showToast('Anuncio guardado para todos.');
    } catch (error) { showToast((error as Error).message); }
  };

  const handleLoadSavedNotice = (savedNotice: SavedNotice) => {
    ensureSizeAvailable(savedNotice.config.size);
    if (savedNotice.config.noticeType === 'funeral') {
      setFuneralTemplate(savedNotice); setSection('funeral');
    } else { setSection('standard'); setConfig(savedNotice.config); }
    setIsSavedNoticesOpen(false);
    showToast(`Anuncio cargado: ${savedNotice.name}`);
  };

  const handleDeleteSavedNotice = async (id: string) => {
    if (!window.confirm('¿Eliminar este anuncio guardado para todos?')) return;
    try {
      await mutateLibrary(`/notices/${encodeURIComponent(id)}`, 'DELETE');
      showToast('Anuncio eliminado para todos.');
    } catch (error) { showToast((error as Error).message); }
  };

  const handleLoadGeneratedLogEntry = (entry: GeneratedLogEntry) => {
    ensureSizeAvailable(entry.config.size);
    setSection('standard');
    setConfig(entry.config);
    setIsGeneratedLogOpen(false);
    showToast(`Aviso cargado desde historial: ${entry.title}`);
  };

  const handleExportGeneratedLogCsv = () => {
    if (generatedLog.length === 0) {
      showToast('No hay historial para exportar.');
      return;
    }

    const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const rows = [
      ['Fecha', 'Título', 'Archivo', 'Tipo', 'Tamaño cm', 'Fuente', 'Cuerpo pt', 'Interlineado', 'Título 1', 'Título 2'],
      ...generatedLog.map((entry) => [
        new Date(entry.generatedAt).toLocaleString('es-CO'),
        entry.title,
        entry.filename,
        'PDF tamaño real',
        `${entry.config.size.widthCm} x ${entry.config.size.heightCm}`,
        entry.config.fontFamily,
        entry.config.bodyFontSizePt,
        entry.config.lineHeight,
        entry.config.headerTitle,
        entry.config.subheaderTitle,
      ]),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `historial-avisos-${Date.now()}.csv`);
    showToast('Historial exportado como CSV.');
  };

  const handleClearGeneratedLog = async () => {
    if (generatedLog.length === 0) {
      showToast('No hay historial para borrar.');
      return;
    }

    const confirmation = window.prompt('Escribe "borrar" para eliminar el historial compartido de PDFs para todos:');
    if (confirmation !== 'borrar') {
      showToast('No se borró el historial.');
      return;
    }

    try {
      await mutateLibrary('/history', 'DELETE');
      showToast('Historial compartido borrado.');
    } catch (error) { showToast((error as Error).message); }
  };

  const handleExportNoticeJson = (noticeToExport?: SavedNotice) => {
    const exportName = noticeToExport?.name || getSuggestedNoticeName();
    const exportConfig = noticeToExport?.config || config;
    const customSizes = sizes.filter((size) => size.isCustom || size.id === exportConfig.size.id);
    const payload: NoticeJsonPayload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      notice: {
        name: exportName,
        config: exportConfig,
      },
      customSizes,
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${filenameSafeName(exportName)}.json`);
    showToast('Anuncio exportado como JSON.');
  };

  const handleImportNoticeJsonFile = (file: File | null) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        const importedConfig = isNoticeConfig(parsed)
          ? parsed
          : isNoticeConfig(parsed?.notice?.config)
          ? parsed.notice.config
          : isNoticeConfig(parsed?.config)
          ? parsed.config
          : null;

        if (!importedConfig) {
          showToast('El JSON no contiene un anuncio válido.');
          return;
        }

        if (Array.isArray(parsed?.customSizes)) {
          parsed.customSizes.forEach((size: SizeOption) => {
            if (size && typeof size.widthCm === 'number' && typeof size.heightCm === 'number') {
              ensureSizeAvailable(size);
            }
          });
        }
        ensureSizeAvailable(importedConfig.size);
        if (importedConfig.noticeType === 'funeral' && importedConfig.funeral) {
          const now = new Date().toISOString();
          setFuneralTemplate({ id: `import-${crypto.randomUUID()}`, name: parsed?.notice?.name || file.name, config: importedConfig, createdAt: now, updatedAt: now });
          setSection('funeral');
        } else { setConfig(importedConfig); setSection('standard'); }
        showToast('Anuncio importado correctamente.');
      } catch (err) {
        console.error('Notice JSON import error:', err);
        showToast('No se pudo leer el archivo JSON.');
      } finally {
        if (noticeJsonInputRef.current) {
          noticeJsonInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  // Stable identity keeps the memoized (hidden) funeral workspace from re-rendering while typing.
  // mutateLibrary only touches refs and state setters, so capturing it once is safe.
  const handleSaveFuneralTemplate = useCallback(async (name: string, templateConfig: NoticeConfig) => {
    const now = new Date().toISOString();
    await mutateLibrary('/notices', 'POST', { id: `notice-${crypto.randomUUID()}`, name, config: templateConfig, createdAt: now, updatedAt: now });
  }, []);

  const handleAddCustomSize = useCallback((newSize: SizeOption) => {
    setSizes((prev) => {
      const nextSizes = [...prev, { ...newSize, isCustom: true }];
      persistCustomSizes(nextSizes);
      return nextSizes;
    });
    showToast(`Nuevo tamaño agregado: ${newSize.widthCm} x ${newSize.heightCm} cm`);
  // Only uses state setters and refs, so a stable identity is safe.
  }, []);

  const handleDeleteCustomSize = (id: string) => {
    setSizes((prev) => {
      const nextSizes = prev.filter((s) => s.id !== id);
      persistCustomSizes(nextSizes);
      return nextSizes;
    });
    if (config.size.id === id) {
      handleConfigChange({ size: INITIAL_SIZES[1] });
    }
  };

  const handleLoadSample = () => {
    setConfig(SAMPLE_NOTICE_IMAGE);
    showToast('Ejemplo de aviso oficial cargado correctamente');
  };

  const handleReset = () => {
    setConfig(DEFAULT_NOTICE_CONFIG);
    showToast('Formulario limpiado');
  };

  // Auto-fit: binary-searches for the largest body font size that fits the notice dimensions.
  const handleAutoFitFont = useCallback(async () => {
    try {
      showToast('Calculando auto-ajuste...');
      const result = await calculateAutoFitFont(config, sizes);
      if (!result) {
        showToast('No se pudo calcular el auto-ajuste.');
        return;
      }

      // Only apply font/line-height changes — never auto-switch size
      if (Object.keys(result.changes).length > 0) {
        handleConfigChange(result.changes);
      }

      if (result.suggestedSize) {
        // Ensure the suggested size exists in the list for the user to select manually
        ensureSizeAvailable(result.suggestedSize);
      }

      showToast(result.message);
    } catch (err) {
      console.error('Auto-fit error:', err);
      const message = err instanceof Error ? err.message : 'No se pudo medir el contenido.';
      showToast(`No se pudo auto-ajustar: ${message}`);
    }
  }, [config, ensureSizeAvailable, handleConfigChange, sizes]);

  // Export PDF handler
  const handleExportPdf = async () => {
    if (overflowStatus.isOverflowing) {
      showToast('⚠️ NO SE PUEDE GENERAR EL PDF: El texto está desbordado. Usa "Auto-Encajar" o reduce el tamaño de letra.');
      return;
    }

    const noticeEl = document.querySelector('[data-notice-canvas="true"]') as HTMLElement;
    if (!noticeEl) {
      showToast('Error: No se encontró el lienzo para exportar');
      return;
    }

    try {
      setIsExporting(true);
      showToast('Generando PDF vectorial ultra nítido en escala de grises...');
      const filename = `aviso_${config.size.widthCm}x${config.size.heightCm}cm_${Date.now()}_K.pdf`;

      await generateNoticePDF({
        config,
        widthCm: config.size.widthCm,
        heightCm: config.size.heightCm,
        filename,
      });

      if (await registerGeneratedNotice(filename)) showToast('¡PDF generado y descargado con éxito!');
    } catch (err) {
      console.error('PDF export error:', err);
      const message = err instanceof Error ? err.message : 'Por favor reintenta.';
      showToast(`No se generó el PDF: ${message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportWeasyPdf = async () => {
    if (overflowStatus.isOverflowing) {
      showToast('NO SE PUEDE GENERAR EL PDF: El texto está desbordado. Usa "Auto-Encajar" o reduce el tamaño de letra.');
      return;
    }

    try {
      setIsWeasyExporting(true);
      showToast('Generando PDF paralelo con WeasyPrint y verificando K con Ghostscript...');
      const filename = `aviso_${config.size.widthCm}x${config.size.heightCm}cm_${Date.now()}_K_weasyprint_gs.pdf`;

      await generateNoticePDFWithWeasyPrint({
        config,
        widthCm: config.size.widthCm,
        heightCm: config.size.heightCm,
        filename,
      });

      if (await registerGeneratedNotice(filename)) showToast('PDF WeasyPrint generado y descargado.');
    } catch (err) {
      console.error('WeasyPrint PDF export error:', err);
      const message = err instanceof Error ? err.message : 'Por favor reintenta.';
      showToast(`No se generó el PDF WeasyPrint: ${message}`);
    } finally {
      setIsWeasyExporting(false);
    }
  };

  // ─── PDF Export Mode ──────────────────────────────────────────────────────
  // When Puppeteer flips this flag, React renders ONLY the canvas at zoom=1
  // in a clean full-page shell. Puppeteer captures this directly — no DOM
  // manipulation, no CSS transforms, zero risk of broken table/layout.
  if (pdfExportMode) {
    const widthPx = config.size.widthCm * 37.795;
    const heightPx = config.size.heightCm * 37.795;
    return (
      <div style={{
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        background: 'white',
      }}>
        <NoticeCanvas
          config={config}
          zoomScale={1}
          onOverflowStatusChange={() => {}}
          showMarginGuides={false}
        />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-stone-100 text-stone-900 flex flex-col font-sans overflow-hidden">
      <nav className="relative z-40 shrink-0 bg-stone-900 px-3 sm:px-5" aria-label="Tipo de aviso">
        <div className="flex items-center gap-1" role="tablist">
          {([
            { id: 'standard', label: 'Avisos legales', icon: FileText },
            { id: 'funeral', label: 'Avisos funerarios', icon: Flower2 },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={section === id}
              onClick={() => setSection(id)}
              className={`relative flex min-h-11 flex-1 items-center justify-center gap-2 px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-300 sm:flex-none ${
                section === id
                  ? 'text-white after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent-400'
                  : 'text-stone-400 hover:text-stone-100'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>
      <div className={section === 'funeral' ? 'hidden' : 'shrink-0'}>
      {/* Header Bar */}
      <Header
        onLoadSample={handleLoadSample}
        onReset={handleReset}
        onExportWeasyPdf={handleExportWeasyPdf}
        onOpenGrayPdfConverter={() => setIsGrayModalOpen(true)}
        onSaveNotice={handleSaveNotice}
        onOpenSavedNotices={() => setIsSavedNoticesOpen(true)}
        onOpenGeneratedLog={() => setIsGeneratedLogOpen(true)}
        onExportNoticeJson={() => handleExportNoticeJson()}
        onImportNoticeJson={() => noticeJsonInputRef.current?.click()}
        isWeasyExporting={isWeasyExporting}
        isOverflowing={overflowStatus.isOverflowing}
      />

      <input
        ref={noticeJsonInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => handleImportNoticeJsonFile(event.target.files?.[0] || null)}
      />

      </div>
      <div className={section === 'funeral' ? 'flex flex-1 min-h-0 flex-col' : 'hidden'}>
        <FuneralWorkspace loadedTemplate={funeralTemplate} sizes={sizes} onAddSize={handleAddCustomSize} templates={savedNotices} onSaveTemplate={handleSaveFuneralTemplate} />
      </div>
      {/* Main Workspace */}
      <main className={`${section === 'funeral' ? 'hidden' : 'grid'} flex-1 min-h-0 w-full p-3 sm:p-4 grid-cols-1 lg:grid-cols-12 gap-4 overflow-y-auto lg:overflow-hidden`}>
        {/* Left Control Panel (5 cols desktop - Independent internal scroll) */}
        {!isEditorPanelCollapsed && (
          <div className="order-2 lg:order-1 lg:col-span-5 h-[500px] lg:h-full min-h-0 flex flex-col overflow-hidden relative">
            <button
              type="button"
              onClick={() => setIsEditorPanelCollapsed(true)}
              className="absolute right-2.5 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
              title="Ocultar panel lateral"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
            <EditorPanel
              config={config}
              onChange={handleConfigChange}
              sizes={sizes}
              onAddCustomSize={handleAddCustomSize}
              onDeleteCustomSize={handleDeleteCustomSize}
              tableEditRequest={tableEditRequest}
            />
          </div>
        )}

        {/* Right Preview Panel (7 cols desktop - Static anchored canvas) */}
        <div
          className={`order-1 lg:order-2 ${
            isEditorPanelCollapsed ? 'lg:col-span-12' : 'lg:col-span-7'
          } h-[680px] sm:h-[620px] lg:h-full min-h-0 flex flex-col overflow-hidden relative`}
        >
          {isEditorPanelCollapsed && (
            <button
              type="button"
              onClick={() => setIsEditorPanelCollapsed(false)}
              className="absolute bottom-20 left-3 z-30 flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 shadow-md transition-colors hover:bg-stone-100"
              title="Mostrar panel lateral"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          )}
          <NoticePreview
            config={config}
            onConfigChange={handleConfigChange}
            onOverflowStatusChange={setOverflowStatus}
            onAutoFitFont={handleAutoFitFont}
            onSelectSize={(sz) => handleConfigChange({ size: sz })}
            availableSizes={sizes}
            onExportPdf={handleExportPdf}
            isExporting={isExporting}
            onEditTarget={handleEditTarget}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
          />
        </div>
      </main>

      {/* Toast Notification */}
      {toastMessage && (
        <div role="status" aria-live="polite" className="fixed bottom-24 right-5 z-50 flex max-w-sm items-start gap-2.5 rounded-lg bg-stone-900 px-4 py-3 text-sm text-white shadow-lg">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent-400" aria-hidden="true" />
          <span>{toastMessage}</span>
        </div>
      )}

      {isSavedNoticesOpen && (
        <SavedNoticesModal
          notices={savedNotices}
          onLoad={handleLoadSavedNotice}
          onExport={handleExportNoticeJson}
          onDelete={handleDeleteSavedNotice}
          onImport={() => noticeJsonInputRef.current?.click()}
          onClose={() => setIsSavedNoticesOpen(false)}
        />
      )}

      {isGeneratedLogOpen && (
        <GeneratedLogModal
          entries={generatedLog}
          onLoad={handleLoadGeneratedLogEntry}
          onClear={handleClearGeneratedLog}
          onExportCsv={handleExportGeneratedLogCsv}
          onClose={() => setIsGeneratedLogOpen(false)}
        />
      )}

      {isGrayModalOpen && <GrayPdfConverterModal onClose={() => setIsGrayModalOpen(false)} showToast={showToast} />}
    </div>
  );
}
