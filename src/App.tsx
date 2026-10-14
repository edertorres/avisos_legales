import { FuneralWorkspace } from './components/FuneralWorkspace';
import { isNoticeConfig, type SavedNotice, type GeneratedLogEntry, type SharedLibrary } from './types/sharedLibrary';
import { requestSharedLibrary, loadAndMigrateLibrary } from './utils/sharedLibraryClient';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { NoticeConfig, SizeOption, OverflowStatus } from './types';
import { INITIAL_SIZES, SAMPLE_NOTICE_IMAGE, DEFAULT_NOTICE_CONFIG } from './data/samples';
import { Header } from './components/Header';
import { EditorPanel } from './components/EditorPanel';
import { NoticePreview } from './components/NoticePreview';
import { NoticeCanvas } from './components/NoticeCanvas';
import { generateNoticePDF, generateNoticePDFWithWeasyPrint } from './utils/pdfGenerator';
import { calculateAutoFitFont } from './utils/autoFitAlgorithm';
import { AlertTriangle, Download, FileText, Flower2, Loader2, PanelLeftClose, PanelLeftOpen, Trash2, Upload, X } from 'lucide-react';

interface PrintRiskAnalysis {
  hasRisk: boolean;
  warnings: string[];
  recommendedMode: 'preserve' | 'flatten';
}

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
  const [config, setConfig] = useState<NoticeConfig>(DEFAULT_NOTICE_CONFIG);
  const [sizes, setSizes] = useState<SizeOption[]>(INITIAL_SIZES);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isWeasyExporting, setIsWeasyExporting] = useState<boolean>(false);
  const [isGrayModalOpen, setIsGrayModalOpen] = useState<boolean>(false);
  const [isConvertingGrayPdf, setIsConvertingGrayPdf] = useState<boolean>(false);
  const [grayPdfFile, setGrayPdfFile] = useState<File | null>(null);
  const [flattenGrayPdf, setFlattenGrayPdf] = useState<boolean>(true);
  const [grayPdfProgress, setGrayPdfProgress] = useState<number>(0);
  const [grayPdfProgressLabel, setGrayPdfProgressLabel] = useState<string>('');
  const [isAnalyzingGrayPdf, setIsAnalyzingGrayPdf] = useState<boolean>(false);
  const [grayPdfRisk, setGrayPdfRisk] = useState<PrintRiskAnalysis | null>(null);
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
      setConfig(newConfig);
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

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleConfigChange = (updated: Partial<NoticeConfig>) => {
    setConfig((prev) => ({ ...prev, ...updated }));
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
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial-avisos-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
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
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenameSafeName(exportName)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
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

  const handleAddCustomSize = (newSize: SizeOption) => {
    setSizes((prev) => {
      const nextSizes = [...prev, { ...newSize, isCustom: true }];
      persistCustomSizes(nextSizes);
      return nextSizes;
    });
    showToast(`Nuevo tamaño agregado: ${newSize.widthCm} x ${newSize.heightCm} cm`);
  };

  const handleDeleteCustomSize = (id: string) => {
    setSizes((prev) => {
      const nextSizes = prev.filter((s) => s.id !== id);
      persistCustomSizes(nextSizes);
      return nextSizes;
    });
    if (config.size.id === id) {
      setConfig((prev) => ({ ...prev, size: INITIAL_SIZES[1] }));
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

  const resetGrayPdfModal = () => {
    setIsGrayModalOpen(false);
    setGrayPdfFile(null);
    setFlattenGrayPdf(true);
    setGrayPdfProgress(0);
    setGrayPdfProgressLabel('');
    setIsAnalyzingGrayPdf(false);
    setGrayPdfRisk(null);
  };

  const analyzeGrayPdfRisk = async (file: File) => {
    try {
      setIsAnalyzingGrayPdf(true);
      setGrayPdfRisk(null);

      const response = await fetch('/api/pdf/analyze-print-risk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'x-filename': encodeURIComponent(file.name),
        },
        body: file,
      });

      if (!response.ok) return;

      const analysis = (await response.json()) as PrintRiskAnalysis;
      setGrayPdfRisk(analysis);

      if (analysis.recommendedMode === 'flatten') {
        setFlattenGrayPdf(true);
      }
    } catch (err) {
      console.warn('PDF risk analysis error:', err);
    } finally {
      setIsAnalyzingGrayPdf(false);
    }
  };

  const handleConvertGrayPdf = async () => {
    if (!grayPdfFile) {
      showToast('Selecciona un PDF para convertir.');
      return;
    }

    try {
      setIsConvertingGrayPdf(true);
      setGrayPdfProgress(12);
      setGrayPdfProgressLabel('Preparando archivo...');
      showToast('Convirtiendo PDF externo a grises con Ghostscript...');

      window.setTimeout(() => {
        setGrayPdfProgress((current) => Math.max(current, 35));
        setGrayPdfProgressLabel('Aplicando perfil ICC...');
      }, 300);

      window.setTimeout(() => {
        setGrayPdfProgress((current) => Math.max(current, 68));
        setGrayPdfProgressLabel(flattenGrayPdf ? 'Acoplando transparencias a 1200 dpi...' : 'Preservando vectores y fuentes...');
      }, 1200);

      const response = await fetch('/api/pdf/convert-gray', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'x-filename': encodeURIComponent(grayPdfFile.name),
          'x-gray-conversion-mode': flattenGrayPdf ? 'flatten' : 'preserve',
        },
        body: grayPdfFile,
      });

      if (!response.ok) {
        let message = 'No se pudo convertir el PDF.';
        try {
          const body = await response.json();
          message = body.error || message;
        } catch {
          message = await response.text();
        }
        throw new Error(message);
      }

      setGrayPdfProgress(90);
      setGrayPdfProgressLabel('Preparando descarga...');

      const blob = await response.blob();
      const baseName = grayPdfFile.name.replace(/\.pdf$/i, '') || 'documento';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}_K.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      setIsGrayModalOpen(false);
      setGrayPdfFile(null);
      setFlattenGrayPdf(true);
      setGrayPdfProgress(100);
      setGrayPdfProgressLabel('');
      setGrayPdfRisk(null);
      showToast('PDF convertido a canal K y descargado.');
    } catch (err) {
      console.error('Gray PDF conversion error:', err);
      const message = err instanceof Error ? err.message : 'Reintenta con otro PDF.';
      showToast(`Error convirtiendo PDF: ${message}`);
    } finally {
      setIsConvertingGrayPdf(false);
      window.setTimeout(() => {
        setGrayPdfProgress(0);
        setGrayPdfProgressLabel('');
      }, 500);
    }
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
    <div className="h-screen w-screen bg-slate-100 text-slate-900 flex flex-col font-sans overflow-hidden">
      <nav className="relative z-40 shrink-0 border-b border-slate-700 bg-slate-950 px-3 py-3 sm:px-5" aria-label="Tipo de aviso">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="w-full sm:w-auto">
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Selecciona el tipo de aviso</p>
            <div className="flex gap-2">
              {([
                { id: 'standard', label: 'Avisos legales', icon: FileText },
                { id: 'funeral', label: 'Avisos funerarios', icon: Flower2 },
              ] as const).map(({ id, label, icon: Icon }) => <button
                key={id}
                type="button"
                aria-pressed={section === id}
                onClick={() => setSection(id)}
                className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-extrabold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300 sm:flex-none sm:px-5 sm:text-base ${section === id ? 'border-emerald-300 bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300/30' : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-400 hover:bg-slate-700'}`}
              ><Icon className="h-5 w-5 shrink-0" /><span>{label}</span></button>)}
            </div>
          </div>
          <p className="flex items-center gap-2 text-xs text-slate-300" role="status" aria-live="polite">
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
            Editando: <strong className="font-bold text-white">{section === 'standard' ? 'Avisos legales' : 'Avisos funerarios'}</strong>
          </p>
        </div>
      </nav>
      <div className={section === 'funeral' ? 'hidden' : 'shrink-0'}>
      {/* Header Bar */}
      <Header
        onLoadSample={handleLoadSample}
        onReset={handleReset}
        onExportPdf={handleExportPdf}
        onExportWeasyPdf={handleExportWeasyPdf}
        onOpenGrayPdfConverter={() => setIsGrayModalOpen(true)}
        onSaveNotice={handleSaveNotice}
        onOpenSavedNotices={() => setIsSavedNoticesOpen(true)}
        onOpenGeneratedLog={() => setIsGeneratedLogOpen(true)}
        onExportNoticeJson={() => handleExportNoticeJson()}
        onImportNoticeJson={() => noticeJsonInputRef.current?.click()}
        isExporting={isExporting}
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
        <FuneralWorkspace loadedTemplate={funeralTemplate} sizes={sizes} onAddSize={handleAddCustomSize} templates={savedNotices} onSaveTemplate={async (name, templateConfig) => {
          const now = new Date().toISOString();
          await mutateLibrary('/notices', 'POST', { id: `notice-${crypto.randomUUID()}`, name, config: templateConfig, createdAt: now, updatedAt: now });
        }} />
      </div>
      {/* Main Workspace */}
      <main className={`${section === 'funeral' ? 'hidden' : 'grid'} flex-1 min-h-0 w-full p-3 sm:p-4 grid-cols-1 lg:grid-cols-12 gap-4 overflow-y-auto lg:overflow-hidden`}>
        {/* Left Control Panel (5 cols desktop - Independent internal scroll) */}
        {!isEditorPanelCollapsed && (
          <div className="order-2 lg:order-1 lg:col-span-5 h-[500px] lg:h-full min-h-0 flex flex-col overflow-hidden relative">
            <button
              type="button"
              onClick={() => setIsEditorPanelCollapsed(true)}
              className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-100"
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
              onAutoFitFont={handleAutoFitFont}
              isOverflowing={overflowStatus.isOverflowing}
            />
          </div>
        )}

        {/* Right Preview Panel (7 cols desktop - Static anchored canvas) */}
        <div
          className={`order-1 lg:order-2 ${
            isEditorPanelCollapsed ? 'lg:col-span-12' : 'lg:col-span-7'
          } h-[450px] sm:h-[550px] lg:h-full min-h-0 flex flex-col overflow-hidden relative`}
        >
          {isEditorPanelCollapsed && (
            <button
              type="button"
              onClick={() => setIsEditorPanelCollapsed(false)}
              className="absolute left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-md transition-colors hover:bg-slate-100"
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
          />
        </div>
      </main>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-800 text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-xl border border-slate-700 flex items-center gap-2 animate-bounce">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {isSavedNoticesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-300" />
                <div>
                  <h2 className="text-sm font-extrabold uppercase tracking-wide">Anuncios Guardados</h2>
                  <p className="text-xs text-slate-300">Biblioteca compartida para todos</p>
                </div>
              </div>
              <button
                onClick={() => setIsSavedNoticesOpen(false)}
                className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                title="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {savedNotices.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
                  <p className="text-sm font-bold text-slate-800">Aún no hay anuncios guardados.</p>
                  <p className="mt-1 text-xs text-slate-500">Usa Guardar para conservar el anuncio actual y acceder desde cualquier PC.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {savedNotices.map((notice) => {
                    const updatedAt = new Date(notice.updatedAt).toLocaleString('es-CO');
                    return (
                      <div key={notice.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-black text-slate-900">{notice.name}</h3>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {notice.config.size.widthCm} × {notice.config.size.heightCm} cm · {updatedAt}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleLoadSavedNotice(notice)}
                              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-slate-800"
                            >
                              Cargar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExportNoticeJson(notice)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-700 transition-colors hover:bg-slate-100"
                              title="Exportar este anuncio"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSavedNotice(notice.id)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 transition-colors hover:bg-rose-100"
                              title="Eliminar este anuncio"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => noticeJsonInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100"
              >
                <Upload className="h-3.5 w-3.5" />
                Importar JSON
              </button>
              <button
                type="button"
                onClick={() => setIsSavedNoticesOpen(false)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {isGeneratedLogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-300" />
                <div>
                  <h2 className="text-sm font-extrabold uppercase tracking-wide">Historial de PDFs</h2>
                  <p className="text-xs text-slate-300">Registro compartido de avisos generados</p>
                </div>
              </div>
              <button
                onClick={() => setIsGeneratedLogOpen(false)}
                className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                title="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {generatedLog.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
                  <p className="text-sm font-bold text-slate-800">Aún no hay PDFs registrados.</p>
                  <p className="mt-1 text-xs text-slate-500">El historial se crea automáticamente cuando una exportación termina bien.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {generatedLog.map((entry) => {
                    const generatedAt = new Date(entry.generatedAt).toLocaleString('es-CO');
                    return (
                      <div key={entry.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-black text-slate-900">{entry.title}</h3>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {entry.config.size.widthCm} × {entry.config.size.heightCm} cm · PDF tamaño real · {generatedAt}
                            </p>
                            <p className="mt-1 truncate text-xs text-slate-500">
                              {entry.filename} · {entry.config.fontFamily} · cuerpo {entry.config.bodyFontSizePt} pt · inter {entry.config.lineHeight.toFixed(2)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleLoadGeneratedLogEntry(entry)}
                            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-slate-800"
                          >
                            Cargar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
                <button
                  type="button"
                  onClick={handleClearGeneratedLog}
                  disabled={generatedLog.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Borrar historial
                </button>
                <button
                  type="button"
                  onClick={handleExportGeneratedLogCsv}
                  disabled={generatedLog.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => setIsGeneratedLogOpen(false)}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800"
                >
                  Cerrar
                </button>
            </div>
          </div>
        </div>
      )}

      {isGrayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-300" />
                <div>
                  <h2 className="text-sm font-extrabold uppercase tracking-wide">Convertir PDF a Grises</h2>
                  <p className="text-xs text-slate-300">Ghostscript + ISOnewspaper26v4_gr.icc</p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!isConvertingGrayPdf) {
                    resetGrayPdfModal();
                  }
                }}
                className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                disabled={isConvertingGrayPdf}
                title="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <label className="flex min-h-[150px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition-colors hover:border-emerald-400 hover:bg-emerald-50">
                <Upload className="h-8 w-8 text-emerald-700" />
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {grayPdfFile ? grayPdfFile.name : 'Seleccionar PDF'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">El archivo se convertira a DeviceGray/K en PDF 1.3 para prensa</p>
                </div>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  disabled={isConvertingGrayPdf}
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setGrayPdfFile(file);
                    setFlattenGrayPdf(true);
                    setGrayPdfRisk(null);
                    if (file) {
                      void analyzeGrayPdfRisk(file);
                    }
                  }}
                />
              </label>

              {isAnalyzingGrayPdf && (
                <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-900">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
                  <span>Analizando transparencias, máscaras y efectos...</span>
                </div>
              )}

              {grayPdfRisk?.hasRisk && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-xs text-amber-950">
                  <div className="mb-2 flex items-center gap-2 font-extrabold">
                    <AlertTriangle className="h-4 w-4 text-amber-700" />
                    <span>Advertencia para RIP antiguo</span>
                  </div>
                  <div className="space-y-1">
                    {grayPdfRisk.warnings.slice(0, 4).map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                  <p className="mt-2 font-semibold">Se recomienda acoplar transparencias antes de enviar a rotativa.</p>
                </div>
              )}

              {isConvertingGrayPdf && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold text-emerald-950">
                    <span>{grayPdfProgressLabel || 'Procesando PDF...'}</span>
                    <span>{Math.max(1, Math.min(99, grayPdfProgress))}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white ring-1 ring-emerald-200">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all duration-500 ease-out"
                      style={{ width: `${Math.max(6, Math.min(99, grayPdfProgress))}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                Requiere el perfil ICC local ISOnewspaper26v4_gr.icc. En modo RIP antiguo genera PDF/X-1a:2001 sobre PDF 1.3 DeviceGray/K.
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs text-slate-700 transition-colors hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={flattenGrayPdf}
                  disabled={isConvertingGrayPdf}
                  onChange={(event) => setFlattenGrayPdf(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 disabled:opacity-50"
                />
                <span>
                  <span className="block font-bold text-slate-900">Acoplar transparencias para RIP antiguo</span>
                  <span className="mt-0.5 block text-slate-500">Usa PDF 1.3 a 1200 dpi, acopla transparencias y evita PDF 1.7.</span>
                </span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                onClick={() => {
                  resetGrayPdfModal();
                }}
                disabled={isConvertingGrayPdf}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConvertGrayPdf}
                disabled={!grayPdfFile || isConvertingGrayPdf}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                {isConvertingGrayPdf ? 'Convirtiendo...' : 'Convertir y descargar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
