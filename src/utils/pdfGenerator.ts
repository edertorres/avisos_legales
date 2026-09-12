import { NoticeConfig } from '../types';

export interface PDFExportOptions {
  config: NoticeConfig;
  widthCm: number;
  heightCm: number;
  filename?: string;
}

/**
 * Generates and downloads a press-quality vector PDF using the Puppeteer server endpoint.
 * Puppeteer opens the running app, injects the config, React renders the canvas,
 * and the server converts the result to DeviceGray/K with Ghostscript.
 */
export async function generateNoticePDF(options: PDFExportOptions): Promise<void> {
  const { config, filename } = options;

  // Try Puppeteer endpoint first (vector, press quality)
  try {
    const response = await fetch('/api/pdf/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    });

    if (response.ok) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const widthCm = config.size.widthCm;
      const heightCm = config.size.heightCm;
      const defaultFilename = `aviso_${widthCm}x${heightCm}cm_${Date.now()}_K.pdf`;
      a.download = filename || defaultFilename;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return;
    }

    let message = 'No se pudo generar el PDF.';
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {
      message = await response.text();
    }
    throw new Error(message);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('El servidor de PDF no está disponible; no se puede garantizar salida DeviceGray/K.');
    }

    throw error;
  }
}

/**
 * Generates and downloads an experimental PDF through the parallel WeasyPrint endpoint.
 * WeasyPrint renders the layout, then the server runs Ghostscript to force and
 * verify DeviceGray/K output.
 */
export async function generateNoticePDFWithWeasyPrint(options: PDFExportOptions): Promise<void> {
  const { config, filename } = options;

  try {
    const response = await fetch('/api/pdf/render-weasyprint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    });

    if (response.ok) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const widthCm = config.size.widthCm;
      const heightCm = config.size.heightCm;
      const defaultFilename = `aviso_${widthCm}x${heightCm}cm_${Date.now()}_K_weasyprint_gs.pdf`;
      a.download = filename || defaultFilename;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return;
    }

    let message = 'No se pudo generar el PDF con WeasyPrint.';
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {
      message = await response.text();
    }
    throw new Error(message);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('No hay conexión con el servidor Express de PDF. Abre la app desde `npm run dev` o configura el proxy de Vite hacia el backend.');
    }

    throw error;
  }
}
