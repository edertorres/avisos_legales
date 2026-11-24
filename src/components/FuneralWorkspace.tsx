import { SlidersHorizontal, Layers, Type, Ruler, Image as ImageIcon, BoxSelect, FileText, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, CheckCheck, Search } from 'lucide-react';
import { InDesignStepper } from './InDesignStepper';
import React, { useState, useEffect, useRef } from 'react';
import { NoticeConfig, SizeOption, FuneralDesign, OverflowStatus } from '../types';
import { SavedNotice } from '../types/sharedLibrary';
import { DEFAULT_NOTICE_CONFIG } from '../data/samples';
import { FONT_OPTIONS } from '../data/fonts';
import { NoticeCanvas } from './NoticeCanvas';
import { LogoCropEditor } from './LogoCropEditor';
import { funeralConfigForRow, resolveFuneralLogo, logoResolutionLabel, type FuneralLogo } from '../utils/funeralLogos';
import { readFuneralFile, rowsToNotices, FuneralRow } from '../utils/funeralImport';
import { generateNoticePDF, readServerError } from '../utils/pdfGenerator';
import { downloadBlob } from '../utils/download';
import * as ui from './ui';
import { ControlGroup } from './ControlGroup';
import { individualFuneralFilename } from '../utils/funeralFilenames';

const initial: NoticeConfig = {
  ...DEFAULT_NOTICE_CONFIG, noticeType: 'funeral', marginMm: 2, borderWidthPx: 0.3333,
  letterSpacingMm: 0, lineHeight: 1.15, headerFontSizePt: 7, subheaderFontSizePt: 10,
  bodyFontSizePt: 5.5, textAlign: 'center', showMarginGuides: false,
  funeral: { payer: '', deceased: '', introduction: 'Lamentan el sensible fallecimiento del Señor',
    condolences: 'y hacen llegar las más sinceras manifestaciones\nde condolencia a sus familiares y amigos.',
    borderGapMm: 0.5, borderColor: '#000000', blockGapMm: 1.2 },
};
const field = ui.field;
const button = ui.btn.secondary;
const primary = ui.btn.primary;
const emptyRow = (): FuneralRow => ({ payer: '', deceased: '' });

function FuneralWorkspaceView({ sizes, onAddSize, templates, onSaveTemplate, loadedTemplate }: {
  sizes: SizeOption[]; onAddSize: (size: SizeOption) => void;
  loadedTemplate?: SavedNotice | null;
  templates: SavedNotice[]; onSaveTemplate: (name: string, config: NoticeConfig) => Promise<unknown>;
}) {
  const [design, setDesign] = useState(initial);
  const [rows, setRows] = useState<FuneralRow[]>([emptyRow()]);
  const [selected, setSelected] = useState(0);
  const [cropEditing, setCropEditing] = useState(false);
  const [reviewed, setReviewed] = useState<number[]>([]);
  const [importRows, setImportRows] = useState<string[][] | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [payerColumn, setPayerColumn] = useState(0);
  const [deceasedColumn, setDeceasedColumn] = useState(1);
  const [logoColumn, setLogoColumn] = useState(-1);
  const [logos, setLogos] = useState<(FuneralLogo & { id: string; size: number })[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [sizeName, setSizeName] = useState('');
  const [width, setWidth] = useState(6.3);
  const [height, setHeight] = useState(3);
  const [message, setMessageState] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const setMessage = (text: string, isError = false) => { setMessageState(text); setMessageIsError(isError); };
  const [busy, setBusy] = useState(false);
  const [overflow, setOverflow] = useState<OverflowStatus | null>(null);
  const [zoom, setZoom] = useState(2);
  const [autoZoom, setAutoZoom] = useState(true);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const area = previewAreaRef.current;
    if (!area || !autoZoom) return;
    const fit = () => {
      if (area.clientWidth > 40) setZoom(Number(Math.min(2, Math.max(0.1, (area.clientWidth - 42) / (design.size.widthCm * 37.795))).toFixed(2)));
    };
    const observer = new ResizeObserver(fit); observer.observe(area); fit();
    return () => observer.disconnect();
  }, [autoZoom, design.size.widthCm]);
  const [panelTab, setPanelTab] = useState<'design' | 'batch'>('design');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'issues'>('all');
  const [showGuides, setShowGuides] = useState(false);
  useEffect(() => {
    if (loadedTemplate?.config.funeral) { setDesign({ ...loadedTemplate.config, logoUrl: null }); setReviewed([]); setOverflow(null); }
  }, [loadedTemplate]);
  const configFor = (row: FuneralRow): NoticeConfig => funeralConfigForRow(design, row, logos);
  const config = configFor(rows[selected]);
  const changeDesign = (changes: Partial<NoticeConfig>) => { setDesign(prev => ({ ...prev, ...changes })); setReviewed([]); setOverflow(null); };
  const changeFuneral = (changes: Partial<FuneralDesign>) => changeDesign({ funeral: { ...design.funeral!, ...changes } });
  const changeRow = (index: number, changes: Partial<FuneralRow>) => {
    setRows(prev => prev.map((row, i) => i === index ? { ...row, ...(changes.logoFile !== undefined && changes.logoFile !== row.logoFile ? { croppedLogoUrl: undefined, logoCrop: undefined } : {}), ...changes } : row));
    setReviewed(prev => prev.filter(i => i !== index)); setOverflow(null);
  };
  const logoStates = rows.map(row => resolveFuneralLogo(row, logos));
  const currentLogo = logoStates[selected];
  const unresolvedLogos = logoStates.filter(logo => logo.status === 'missing' || logo.status === 'duplicate').length;
  const invalid = rows.some(row => !row.deceased.trim()) || unresolvedLogos > 0;

  function invalidateLogos(names: string[]) {
    setRows(prev => prev.map(row => names.includes(row.logoFile?.trim() || '') ? { ...row, croppedLogoUrl: undefined, logoCrop: undefined } : row));
    setReviewed(prev => prev.filter(index => !names.includes(rows[index]?.logoFile?.trim() || '')));
    setOverflow(null);
  }
  async function uploadLogos(files: File[], assignToCurrent = false) {
    if (!files.length) return;
    setBusy(true); setMessage('');
    try {
      if (logos.reduce((total, logo) => total + logo.size, 0) + files.reduce((total, file) => total + file.size, 0) > 15 * 1024 * 1024) {
        throw new Error('Los logos cargados superan 15 MB en total. Elimina archivos que no necesites.');
      }
      const loaded = await Promise.all(files.map(async file => {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error(`${file.name}: usa PNG, JPEG o WebP.`);
        if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name}: supera 5 MB.`);
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`)); reader.readAsDataURL(file);
        });
        const image = new Image(); image.src = dataUrl;
        try { await image.decode(); } catch { throw new Error(`${file.name}: la imagen no es válida.`); }
        return { id: crypto.randomUUID(), name: file.name, dataUrl, size: file.size };
      }));
      setLogos(prev => [...prev, ...loaded]);
      invalidateLogos(loaded.map(logo => logo.name));
      if (assignToCurrent) changeRow(selected, { logoFile: loaded[0].name });
      setMessage('Logos cargados. Comprueba las coincidencias por nombre y revisa los avisos.');
    } catch (error) { setMessage((error as Error).message, true); }
    finally { setBusy(false); }
  }

  async function importFile(file?: File) {
    if (!file) return;
    setBusy(true); setMessage('');
    try {
      const data = await readFuneralFile(file);
      if (!data.length) throw new Error('El archivo está vacío.');
      setImportRows(data); setHasHeader(true); setPayerColumn(0); setDeceasedColumn(1);
      setLogoColumn(data[0].findIndex(cell => cell.trim().toLowerCase() === 'logo'));
    } catch (error) { setMessage((error as Error).message, true); }
    finally { setBusy(false); }
  }
  async function saveTemplate() {
    if (!templateName.trim()) return;
    setBusy(true);
    try {
      await onSaveTemplate(templateName.trim(), { ...design, logoUrl: null, funeral: { ...design.funeral!, payer: '', deceased: '', crossEnabled: false } });
      setMessage('Plantilla guardada en la biblioteca compartida.'); setTemplateName('');
    } catch (error) { setMessage((error as Error).message, true); }
    finally { setBusy(false); }
  }
  async function exportBatch(mode: 'combined' | 'individual') {
    if (invalid || reviewed.length !== rows.length) { setMessage('Completa el nombre del fallecido, resuelve los logos y revisa todos los avisos.', true); return; }
    setBusy(true); setMessage(rows.length === 1 && mode === 'combined' ? 'Generando el aviso…' : 'Generando el lote…');
    try {
      if (rows.length === 1 && mode === 'combined') {
        await generateNoticePDF({
          config, widthCm: config.size.widthCm, heightCm: config.size.heightCm,
          filename: individualFuneralFilename(rows[0].payer, 0, new Set(), rows[0].logoFile),
        });
        setMessage('Aviso generado y descargado.');
        return;
      }
      const response = await fetch('/api/pdf/funeral-batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design: { ...design, logoUrl: null }, rows, mode, logos: logos.filter(logo => rows.some(row => row.logoFile?.trim() === logo.name)).map(({ name, dataUrl }) => ({ name, dataUrl })) }),
      });
      if (!response.ok) throw new Error(await readServerError(response, 'No se pudo generar el lote.'));
      downloadBlob(await response.blob(), mode === 'combined' ? 'avisos-funerarios_K.pdf' : 'avisos-funerarios_individuales.zip');
      setMessage('Lote generado y descargado.');
    } catch (error) { setMessage((error as Error).message, true); }
    finally { setBusy(false); }
  }
  const numberField = (label: string, value: number, update: (value: number) => void, min = 0, max = 50, step = 0.1) =>
    <InDesignStepper label={label} value={value} onChange={update} min={min} max={max} step={step} presets={label.startsWith('Grosor') ? [0.25, 0.5, 1] : undefined} decimals={step < 0.1 ? 2 : 1} />;
  const selectRow = (index: number) => { if (index !== selected) { setSelected(index); setOverflow(null); } };
  const visibleRows = rows.map((row, index) => ({ row, index })).filter(({ row, index }) => {
    const matches = `${row.payer} ${row.deceased} ${row.logoFile || ''}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'));
    const issue = !row.deceased.trim() || ['missing', 'duplicate'].includes(logoStates[index].status);
    return matches && (filter === 'all' || (filter === 'pending' ? !reviewed.includes(index) : issue));
  });
  const exportHint = invalid ? 'Completa los fallecidos y resuelve los logos pendientes.' : reviewed.length !== rows.length ? 'Revisa todos los avisos para habilitar la descarga.' : 'Todo el lote está listo para exportar.';

  return <main className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 lg:overflow-hidden">
    <div className="grid gap-4 lg:h-full lg:grid-cols-12">
      <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-stone-200 bg-stone-50 shadow-sm order-2 lg:order-1 lg:col-span-5" aria-label="Controles del aviso funerario">
        <div className="shrink-0 border-b border-stone-200 bg-white p-4">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-stone-800"><SlidersHorizontal className="h-4 w-4 text-stone-500" />Diseño del lote</h1>
          <div className="mt-3 flex gap-1 rounded-lg bg-stone-100 p-1" role="tablist" aria-label="Controles" onKeyDown={e => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault();
            const next = e.key === 'Home' ? 'design' : e.key === 'End' ? 'batch' : panelTab === 'design' ? 'batch' : 'design';
            setPanelTab(next); document.getElementById(`funeral-${next}-tab`)?.focus();
          }}>
            <button id="funeral-design-tab" tabIndex={panelTab === 'design' ? 0 : -1} role="tab" aria-selected={panelTab === 'design'} aria-controls="funeral-design-panel" className={`${button} flex-1 ${panelTab === 'design' ? '!border-accent-200 !bg-white !text-accent-800' : '!border-transparent !bg-transparent !shadow-none'}`} onClick={() => setPanelTab('design')}><SlidersHorizontal className="h-4 w-4" />Diseño y plantilla</button>
            <button id="funeral-batch-tab" tabIndex={panelTab === 'batch' ? 0 : -1} role="tab" aria-selected={panelTab === 'batch'} aria-controls="funeral-batch-panel" className={`${button} flex-1 ${panelTab === 'batch' ? '!border-accent-200 !bg-white !text-accent-800' : '!border-transparent !bg-transparent !shadow-none'}`} onClick={() => setPanelTab('batch')}><Layers className="h-4 w-4" />Importación y logos</button>
          </div>
        </div>
        <div className="space-y-4 p-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <div id="funeral-design-panel" role="tabpanel" aria-labelledby="funeral-design-tab" hidden={panelTab !== 'design'}>
            <p className="mb-3 rounded-lg border border-accent-100 bg-accent-50 p-3 text-xs text-accent-900">El diseño se aplica a todo el lote. Modificarlo requiere revisar los avisos de nuevo.</p>
            <fieldset disabled={busy} className="space-y-3">
              <ControlGroup title="Plantillas" icon={<FileText className="h-4 w-4" />}>
          <label className="block text-sm">Plantilla<select className={field} defaultValue="" onChange={e => {
            const saved = templates.find(t => t.id === e.target.value);
            if (saved?.config.funeral) { changeDesign({ ...saved.config, logoUrl: null }); if (!sizes.some(size => size.id === saved.config.size.id)) onAddSize({ ...saved.config.size, isCustom: true }); }
            e.target.value = '';
          }}><option value="">Seleccionar plantilla…</option>{templates.filter(t => t.config.noticeType === 'funeral').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <div className="flex gap-2"><input className={field} placeholder="Nombre de la plantilla" aria-label="Nombre de la plantilla" value={templateName} onChange={e => setTemplateName(e.target.value)} /><button className={button} disabled={!templateName.trim()} onClick={saveTemplate}>Guardar plantilla</button></div>

              </ControlGroup>
              <ControlGroup title="Texto común" icon={<FileText className="h-4 w-4" />}>
          <label className="block text-sm">Texto introductorio<textarea className={field} value={design.funeral!.introduction} onChange={e => changeFuneral({ introduction: e.target.value })} /></label>
          <label className="block text-sm">Condolencias<textarea className={field} rows={3} value={design.funeral!.condolences} onChange={e => changeFuneral({ condolences: e.target.value })} /></label>

              </ControlGroup>
              <ControlGroup title="Dimensiones y márgenes" icon={<Ruler className="h-4 w-4" />}>
          <label className="block text-sm">Tamaño<select className={field} value={design.size.id} onChange={e => changeDesign({ size: sizes.find(size => size.id === e.target.value)! })}>{sizes.map(size => <option key={size.id} value={size.id}>{size.name}</option>)}</select></label>
          <details><summary className="cursor-pointer text-sm font-semibold">Añadir tamaño</summary><div className="mt-2 grid grid-cols-2 gap-2">
            {numberField('Ancho (cm)', width, setWidth, 1, 50)}{numberField('Alto (cm)', height, setHeight, 1, 50)}
            <input className={field} placeholder="Nombre opcional" aria-label="Nombre del tamaño" value={sizeName} onChange={e => setSizeName(e.target.value)} />
            <button className={button} onClick={() => { const size = { id: `funeral-${crypto.randomUUID()}`, name: sizeName.trim() || `${width} × ${height} cm`, widthCm: width, heightCm: height, isCustom: true }; onAddSize(size); changeDesign({ size }); }}>Añadir</button>
          </div></details>

              </ControlGroup>
              <ControlGroup title="Tipografía" icon={<Type className="h-4 w-4" />}>
          <label className="block text-sm">Tipografía<select className={field} value={design.fontFamily} onChange={e => changeDesign({ fontFamily: e.target.value })}>{FONT_OPTIONS.map(font => <option key={font.value} value={font.value}>{font.shortName}</option>)}</select></label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {numberField('Anunciante (pt)', design.headerFontSizePt, n => changeDesign({ headerFontSizePt: n }), 3, 72)}
            {numberField('Fallecido (pt)', design.subheaderFontSizePt, n => changeDesign({ subheaderFontSizePt: n }), 3, 72)}
            {numberField('Texto fijo (pt)', design.bodyFontSizePt, n => changeDesign({ bodyFontSizePt: n }), 3, 72)}
            {numberField('Interlineado', design.lineHeight, n => changeDesign({ lineHeight: n }), 0.8, 3, 0.05)}
            {numberField('Espacio entre bloques (mm)', design.funeral!.blockGapMm, n => changeFuneral({ blockGapMm: n }), 0, 20)}
            {numberField('Distancia al texto (mm)', design.marginMm, n => changeDesign({ marginMm: n }), 0, 30)}
          </div>

              </ControlGroup>
              <ControlGroup title="Borde doble" icon={<BoxSelect className="h-4 w-4" />}>
          <div className="grid grid-cols-2 gap-2">
            {numberField('Grosor de cada línea (pt)', Number((design.borderWidthPx * 0.75).toFixed(3)), n => changeDesign({ borderWidthPx: n / 0.75 }), 0.15, 6, 0.05)}
            {numberField('Separación (mm)', design.funeral!.borderGapMm, n => changeFuneral({ borderGapMm: n }), 0, 10)}
            <label className="text-xs">Color<input className={field} type="color" value={design.funeral!.borderColor} onChange={e => changeFuneral({ borderColor: e.target.value })} /></label>
          </div><p className="text-xs text-stone-500">El PDF conserva la salida de imprenta en escala de grises; el color se convierte a su tono gris.</p>

              </ControlGroup>
              <ControlGroup title="Posición y tamaño del logo" icon={<ImageIcon className="h-4 w-4" />}>
          
          <p className="text-xs text-stone-600">Estos ajustes se aplican a todo el lote y se guardan en la plantilla. La imagen se asigna a cada anunciante durante la revisión.</p>
          <div className="space-y-3 rounded border border-stone-200 p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">Posición<select className={field} value={design.funeral!.logoPosition || 'top-center'} onChange={e => changeFuneral({ logoPosition: e.target.value as FuneralDesign['logoPosition'] })}>
                <option value="left">Izquierda</option><option value="right">Derecha</option><option value="top-center">Arriba centrado</option><option value="bottom-center">Abajo centrado</option>
              </select></label>
              <label className="text-xs">Referencia de alineación<select className={field} value={design.funeral!.logoAlignment || 'block'} onChange={e => changeFuneral({ logoAlignment: e.target.value as FuneralDesign['logoAlignment'] })}>
                <option value="payer">Nombre de quien paga</option><option value="block">Todo el bloque de texto</option>
              </select></label>
              {numberField('Ancho del logo (mm)', design.logoWidthMm, n => changeDesign({ logoWidthMm: n }), 2, 100)}
              {numberField('Separación del texto (mm)', design.funeral!.logoGapMm ?? 0.7, n => changeFuneral({ logoGapMm: n }), 0, 30)}
              {numberField('Desplazamiento horizontal (mm)', design.funeral!.logoOffsetXMm ?? 0, n => changeFuneral({ logoOffsetXMm: n }), -30, 30)}
              {numberField('Desplazamiento vertical (mm)', design.funeral!.logoOffsetYMm ?? 0, n => changeFuneral({ logoOffsetYMm: n }), -30, 30)}
            </div>
            <p className="text-xs text-stone-500">El logo ocupa una fila propia. La referencia determina el ancho para alinearlo. Los valores positivos desplazan a la derecha y hacia abajo; los negativos, a la izquierda y hacia arriba.</p>
            <button className={button} onClick={() => changeFuneral({ logoOffsetXMm: 0, logoOffsetYMm: 0 })}>Restablecer desplazamientos</button>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={design.grayscaleLogo} onChange={e => changeDesign({ grayscaleLogo: e.target.checked })} /> Vista previa del logo en escala de grises</label>
          </div>

              </ControlGroup>
              <ControlGroup title="Cruz opcional" icon={<BoxSelect className="h-4 w-4" />}>
                <p className="text-xs text-stone-500">Negra, de dos trazos. Los ajustes se guardan en la plantilla; se activa individualmente durante la revisión.</p>
                <div className="grid grid-cols-2 gap-2">
                  {numberField('Altura de la cruz (mm)', design.funeral!.crossHeightMm ?? 6, n => changeFuneral({ crossHeightMm: n }), 2, 20)}
                  {numberField('Grosor de la cruz (pt)', design.funeral!.crossStrokePt ?? 0.5, n => changeFuneral({ crossStrokePt: n }), 0.2, 3, 0.05)}
                  {numberField('Separación adicional (mm)', design.funeral!.crossInsetMm ?? 0, n => changeFuneral({ crossInsetMm: n }), 0, 10)}
                </div>
                <p className="text-xs text-stone-500">La separación se suma al margen interior del anuncio.</p>
              </ControlGroup>
            </fieldset>
          </div>
          <div id="funeral-batch-panel" role="tabpanel" aria-labelledby="funeral-batch-tab" hidden={panelTab !== 'batch'} className="space-y-3">
            <ControlGroup title="Importar XLSX o CSV" icon={<Layers className="h-4 w-4" />}>
        
        <p className="text-xs text-stone-600">XLSX (primera hoja) o CSV con coma o punto y coma. Una fila por aviso, hasta 200.</p>
        <input className={field} disabled={busy} type="file" accept=".xlsx,.csv" aria-label="Importar lote" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
        {importRows && <fieldset disabled={busy} className="space-y-2 rounded border p-3">
          <label className="text-sm"><input type="checkbox" checked={hasHeader} onChange={e => setHasHeader(e.target.checked)} /> La primera fila contiene encabezados</label>
          <div className="grid grid-cols-2 gap-2">{(['Anunciante', 'Fallecido'] as const).map((label, index) => <label key={label} className="text-sm">{label}<select className={field} value={index === 0 ? payerColumn : deceasedColumn} onChange={e => (index === 0 ? setPayerColumn : setDeceasedColumn)(Number(e.target.value))}>{Array.from({ length: Math.max(...importRows.map(row => row.length)) }, (_, column) => <option key={column} value={column}>{hasHeader ? importRows[0][column] || `Columna ${column + 1}` : `Columna ${column + 1}`}</option>)}</select></label>)}</div>
          <label className="block text-sm">Columna logo (opcional)<select className={field} value={logoColumn} onChange={e => setLogoColumn(Number(e.target.value))}>
            <option value={-1}>Sin columna de logo</option>
            {Array.from({ length: Math.max(...importRows.map(row => row.length)) }, (_, column) => <option key={column} value={column}>{hasHeader ? importRows[0][column] || `Columna ${column + 1}` : `Columna ${column + 1}`}</option>)}
          </select></label>
          <p className="text-xs">Ejemplo: {importRows[hasHeader ? 1 : 0]?.[payerColumn]} / {importRows[hasHeader ? 1 : 0]?.[deceasedColumn]}</p>
          <button className={button} onClick={() => { try { setRows(rowsToNotices(importRows, payerColumn, deceasedColumn, hasHeader, logoColumn < 0 ? undefined : logoColumn)); setSelected(0); setReviewed([]); setOverflow(null); setImportRows(null); setMessage('Lote importado. Revisa y completa los nombres vacíos.'); } catch (error) { setMessage((error as Error).message, true); } }}>Reemplazar lote con la importación</button>
          <button className="ml-2 text-sm underline" onClick={() => setImportRows(null)}>Cancelar</button>
        </fieldset>}
            </ControlGroup>
            <ControlGroup title="Logos por anunciante" icon={<ImageIcon className="h-4 w-4" />}>
        
        <p className="text-xs text-stone-600">Carga los archivos juntos. El nombre completo debe coincidir exactamente con la columna logo, incluidas mayúsculas y extensión. PNG, JPEG o WebP; hasta 5 MB por imagen y 15 MB en total.</p>
        <input className={field} type="file" multiple disabled={busy} accept="image/png,image/jpeg,image/webp" aria-label="Cargar logos del lote" onChange={e => { void uploadLogos(Array.from(e.target.files || [])); e.target.value = ''; }} />
        <ul className="max-h-48 space-y-2 overflow-auto">{logos.map(logo => <li key={logo.id} className="flex items-center gap-2 rounded border p-2 text-sm">
          <img src={logo.dataUrl} alt={logo.name} className="h-10 w-12 object-contain" />
          <span className="flex-1 break-all">{logo.name}{logos.filter(item => item.name === logo.name).length > 1 && <strong className="block text-red-700">Nombre duplicado: elimina una de las imágenes.</strong>}</span>
          <button className={button} disabled={busy} aria-label={`Eliminar ${logo.name}`} onClick={() => { setLogos(prev => prev.filter(item => item.id !== logo.id)); invalidateLogos([logo.name]); }}>Eliminar</button>
        </li>)}</ul>
        {unresolvedLogos > 0 && <p role="alert" className="text-sm font-semibold text-red-700">{unresolvedLogos} aviso(s) con logo pendiente o duplicado. Resuélvelos antes de exportar.</p>}
            </ControlGroup>
          </div>
        </div>
      </section>
      <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm order-1 lg:order-2 lg:col-span-7" aria-label="Vista previa y revisión">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-stone-800">Vista previa</h2>
          <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 p-1">
            <button className={button} aria-label="Alejar vista" disabled={zoom <= 0.1} onClick={() => { setAutoZoom(false); setZoom(z => Math.max(0.1, Number((z - 0.25).toFixed(2)))); }}><ZoomOut className="h-4 w-4" /></button>
            <span className="w-12 text-center text-xs font-medium tabular-nums text-stone-700">{Math.round(zoom * 100)}%</span>
            <button className={button} aria-label="Acercar vista" disabled={zoom >= 3} onClick={() => { setAutoZoom(false); setZoom(z => Math.min(3, Number((z + 0.25).toFixed(2)))); }}><ZoomIn className="h-4 w-4" /></button>
            <button className={button} onClick={() => { setAutoZoom(false); setZoom(1); }}>100%</button>
            <button className={button} aria-pressed={autoZoom} onClick={() => setAutoZoom(true)}>Ajustar</button>
          </div>
        </div>
        <div className="min-h-0 space-y-4 p-4 lg:flex-1 lg:overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><button className={button} aria-label="Aviso anterior" disabled={busy || selected === 0} onClick={() => selectRow(selected - 1)}><ChevronLeft className="h-4 w-4" /></button><span className="text-sm font-medium">Aviso {selected + 1} de {rows.length}</span><button className={button} aria-label="Aviso siguiente" disabled={busy || selected === rows.length - 1} onClick={() => selectRow(selected + 1)}><ChevronRight className="h-4 w-4" /></button></div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${reviewed.includes(selected) ? 'bg-accent-50 text-accent-700' : 'bg-amber-50 text-amber-700'}`}>{reviewed.includes(selected) ? 'Revisado' : 'Pendiente de revisión'}</span>
          </div>
          <div className="space-y-3">
        <label className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm"><input type="checkbox" disabled={busy} checked={rows[selected].crossEnabled === true} onChange={e => changeRow(selected, { crossEnabled: e.target.checked })} />Incluir cruz en este aviso</label>
        <label className="block text-sm">Anunciante (opcional)<input className={field} disabled={busy} value={rows[selected].payer} onChange={e => changeRow(selected, { payer: e.target.value })} /></label>
        <label className="block text-sm">Fallecido (obligatorio)<input aria-required="true" className={field} disabled={busy} value={rows[selected].deceased} onChange={e => changeRow(selected, { deceased: e.target.value })} /></label>
        <section aria-label="Logo de este aviso" className="rounded-lg border border-stone-200 bg-stone-50">
          <h3 className="px-3 py-2 text-xs font-medium">Logo de este aviso · {logoResolutionLabel(currentLogo.status)}{rows[selected].logoFile ? ` · ${rows[selected].logoFile}` : ''}</h3>
        <fieldset disabled={busy} className="space-y-2 border-t border-stone-200 p-3">
          <label className="block text-sm">Archivo de logo del anunciante<input className={field} list="funeral-logo-files" placeholder="empresa-abc.png (vacío: sin logo)" value={rows[selected].logoFile || ''} onChange={e => changeRow(selected, { logoFile: e.target.value })} /></label>
          <datalist id="funeral-logo-files">{[...new Set(logos.map(logo => logo.name))].map(name => <option key={name} value={name} />)}</datalist>
          <p role="status" className={`text-sm ${currentLogo.status === 'missing' || currentLogo.status === 'duplicate' ? 'font-semibold text-red-700' : 'text-stone-600'}`}>{logoResolutionLabel(currentLogo.status)}{rows[selected].logoFile?.trim() ? `: ${rows[selected].logoFile.trim()}` : ''}</p>
          {currentLogo.status === 'ready' && <img src={config.logoUrl || currentLogo.dataUrl} alt={`Logo de ${rows[selected].payer}`} className="max-h-20 max-w-32 object-contain" />}
          <div className="flex flex-wrap gap-2">
            <button className={primary} disabled={currentLogo.status !== 'ready'} onClick={() => setCropEditing(true)}>Recortar logo</button>
            {rows[selected].croppedLogoUrl && <button className={button} onClick={() => changeRow(selected, { croppedLogoUrl: undefined, logoCrop: undefined })}>Restablecer logo original</button>}
          </div>
          {currentLogo.status !== 'ready' && <p className="text-xs text-stone-600">Carga y asigna un logo a este aviso para habilitar el recorte.</p>}
          <label className="block text-sm">Cargar y asignar un logo a este aviso<input className={field} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { void uploadLogos(Array.from(e.target.files || []), true); e.target.value = ''; }} /></label>
          <button className={button} onClick={() => changeRow(selected, { logoFile: '' })}>Sin logo para este aviso</button>
        </fieldset>
        </section>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-stone-500"><span className={ui.chip.neutral}>{config.size.widthCm} × {config.size.heightCm} cm</span><label className="flex items-center gap-2"><input type="checkbox" checked={showGuides} onChange={e => setShowGuides(e.target.checked)} />Guías de margen</label></div>
          <div ref={previewAreaRef} className="flex min-h-56 items-start overflow-auto rounded-xl border border-stone-200 bg-stone-100 p-5" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '12px 12px' }}>
            <div className="mx-auto shrink-0" style={{ width: config.size.widthCm * 37.795 * zoom, height: config.size.heightCm * 37.795 * zoom }}><NoticeCanvas config={config} zoomScale={zoom} showMarginGuides={showGuides} onOverflowStatusChange={setOverflow} /></div>
          </div>
          {overflow?.isOverflowing && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900">El contenido no cabe. Ajusta dimensiones, márgenes o tipografía desde el panel de diseño.</p>}
          <div className="flex flex-wrap gap-2">
            <button className={primary} disabled={busy || currentLogo.status === 'missing' || currentLogo.status === 'duplicate' || !rows[selected].deceased.trim() || !overflow || overflow.isOverflowing} onClick={() => { setReviewed(prev => [...new Set([...prev, selected])]); const next = rows.findIndex((_, index) => index !== selected && !reviewed.includes(index)); if (next >= 0) selectRow(next); }}><CheckCheck className="h-4 w-4" />Marcar revisado y continuar</button>
            <button className={button} disabled={busy || rows.length >= 200} onClick={() => { setRows(prev => [...prev, emptyRow()]); setSelected(rows.length); setOverflow(null); }}>Añadir aviso</button>
            <button className={`${button} !text-rose-700`} disabled={busy || rows.length === 1} onClick={() => { setRows(prev => prev.filter((_, i) => i !== selected)); setSelected(Math.max(0, selected - 1)); setReviewed([]); setOverflow(null); }}>Eliminar aviso</button>
          </div>
          <div className="border-t border-stone-200 pt-4">
            <div className="mb-3 flex flex-wrap gap-2"><label className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" /><input className={`${field} !pl-9`} placeholder="Buscar anunciante, fallecido o logo…" aria-label="Buscar avisos" value={search} onChange={e => setSearch(e.target.value)} /></label><select className={`${field} !w-auto`} aria-label="Filtrar avisos" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="all">Todos</option><option value="pending">Sin revisar</option><option value="issues">Con pendientes</option></select></div>
            <div className="max-h-56 overflow-auto rounded-lg border border-stone-200"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-stone-50 text-stone-600"><tr>{['Aviso', 'Anunciante', 'Fallecido', 'Logo', 'Estado'].map(title => <th key={title} className="px-3 py-2 font-medium">{title}</th>)}</tr></thead><tbody>{visibleRows.map(({ row, index }) => <tr key={index} className={`border-t border-stone-100 ${selected === index ? 'bg-accent-50' : 'hover:bg-stone-50'}`}><td className="px-3 py-2"><button className="font-medium text-accent-800 underline focus-visible:outline-2" disabled={busy} aria-label={`Revisar aviso ${index + 1}`} aria-current={selected === index ? 'true' : undefined} onClick={() => selectRow(index)}>{index + 1}</button></td><td className="px-3 py-2">{row.payer || <span className="text-stone-400">Sin nombre</span>}</td><td className="px-3 py-2">{row.deceased || <span className="text-rose-700">Falta nombre</span>}</td><td className="max-w-32 px-3 py-2"><span className="block break-all">{row.logoFile || '—'}</span><span className={['missing', 'duplicate'].includes(logoStates[index].status) ? 'font-medium text-rose-700' : 'text-stone-500'}>{logoResolutionLabel(logoStates[index].status)}</span></td><td className="px-3 py-2"><span className={`rounded-full px-2 py-1 font-medium ${reviewed.includes(index) ? 'bg-accent-100 text-accent-800' : 'bg-amber-50 text-amber-800'}`}>{reviewed.includes(index) ? 'Revisado' : 'Pendiente'}</span></td></tr>)}</tbody></table>{visibleRows.length === 0 && <p className="p-4 text-center text-sm text-stone-500">No hay avisos que coincidan con el filtro.</p>}</div>
          </div>
        </div>
        <div className="shrink-0 border-t border-stone-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3 text-xs"><span className="font-medium text-stone-700">{reviewed.length} / {rows.length} revisados</span><span className={invalid ? 'text-amber-700' : 'text-stone-500'}>{exportHint}</span></div>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-label="Revisión del lote" aria-valuemin={0} aria-valuemax={rows.length} aria-valuenow={reviewed.length}><div className="h-full bg-accent-500 transition-all" style={{ width: `${reviewed.length / rows.length * 100}%` }} /></div>
          <div className="flex flex-wrap gap-2"><button className={primary} disabled={busy || invalid || reviewed.length !== rows.length} onClick={() => exportBatch('combined')}><Download className="h-4 w-4" />{busy ? 'Procesando…' : rows.length === 1 ? 'Descargar PDF' : 'PDF multipágina'}</button><button className={button} disabled={busy || invalid || reviewed.length !== rows.length} onClick={() => exportBatch('individual')}>PDF individuales (ZIP)</button></div>
          {message && <p role={messageIsError ? 'alert' : 'status'} className={`mt-3 rounded-lg border p-3 text-xs ${messageIsError ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-stone-200 bg-stone-50 text-stone-700'}`}>{message}</p>}
        </div>
      </section>
    </div>
    {cropEditing && currentLogo.status === 'ready' && <LogoCropEditor
      src={currentLogo.dataUrl} initialCrop={rows[selected].logoCrop}
      onCancel={() => setCropEditing(false)}
      onApply={(croppedLogoUrl, logoCrop) => { changeRow(selected, { croppedLogoUrl, logoCrop }); setCropEditing(false); }}
    />}
  </main>;
}

/** Memoized: it stays mounted (hidden) while the legal editor is active, so it must not re-render on every keystroke there. */
export const FuneralWorkspace = React.memo(FuneralWorkspaceView);
