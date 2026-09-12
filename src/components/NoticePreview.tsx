import React, { useState } from 'react';
import { NoticeConfig, OverflowStatus, SizeOption, FontFamily, TextAlign } from '../types';
import { FONT_OPTIONS } from '../data/fonts';
import { NoticeCanvas } from './NoticeCanvas';
import {
  AlertTriangle,
  Sparkles,
  ZoomIn,
  ZoomOut,
  Ruler,
  Download,
  Info,
  Type,
  AlignJustify,
  AlignLeft,
  AlignCenter,
  Minus,
  Plus,
  Rows3,
  FileText,
} from 'lucide-react';

const PX_PER_CM = 37.795;

interface NoticePreviewProps {
  config: NoticeConfig;
  onConfigChange: (updated: Partial<NoticeConfig>) => void;
  onOverflowStatusChange: (status: OverflowStatus) => void;
  onAutoFitFont: () => void;
  onSelectSize: (size: SizeOption) => void;
  availableSizes: SizeOption[];
  onExportPdf: () => void;
  isExporting: boolean;
}

export const NoticePreview: React.FC<NoticePreviewProps> = ({
  config,
  onConfigChange,
  onOverflowStatusChange,
  onAutoFitFont,
  onSelectSize,
  availableSizes,
  onExportPdf,
  isExporting,
}) => {
  const [zoomScale, setZoomScale] = useState<number>(2.2);
  const [overflowData, setOverflowData] = useState<OverflowStatus>({
    isOverflowing: false,
    overflowHeightPx: 0,
    overflowPercentage: 0,
    recommendedHeightCm: config.size.heightCm,
  });

  const pixelWidth = config.size.widthCm * PX_PER_CM * zoomScale;
  const pixelHeight = config.size.heightCm * PX_PER_CM * zoomScale;
  const wordCount = (config.bodyText || '')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\*\*/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  const handleOverflow = (status: OverflowStatus) => {
    setOverflowData(status);
    onOverflowStatusChange(status);
  };

  const commitBodyFontSize = (rawValue: string) => {
    const parsed = parseFloat(rawValue.replace(',', '.'));
    if (Number.isNaN(parsed)) return;
    const clamped = Math.min(16, Math.max(4, parsed));
    onConfigChange({ bodyFontSizePt: Number(clamped.toFixed(2)) });
  };

  const recommendedNextSize = availableSizes.find(
    (s) => s.widthCm === config.size.widthCm && s.heightCm > config.size.heightCm,
  );

  return (
    <div className="bg-slate-100 rounded-xl border border-slate-200 flex flex-col h-full overflow-hidden shadow-inner">
      {/* Top Controls Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm font-black text-slate-900 uppercase tracking-wide">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-emerald-300">
            <Ruler className="w-4 h-4" />
          </span>
          <span>Vista previa</span>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setZoomScale((z) => Math.max(0.8, Number((z - 0.3).toFixed(1))))}
              className="p-1 hover:bg-white text-slate-700 rounded transition-colors"
              title="Alejar vista"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono font-extrabold text-slate-800 px-1 w-12 text-center">
              {Math.round((zoomScale / 2.2) * 100)}%
            </span>
            <button
              onClick={() => setZoomScale((z) => Math.min(4, Number((z + 0.3).toFixed(1))))}
              className="p-1 hover:bg-white text-slate-700 rounded transition-colors"
              title="Acercar vista"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomScale(2.2)}
              className="px-2 py-1 text-xs bg-white text-slate-700 hover:bg-slate-200 rounded font-bold border border-slate-300 ml-1"
            >
              Zoom 100%
            </button>
          </div>
        </div>
      </div>

      {/* Overflow Banner */}
      {overflowData.isOverflowing && (
        <div className="bg-rose-50 border-b border-rose-200 p-3 flex flex-wrap items-center justify-between gap-2 text-rose-900 animate-fadeIn">
          <div className="flex items-center gap-2 text-sm font-black">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              Desborde de texto. El contenido excede el espacio de {config.size.heightCm} cm.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onAutoFitFont}
              className="flex items-center gap-1 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded shadow-sm transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Auto-Ajustar Fuente
            </button>
            {recommendedNextSize && (
              <button
                onClick={() => onSelectSize(recommendedNextSize)}
                className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-rose-100 text-rose-900 font-bold text-xs rounded border border-rose-300 transition-colors"
              >
                <Ruler className="w-3.5 h-3.5 text-rose-600" />
                Usar {recommendedNextSize.widthCm}×{recommendedNextSize.heightCm} cm
              </button>
            )}
          </div>
        </div>
      )}

      {/* Quick Attributes Toolbar */}
      <div className="bg-white text-slate-900 px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2 text-xs shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1.5">
            <Type className="w-3.5 h-3.5 text-emerald-600" /> Atributos Rápidos
          </span>

          <select
            value={config.fontFamily}
            onChange={(e) => onConfigChange({ fontFamily: e.target.value as FontFamily })}
            className="bg-white text-slate-900 border border-slate-300 rounded-md px-2.5 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {FONT_OPTIONS.map((font) => (
              <option key={font.value} value={font.value} className="text-slate-900 bg-white font-sans">
                {font.label}
              </option>
            ))}
          </select>

          {/* Font size +/- */}
          <div className="flex items-center gap-1 bg-slate-100 px-2 py-1.5 rounded-md border border-slate-200">
            <span className="text-xs text-slate-600 font-extrabold uppercase">Letra</span>
            <button
              onClick={() => onConfigChange({ bodyFontSizePt: Math.max(4, Number((config.bodyFontSizePt - 0.25).toFixed(2))) })}
              className="p-1 hover:bg-white rounded text-slate-700 border border-transparent hover:border-slate-200"
              title="Reducir letra"
            >
              <Minus className="w-3 h-3" />
            </button>
            <div className="relative w-20">
              <input
                type="text"
                inputMode="decimal"
                defaultValue={config.bodyFontSizePt.toString()}
                key={`quick-body-font-${config.bodyFontSizePt}`}
                onBlur={(e) => commitBodyFontSize(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                className="w-full rounded border border-slate-300 bg-white py-1 pr-6 pl-2 text-center font-mono text-sm font-extrabold text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 select-none text-xs font-extrabold text-slate-500 pointer-events-none">pt</span>
            </div>
            <button
              onClick={() => onConfigChange({ bodyFontSizePt: Math.min(16, Number((config.bodyFontSizePt + 0.25).toFixed(2))) })}
              className="p-1 hover:bg-white rounded text-slate-700 border border-transparent hover:border-slate-200"
              title="Aumentar letra"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Line height +/- */}
          <div className="flex items-center gap-1 bg-emerald-50 px-2 py-1.5 rounded-md border border-emerald-200 shadow-sm">
            <Rows3 className="w-3.5 h-3.5 text-emerald-700" />
            <span className="text-xs text-emerald-800 font-extrabold uppercase">Inter</span>
            <button
              onClick={() => onConfigChange({ lineHeight: Math.max(1.1, Number((config.lineHeight - 0.02).toFixed(2))) })}
              className="p-1 hover:bg-white rounded text-slate-700 border border-transparent hover:border-emerald-200"
              title="Reducir interlineado"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="font-mono font-extrabold text-emerald-950 bg-white rounded px-1.5 min-w-12 text-center border border-emerald-200 text-sm">
              {config.lineHeight.toFixed(2)}
            </span>
            <button
              onClick={() => onConfigChange({ lineHeight: Math.min(1.8, Number((config.lineHeight + 0.02).toFixed(2))) })}
              className="p-1 hover:bg-white rounded text-slate-700 border border-transparent hover:border-emerald-200"
              title="Aumentar interlineado"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Alignment buttons */}
          <div className="flex items-center gap-0.5 bg-slate-100 p-1.5 rounded-md border border-slate-200">
            {[
              { align: 'justify', icon: AlignJustify, label: 'Justificar' },
              { align: 'left', icon: AlignLeft, label: 'Izquierda' },
              { align: 'center', icon: AlignCenter, label: 'Centro' },
            ].map((btn) => {
              const Icon = btn.icon;
              const active = config.textAlign === btn.align;
              return (
                <button
                  key={btn.align}
                  onClick={() => onConfigChange({ textAlign: btn.align as TextAlign })}
                  className={`p-1.5 rounded transition-colors ${
                    active ? 'bg-slate-950 text-white font-bold shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-950'
                  }`}
                  title={btn.label}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onAutoFitFont}
            className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-md shadow-sm transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Auto-Encajar</span>
          </button>
          <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-slate-600 hover:text-slate-950 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
            <input
              type="checkbox"
              checked={config.showMarginGuides}
              onChange={(e) => onConfigChange({ showMarginGuides: e.target.checked })}
              className="rounded accent-emerald-500"
            />
            <span>Guía 3mm</span>
          </label>
        </div>
      </div>

      {/* Main Preview Work Area */}
      <div className="flex-1 overflow-auto overscroll-contain p-4 sm:p-6 pt-8 pb-16 relative bg-slate-100">
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(#000 1px, transparent 1px)`,
            backgroundSize: `16px 16px`,
          }}
        />

        <div className="relative z-10 w-max min-w-max transition-all duration-200 mx-auto">
          {/* Dimension labels */}
          <div className="absolute -top-6 left-0 right-0 flex justify-between text-xs font-mono text-slate-500 font-bold">
            <span>0 cm</span>
            <span>{config.size.widthCm} cm</span>
          </div>
          <div className="absolute -left-7 top-0 bottom-0 flex flex-col justify-between text-xs font-mono text-slate-500 font-bold text-right pr-1">
            <span>0</span>
            <span>{config.size.heightCm}cm</span>
          </div>

          {/* Notice Canvas — pure HTML/CSS, no Typst */}
          <div
            className={`bg-white text-black relative shadow-xl transition-shadow overflow-hidden box-border border border-slate-300 ${
              overflowData.isOverflowing ? 'ring-4 ring-rose-500/80' : ''
            }`}
            style={{ width: `${pixelWidth}px`, height: `${pixelHeight}px` }}
          >
            <NoticeCanvas
              config={config}
              zoomScale={zoomScale}
              onOverflowStatusChange={handleOverflow}
              showMarginGuides={config.showMarginGuides}
            />
          </div>

          {/* Physical size label */}
          <div className="mt-3 text-center">
            <div className="inline-flex flex-wrap items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono text-slate-700 shadow-sm">
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-950 px-3 py-1.5 font-extrabold text-white border border-slate-800">
                <Ruler className="w-3.5 h-3.5 text-emerald-300" />
                {config.size.widthCm} × {config.size.heightCm} cm
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-3 py-1.5 font-extrabold text-amber-900 border border-amber-200">
                <FileText className="w-3.5 h-3.5 text-amber-600" />
                {wordCount} palabras
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-3 py-1.5 font-extrabold text-emerald-900 border border-emerald-200">
                <Rows3 className="w-3.5 h-3.5 text-emerald-600" />
                Inter {config.lineHeight.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Action Bar */}
      <div className="bg-white border-t border-slate-200 p-3 flex items-center justify-between gap-3">
        <div className="text-sm text-slate-600 font-bold flex items-center gap-1.5">
          <Info className="w-4 h-4 text-slate-500" />
          <span>{overflowData.isOverflowing ? 'Ajusta el aviso antes de exportar.' : 'Aviso listo para exportar.'}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onExportPdf}
            disabled={isExporting || overflowData.isOverflowing}
            className={`flex items-center gap-1.5 px-4 py-2.5 font-bold text-sm rounded-lg shadow transition-colors ${
              overflowData.isOverflowing
                ? 'bg-rose-100 text-rose-800 border border-rose-300 cursor-not-allowed opacity-90'
                : 'bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-50'
            }`}
            title={
              overflowData.isOverflowing
                ? '⚠️ No se puede exportar el PDF porque el texto está desbordado.'
                : `Descargar PDF (${config.size.widthCm}x${config.size.heightCm} cm)`
            }
          >
            {overflowData.isOverflowing ? (
              <>
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>PDF Deshabilitado (Desbordado)</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Descargar PDF ({config.size.widthCm}x{config.size.heightCm} cm)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
