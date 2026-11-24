import React, { useEffect, useRef, useState } from 'react';
import { NoticeConfig, OverflowStatus, SizeOption, FontFamily, TextAlign } from '../types';
import { FONT_OPTIONS } from '../data/fonts';
import { NoticeCanvas } from './NoticeCanvas';
import { CompactStepper } from './CompactStepper';
import * as ui from './ui';
import {
  AlertTriangle,
  Sparkles,
  ZoomIn,
  ZoomOut,
  Ruler,
  Download,
  AlignJustify,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Rows3,
  FileText,
  Undo2,
  Redo2,
  Maximize,
} from 'lucide-react';

const PX_PER_CM = 37.795;
const PX_PER_PT = 96 / 72;
/** Zoom 2.2 is shown as "100 %" (comfortable reading size), as before. */
const REFERENCE_ZOOM = 2.2;
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 6;
/** Room around the notice for the cm rulers and breathing space. */
const FIT_PADDING_X = 96;
const FIT_PADDING_Y = 104;

export type EditTarget = 'headerTitle' | 'subheaderTitle' | 'bodyText' | 'logo' | 'table';

interface NoticePreviewProps {
  config: NoticeConfig;
  onConfigChange: (updated: Partial<NoticeConfig>) => void;
  onOverflowStatusChange: (status: OverflowStatus) => void;
  onAutoFitFont: () => void;
  onSelectSize: (size: SizeOption) => void;
  availableSizes: SizeOption[];
  onExportPdf: () => void;
  isExporting: boolean;
  /** `index` is the table's position in the body when target is 'table'. */
  onEditTarget?: (target: EditTarget, index?: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

/** Approximate overflow as % of the printable height and as body-text lines. */
export function describeOverflow(status: OverflowStatus, config: NoticeConfig): string {
  if (status.overflowHeightPx <= 1 && (status.overflowWidthPx ?? 0) > 1) {
    const mm = Math.max(0.1, (status.overflowWidthPx ?? 0) / (PX_PER_CM / 10));
    return `Una tabla es ${mm.toFixed(1)} mm más ancha que el aviso`;
  }
  const lineHeightPx = config.bodyFontSizePt * PX_PER_PT * config.lineHeight;
  const lines = Math.max(1, Math.ceil(status.overflowHeightPx / lineHeightPx));
  const percent = Math.max(1, Math.round(status.overflowPercentage));
  return `Sobra ~${percent} % (≈${lines} ${lines === 1 ? 'línea' : 'líneas'})`;
}

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(z.toFixed(2))));

export const NoticePreview: React.FC<NoticePreviewProps> = ({
  config,
  onConfigChange,
  onOverflowStatusChange,
  onAutoFitFont,
  onSelectSize,
  availableSizes,
  onExportPdf,
  isExporting,
  onEditTarget,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}) => {
  const [zoomMode, setZoomMode] = useState<'fit' | 'manual'>('fit');
  const [manualZoom, setManualZoom] = useState<number>(REFERENCE_ZOOM);
  const [fitZoom, setFitZoom] = useState<number>(REFERENCE_ZOOM);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const [overflowData, setOverflowData] = useState<OverflowStatus>({
    isOverflowing: false,
    overflowHeightPx: 0,
    overflowPercentage: 0,
    recommendedHeightCm: config.size.heightCm,
  });

  const baseWidth = config.size.widthCm * PX_PER_CM;
  const baseHeight = config.size.heightCm * PX_PER_CM;

  // Recompute the "fit" zoom whenever the work area or the notice size changes.
  useEffect(() => {
    const area = workAreaRef.current;
    if (!area) return;
    const compute = () => {
      const scale = Math.min(
        (area.clientWidth - FIT_PADDING_X) / baseWidth,
        (area.clientHeight - FIT_PADDING_Y) / baseHeight,
      );
      if (Number.isFinite(scale) && scale > 0) setFitZoom(clampZoom(scale));
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(area);
    return () => observer.disconnect();
  }, [baseWidth, baseHeight]);

  const zoomScale = zoomMode === 'fit' ? fitZoom : manualZoom;
  const zoomBy = (delta: number) => {
    setManualZoom(clampZoom(zoomScale + delta));
    setZoomMode('manual');
  };

  const pixelWidth = baseWidth * zoomScale;
  const pixelHeight = baseHeight * zoomScale;
  const wordCount = (config.bodyText || '')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\*\*/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onEditTarget) return;
    const target = (event.target as HTMLElement).closest('[data-edit-target]');
    const editTarget = target?.getAttribute('data-edit-target') as EditTarget | null;
    if (!editTarget) return;
    const tableIndex = target?.getAttribute('data-table-index');
    onEditTarget(editTarget, tableIndex === null || tableIndex === undefined ? undefined : Number(tableIndex));
  };

  const handleOverflow = (status: OverflowStatus) => {
    setOverflowData(status);
    onOverflowStatusChange(status);
  };

  const recommendedNextSize = availableSizes.find(
    (s) => s.widthCm === config.size.widthCm && s.heightCm > config.size.heightCm,
  );
  const overflowText = overflowData.isOverflowing ? describeOverflow(overflowData, config) : '';

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
      {/* Title + history + zoom */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-stone-800">Vista previa</h2>
          {(onUndo || onRedo) && (
            <div className="ml-2 flex items-center gap-1">
              <button type="button" className={ui.btn.icon} onClick={onUndo} disabled={!canUndo} title="Deshacer (Ctrl+Z)" aria-label="Deshacer">
                <Undo2 className="h-4 w-4" />
              </button>
              <button type="button" className={ui.btn.icon} onClick={onRedo} disabled={!canRedo} title="Rehacer (Ctrl+Mayús+Z)" aria-label="Rehacer">
                <Redo2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-stone-600 hover:text-stone-900">
          <input
            type="checkbox"
            checked={config.showMarginGuides}
            onChange={(e) => onConfigChange({ showMarginGuides: e.target.checked })}
            className="h-3.5 w-3.5 rounded accent-accent-700"
          />
          Guía {config.marginMm} mm
        </label>
        <div className={ui.segmented.group} role="group" aria-label="Zoom">
          <button type="button" className={ui.segmented.option(false)} onClick={() => zoomBy(-0.3)} title="Alejar" aria-label="Alejar">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="w-12 text-center text-xs font-medium tabular-nums text-stone-700" aria-live="polite">
            {Math.round((zoomScale / REFERENCE_ZOOM) * 100)}%
          </span>
          <button type="button" className={ui.segmented.option(false)} onClick={() => zoomBy(0.3)} title="Acercar" aria-label="Acercar">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={ui.segmented.option(zoomMode === 'fit')}
            aria-pressed={zoomMode === 'fit'}
            onClick={() => setZoomMode('fit')}
            title="Ajustar el aviso al espacio disponible"
          >
            <Maximize className="h-3.5 w-3.5" /> Ajustar
          </button>
          <button
            type="button"
            className={ui.segmented.option(zoomMode === 'manual' && manualZoom === REFERENCE_ZOOM)}
            onClick={() => {
              setManualZoom(REFERENCE_ZOOM);
              setZoomMode('manual');
            }}
          >
            100%
          </button>
        </div>
        </div>
      </div>

      {/* Overflow banner */}
      {overflowData.isOverflowing && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-rose-900" role="alert">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>
              <strong className="font-semibold">El texto no cabe.</strong>{' '}
              {overflowData.overflowHeightPx > 1 ? `${overflowText} del alto de ${config.size.heightCm} cm.` : `${overflowText}: reduce el tamaño de tabla o acorta palabras.`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onAutoFitFont} className={ui.btn.primary}>
              <Sparkles className="h-3.5 w-3.5" />
              Auto-Encajar
            </button>
            {recommendedNextSize && (
              <button type="button" onClick={() => onSelectSize(recommendedNextSize)} className={ui.btn.secondary}>
                <Ruler className="h-3.5 w-3.5" />
                Usar {recommendedNextSize.widthCm}×{recommendedNextSize.heightCm} cm
              </button>
            )}
          </div>
        </div>
      )}

      {/* Typography toolbar: the single place for font, size, leading and alignment */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-white px-4 py-2.5">
        <select
          value={config.fontFamily}
          onChange={(e) => onConfigChange({ fontFamily: e.target.value as FontFamily })}
          className={`${ui.field} !w-auto max-w-[12.5rem] !py-1.5`}
          aria-label="Fuente"
          style={{ fontFamily: config.fontFamily }}
        >
          {FONT_OPTIONS.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>

        <CompactStepper
          label="Letra"
          value={config.bodyFontSizePt}
          onChange={(bodyFontSizePt) => onConfigChange({ bodyFontSizePt })}
          min={4}
          max={16}
          step={0.25}
          unit="pt"
        />

        <CompactStepper
          label="Inter"
          icon={<Rows3 className="h-3.5 w-3.5 text-stone-500" />}
          value={config.lineHeight}
          onChange={(lineHeight) => onConfigChange({ lineHeight })}
          min={1.1}
          max={1.8}
          step={0.02}
        />

        <div className={ui.segmented.group} role="group" aria-label="Alineación del cuerpo">
          {[
            { align: 'justify', icon: AlignJustify, label: 'Justificar' },
            { align: 'left', icon: AlignLeft, label: 'Izquierda' },
            { align: 'center', icon: AlignCenter, label: 'Centro' },
            { align: 'right', icon: AlignRight, label: 'Derecha' },
          ].map((item) => {
            const Icon = item.icon;
            const active = config.textAlign === item.align;
            return (
              <button
                key={item.align}
                type="button"
                onClick={() => onConfigChange({ textAlign: item.align as TextAlign })}
                className={ui.segmented.option(active)}
                aria-pressed={active}
                title={item.label}
                aria-label={item.label}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>

      </div>

      {/* Work area */}
      <div ref={workAreaRef} className="relative min-h-[260px] flex-1 overflow-auto overscroll-contain bg-stone-100 p-4 pb-16 pt-8 sm:p-6 sm:pt-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(#44403c 1px, transparent 1px)', backgroundSize: '16px 16px' }}
        />

        <div className="relative z-10 mx-auto w-max min-w-max">
          <div className="absolute -top-6 left-0 right-0 flex justify-between text-[11px] tabular-nums text-stone-500">
            <span>0 cm</span>
            <span>{config.size.widthCm} cm</span>
          </div>
          <div className="absolute -left-8 bottom-0 top-0 flex flex-col justify-between pr-1 text-right text-[11px] tabular-nums text-stone-500">
            <span>0</span>
            <span>{config.size.heightCm} cm</span>
          </div>

          {/* Notice canvas — the same HTML/CSS component Puppeteer renders to PDF */}
          <div
            onClick={handleCanvasClick}
            title={onEditTarget ? 'Haz clic en un título, el texto, una tabla o el logo para editarlo' : undefined}
            className={`relative box-border overflow-hidden border border-stone-300 bg-white text-black shadow-lg ${
              onEditTarget ? '[&_[data-edit-target]]:cursor-pointer [&_[data-edit-target]:hover]:outline [&_[data-edit-target]:hover]:outline-1 [&_[data-edit-target]:hover]:outline-accent-500/70' : ''
            } ${overflowData.isOverflowing ? 'ring-4 ring-rose-500/70' : ''}`}
            style={{ width: `${pixelWidth}px`, height: `${pixelHeight}px` }}
          >
            <NoticeCanvas
              config={config}
              zoomScale={zoomScale}
              onOverflowStatusChange={handleOverflow}
              showMarginGuides={config.showMarginGuides}
            />
          </div>
        </div>
      </div>

      {/* Footer: status + export */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={ui.chip.neutral}>
            <Ruler className="h-3.5 w-3.5 text-stone-500" />
            {config.size.widthCm} × {config.size.heightCm} cm
          </span>
          <span className={ui.chip.neutral}>
            <FileText className="h-3.5 w-3.5 text-stone-500" />
            {wordCount} palabras
          </span>
          <span className={overflowData.isOverflowing ? ui.chip.error : ui.chip.ok}>
            {overflowData.isOverflowing ? overflowText : 'Cabe en el espacio'}
          </span>
        </div>
        <div className="flex items-center gap-2">
        <button type="button" onClick={onAutoFitFont} className={ui.btn.secondary} title="Ajustar letra e interlineado para que el texto quepa (o aprovechar el espacio sobrante)">
          <Sparkles className="h-3.5 w-3.5 text-accent-700" />
          Auto-Encajar
        </button>
        <button
          type="button"
          onClick={onExportPdf}
          disabled={isExporting || overflowData.isOverflowing}
          className={`${ui.btn.primary} px-4`}
          title={
            overflowData.isOverflowing
              ? 'No se puede exportar: el texto está desbordado.'
              : `Descargar PDF (${config.size.widthCm}×${config.size.heightCm} cm)`
          }
        >
          {overflowData.isOverflowing ? <AlertTriangle className="h-4 w-4" /> : <Download className="h-4 w-4" />}
          {isExporting
            ? 'Generando PDF...'
            : overflowData.isOverflowing
            ? 'PDF bloqueado por desborde'
            : `Descargar PDF (${config.size.widthCm}×${config.size.heightCm} cm)`}
        </button>
        </div>
      </div>
    </div>
  );
};
