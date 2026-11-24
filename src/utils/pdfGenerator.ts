import { NoticeConfig } from '../types';
import { downloadBlob } from './download';

export interface PDFExportOptions {
  config: NoticeConfig;
  widthCm: number;
  heightCm: number;
  filename?: string;
}

/** Reads the server's error body once (JSON `{ error }` or plain text). */
export async function readServerError(response: Response, fallback: string): Promise<string> {
  const raw = await response.text().catch(() => '');
  try {
    return JSON.parse(raw).error || fallback;
  } catch {
    return raw.trim() || fallback;
  }
}

async function requestPdf(
  endpoint: string,
  { config, filename }: PDFExportOptions,
  defaultSuffix: string,
  fallbackError: string,
  offlineError: string,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    });
  } catch {
    throw new Error(offlineError);
  }

  if (!response.ok) throw new Error(await readServerError(response, fallbackError));

  const defaultFilename = `aviso_${config.size.widthCm}x${config.size.heightCm}cm_${Date.now()}${defaultSuffix}`;
  downloadBlob(await response.blob(), filename || defaultFilename);
}

/**
 * Generates and downloads a press-quality vector PDF using the Puppeteer server endpoint.
 * Puppeteer opens the running app, injects the config, React renders the canvas,
 * and the server converts the result to DeviceGray/K with Ghostscript.
 */
export function generateNoticePDF(options: PDFExportOptions): Promise<void> {
  return requestPdf(
    '/api/pdf/render',
    options,
    '_K.pdf',
    'No se pudo generar el PDF.',
    'El servidor de PDF no está disponible; no se puede garantizar salida DeviceGray/K.',
  );
}

/**
 * Generates and downloads an experimental PDF through the parallel WeasyPrint endpoint.
 * WeasyPrint renders the layout, then the server runs Ghostscript to force and
 * verify DeviceGray/K output.
 */
export function generateNoticePDFWithWeasyPrint(options: PDFExportOptions): Promise<void> {
  return requestPdf(
    '/api/pdf/render-weasyprint',
    options,
    '_K_weasyprint_gs.pdf',
    'No se pudo generar el PDF con WeasyPrint.',
    'No hay conexión con el servidor Express de PDF. Abre la app desde `npm run dev` o configura el proxy de Vite hacia el backend.',
  );
}
