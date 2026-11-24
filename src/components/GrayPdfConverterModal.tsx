import React, { useState } from 'react';
import { AlertTriangle, FileText, Loader2, Upload } from 'lucide-react';
import { ModalShell } from './ModalShell';
import * as ui from './ui';
import { downloadBlob } from '../utils/download';

interface PrintRiskAnalysis {
  hasRisk: boolean;
  warnings: string[];
  recommendedMode: 'preserve' | 'flatten';
}

interface GrayPdfConverterModalProps {
  onClose: () => void;
  showToast: (message: string) => void;
}

/** Converts an external PDF to DeviceGray/K with the server's Ghostscript pipeline. */
export const GrayPdfConverterModal: React.FC<GrayPdfConverterModalProps> = ({ onClose, showToast }) => {
  const [file, setFile] = useState<File | null>(null);
  const [flatten, setFlatten] = useState(true);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [risk, setRisk] = useState<PrintRiskAnalysis | null>(null);

  const analyzeRisk = async (pdf: File) => {
    try {
      setIsAnalyzing(true);
      setRisk(null);
      const response = await fetch('/api/pdf/analyze-print-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf', 'x-filename': encodeURIComponent(pdf.name) },
        body: pdf,
      });
      if (!response.ok) return;
      const analysis = (await response.json()) as PrintRiskAnalysis;
      setRisk(analysis);
      if (analysis.recommendedMode === 'flatten') setFlatten(true);
    } catch (err) {
      console.warn('PDF risk analysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleConvert = async () => {
    if (!file) {
      showToast('Selecciona un PDF para convertir.');
      return;
    }

    try {
      setIsConverting(true);
      setProgress(12);
      setProgressLabel('Preparando archivo...');
      showToast('Convirtiendo PDF externo a grises con Ghostscript...');

      window.setTimeout(() => {
        setProgress((current) => Math.max(current, 35));
        setProgressLabel('Aplicando perfil ICC...');
      }, 300);
      window.setTimeout(() => {
        setProgress((current) => Math.max(current, 68));
        setProgressLabel(flatten ? 'Acoplando transparencias a 1200 dpi...' : 'Preservando vectores y fuentes...');
      }, 1200);

      const response = await fetch('/api/pdf/convert-gray', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'x-filename': encodeURIComponent(file.name),
          'x-gray-conversion-mode': flatten ? 'flatten' : 'preserve',
        },
        body: file,
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

      setProgress(90);
      setProgressLabel('Preparando descarga...');
      const baseName = file.name.replace(/\.pdf$/i, '') || 'documento';
      downloadBlob(await response.blob(), `${baseName}_K.pdf`);
      showToast('PDF convertido a canal K y descargado.');
      onClose();
    } catch (err) {
      console.error('Gray PDF conversion error:', err);
      const message = err instanceof Error ? err.message : 'Reintenta con otro PDF.';
      showToast(`Error convirtiendo PDF: ${message}`);
      setIsConverting(false);
      setProgress(0);
      setProgressLabel('');
    }
  };

  return (
    <ModalShell
      title="Convertir PDF a Grises"
      subtitle="Ghostscript + ISOnewspaper26v4_gr.icc"
      icon={<FileText className="h-5 w-5" />}
      onClose={onClose}
      closeDisabled={isConverting}
      maxWidthClass="max-w-lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isConverting}
            className={ui.btn.secondary}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConvert}
            disabled={!file || isConverting}
            className={ui.btn.primary}
          >
            <Upload className="h-3.5 w-3.5" />
            {isConverting ? 'Convirtiendo...' : 'Convertir y descargar'}
          </button>
        </>
      }
    >
      <div className="space-y-4 px-5 py-5">
        <label className="flex min-h-[150px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center transition-colors hover:border-accent-400 hover:bg-accent-50">
          <Upload className="h-8 w-8 text-accent-700" />
          <div>
            <p className="text-sm font-medium text-stone-900">{file ? file.name : 'Seleccionar PDF'}</p>
            <p className="mt-1 text-xs text-stone-500">El archivo se convertirá a DeviceGray/K en PDF 1.3 para prensa</p>
          </div>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={isConverting}
            onChange={(event) => {
              const selected = event.target.files?.[0] || null;
              setFile(selected);
              setFlatten(true);
              setRisk(null);
              if (selected) void analyzeRisk(selected);
            }}
          />
        </label>

        {isAnalyzing && (
          <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-medium text-stone-900">
            <Loader2 className="h-4 w-4 animate-spin text-stone-700" />
            <span>Analizando transparencias, máscaras y efectos...</span>
          </div>
        )}

        {risk?.hasRisk && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-xs text-amber-950">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 text-amber-700" />
              <span>Advertencia para RIP antiguo</span>
            </div>
            <div className="space-y-1">
              {risk.warnings.slice(0, 4).map((warning) => <p key={warning}>{warning}</p>)}
            </div>
            <p className="mt-2 font-semibold">Se recomienda acoplar transparencias antes de enviar a rotativa.</p>
          </div>
        )}

        {isConverting && (
          <div className="rounded-lg border border-accent-200 bg-accent-50 px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-accent-900">
              <span>{progressLabel || 'Procesando PDF...'}</span>
              <span>{Math.max(1, Math.min(99, progress))}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white ring-1 ring-accent-200">
              <div
                className="h-full rounded-full bg-accent-600 transition-all duration-500 ease-out"
                style={{ width: `${Math.max(6, Math.min(99, progress))}%` }}
              />
            </div>
          </div>
        )}

        <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600">
          Requiere el perfil ICC local ISOnewspaper26v4_gr.icc. En modo RIP antiguo genera PDF/X-1a:2001 sobre PDF 1.3 DeviceGray/K.
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 bg-white px-3 py-3 text-xs text-stone-700 transition-colors hover:bg-stone-50">
          <input
            type="checkbox"
            checked={flatten}
            disabled={isConverting}
            onChange={(event) => setFlatten(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-stone-300 text-accent-700 focus:ring-accent-600 disabled:opacity-50"
          />
          <span>
            <span className="block font-medium text-stone-900">Acoplar transparencias para RIP antiguo</span>
            <span className="mt-0.5 block text-stone-500">Usa PDF 1.3 a 1200 dpi, acopla transparencias y evita PDF 1.7.</span>
          </span>
        </label>
      </div>
    </ModalShell>
  );
};
