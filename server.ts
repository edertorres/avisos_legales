import { SharedLibraryStore } from './sharedLibraryStore';
import { isSavedNotice, isGeneratedLogEntry } from './src/types/sharedLibrary';
import { parseFormattedText, FormattedText } from './src/utils/textFormatting';
import express from 'express';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { NoticeConfig } from './src/types';
import puppeteer from 'puppeteer';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_GRAY_ICC_PROFILE = 'ISOnewspaper26v4_gr.icc';
const port = Number(process.env.PORT || 3000);
const PX_PER_CM = 37.795;

interface InkCoverage {
  c: number;
  m: number;
  y: number;
  k: number;
}

type GrayConversionMode = 'preserve' | 'flatten';

interface PrintRiskAnalysis {
  hasRisk: boolean;
  warnings: string[];
  recommendedMode: GrayConversionMode;
}

interface RenderPdfRequest {
  config: NoticeConfig;
}

class PdfOverflowError extends Error {
  statusCode = 422;

  constructor(message: string) {
    super(message);
    this.name = 'PdfOverflowError';
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function resolveGrayIccProfile(): Promise<string | null> {
  const candidates = [
    process.env.GRAY_ICC_PROFILE,
    path.join(process.cwd(), DEFAULT_GRAY_ICC_PROFILE),
    path.join(__dirname, DEFAULT_GRAY_ICC_PROFILE),
    path.join(__dirname, '..', DEFAULT_GRAY_ICC_PROFILE),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }

  return null;
}

async function resolveRequiredGrayIccProfile(): Promise<string> {
  const grayProfile = await resolveGrayIccProfile();
  if (!grayProfile) {
    throw new Error(`No se encontró el perfil ICC gris ${DEFAULT_GRAY_ICC_PROFILE} en el root del proyecto ni en GRAY_ICC_PROFILE.`);
  }

  return grayProfile;
}

function postScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

async function writePdfx1aDefinition(tempDir: string, grayProfile: string): Promise<string> {
  const definitionPath = path.join(tempDir, 'PDFX-1a-gray.ps');
  const escapedProfilePath = postScriptString(grayProfile);
  const definition = `%!
[/GTS_PDFXVersion (PDF/X-1a:2001)
 /Title (Aviso en escala de grises)
 /Trapped /False
/DOCINFO pdfmark

[/_objdef {icc_PDFX} /type /stream /OBJ pdfmark
[{icc_PDFX} <</N 1>> /PUT pdfmark
[{icc_PDFX} (${escapedProfilePath}) (r) file /PUT pdfmark

[/_objdef {OutputIntent_PDFX} /type /dict /OBJ pdfmark
[{OutputIntent_PDFX} <<
 /Type /OutputIntent
 /S /GTS_PDFX
 /OutputCondition (Prensa en escala de grises)
 /Info (DeviceGray con perfil ICC para prensa)
 /OutputConditionIdentifier (ISOnewspaper26v4_gr)
 /RegistryName (http://www.color.org)
 /DestOutputProfile {icc_PDFX}
>> /PUT pdfmark
[{Catalog} <</OutputIntents [ {OutputIntent_PDFX} ]>> /PUT pdfmark
`;

  await fs.writeFile(definitionPath, definition, 'utf8');
  return definitionPath;
}

function parseInkCoverage(stdout: string): InkCoverage[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[0-9.]+\s+[0-9.]+\s+[0-9.]+\s+[0-9.]+/.test(line))
    .map((line) => {
      const [c, m, y, k] = line.split(/\s+/).map(Number);
      return { c, m, y, k };
    })
    .filter(({ c, m, y, k }) => [c, m, y, k].every(Number.isFinite));
}

function countPdfToken(pdfText: string, pattern: RegExp): number {
  return pdfText.match(pattern)?.length || 0;
}

function analyzePdfPrintRisk(pdfBytes: Buffer): PrintRiskAnalysis {
  const pdfText = pdfBytes.toString('latin1');
  const warnings: string[] = [];
  const transparencyHits =
    countPdfToken(pdfText, /\/Transparency\b/g) +
    countPdfToken(pdfText, /\/SMask\b/g) +
    countPdfToken(pdfText, /\/BM\s*\/(?!Normal\b)[A-Za-z]+/g) +
    countPdfToken(pdfText, /\/(?:CA|ca)\s+(?:0?\.\d+|0\b)/g);

  if (transparencyHits > 0) {
    warnings.push(`Se detectaron ${transparencyHits} señales de transparencias, máscaras u opacidades.`);
  }

  const transparencyGroupHits = countPdfToken(pdfText, /\/Group\s*<<[^>]*\/S\s*\/Transparency/gs);
  if (transparencyGroupHits > 0) {
    warnings.push(`Se detectaron ${transparencyGroupHits} grupos de transparencia.`);
  }

  const blendModeHits = countPdfToken(pdfText, /\/BM\b/g);
  if (blendModeHits > 0) {
    warnings.push(`Se detectaron ${blendModeHits} referencias a modos de fusión.`);
  }

  const patternOrShadingHits =
    countPdfToken(pdfText, /\/Pattern\b/g) +
    countPdfToken(pdfText, /\/Shading\b/g) +
    countPdfToken(pdfText, /\/ShadingType\b/g);

  if (patternOrShadingHits > 0) {
    warnings.push(`Se detectaron ${patternOrShadingHits} patrones o degradados que conviene revisar en RIP antiguo.`);
  }

  const formXObjectHits = countPdfToken(pdfText, /\/Subtype\s*\/Form\b/g);
  if (formXObjectHits > 0) {
    warnings.push(`Se detectaron ${formXObjectHits} formularios XObject; pueden contener capas, efectos o transparencias.`);
  }

  return {
    hasRisk: warnings.length > 0,
    warnings,
    recommendedMode: warnings.length > 0 ? 'flatten' : 'preserve',
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ');
}

function fileUrl(filePath: string): string {
  return `file://${filePath.split(path.sep).map(encodeURIComponent).join('/')}`;
}

function resolveChromeExecutablePath(): string | undefined {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/opt/google/chrome/chrome',
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => existsSync(candidate));
}

function parseDataUrl(dataUrl: string): { mimeType: string; isBase64: boolean; data: Buffer } | null {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const isBase64 = !!match[2];
  const payload = match[3];
  const data = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8');

  return { mimeType, isBase64, data };
}

async function grayscaleRasterDataUrl(
  dataUrl: string,
  tempDir: string,
  name: string,
  options: { preserveSvg?: boolean } = {},
): Promise<string> {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return dataUrl;

  if (parsed.mimeType === 'image/svg+xml') {
    if (options.preserveSvg) return dataUrl;

    const svgPath = path.join(tempDir, `${name}-input.svg`);
    const rasterPath = path.join(tempDir, `${name}-svg.png`);
    await fs.writeFile(svgPath, parsed.data);

    try {
      await execFileAsync('rsvg-convert', ['-f', 'png', '-o', rasterPath, svgPath], {
        timeout: 20000,
        maxBuffer: 1024 * 1024 * 10,
      });
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        throw new Error('Para convertir SVG a escala de grises en WeasyPrint falta `rsvg-convert`.');
      }
      throw error;
    }

    const rasterBytes = await fs.readFile(rasterPath);
    return grayscaleRasterDataUrl(`data:image/png;base64,${rasterBytes.toString('base64')}`, tempDir, `${name}-svg`);
  }

  const supportedRasterTypes = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/bmp',
    'image/tiff',
  ]);
  if (!supportedRasterTypes.has(parsed.mimeType)) return dataUrl;

  const inputPath = path.join(tempDir, `${name}-input`);
  const outputPath = path.join(tempDir, `${name}-gray.png`);
  await fs.writeFile(inputPath, parsed.data);

  const script = [
    'from PIL import Image, ImageOps',
    'import sys',
    'src, dst = sys.argv[1], sys.argv[2]',
    'with Image.open(src) as im:',
    '    alpha = im.getchannel("A") if "A" in im.getbands() else None',
    '    gray = ImageOps.grayscale(im)',
    '    out = Image.merge("RGBA", (gray, gray, gray, alpha)) if alpha else Image.merge("RGB", (gray, gray, gray))',
    '    out.save(dst, "PNG")',
  ].join('\n');

  await execFileAsync('python3', ['-c', script, inputPath, outputPath], {
    timeout: 20000,
    maxBuffer: 1024 * 1024 * 10,
  });

  const grayBytes = await fs.readFile(outputPath);
  return `data:image/png;base64,${grayBytes.toString('base64')}`;
}

async function prepareWeasyPrintImages(config: NoticeConfig, tempDir: string): Promise<NoticeConfig> {
  const nextConfig: NoticeConfig = {
    ...config,
    bodyImages: [...(config.bodyImages || [])],
  };

  if (config.logoUrl && config.grayscaleLogo) {
    nextConfig.logoUrl = await grayscaleRasterDataUrl(config.logoUrl, tempDir, 'logo');
  }

  nextConfig.bodyImages = await Promise.all(
    nextConfig.bodyImages.map(async (image, index) => ({
      ...image,
      dataUrl: await grayscaleRasterDataUrl(image.dataUrl, tempDir, `body-${index}`, { preserveSvg: true }),
    })),
  );

  return nextConfig;
}

function preserveLegalNoBreaksHtml(value: string): string {
  return escapeHtml(value)
    .replace(/\b(Cédula)\s+de\s+(Ciudadanía)\s+(No\.)/gi, '$1&nbsp;de&nbsp;$2&nbsp;$3')
    .replace(/\b(identificad[oa])\s+con\s+(Cédula(?:\s+de\s+Ciudadanía)?(?:\s+No\.?)?)/gi,
      (_match, qualifier: string, docLabel: string) => `${qualifier}&nbsp;con&nbsp;${docLabel.replace(/\s+/g, '&nbsp;')}`)
    .replace(/\b(con)\s+(Cédula(?:\s+de\s+Ciudadanía)?(?:\s+No\.?)?)/gi,
      (_match, connector: string, docLabel: string) => `${connector}&nbsp;${docLabel.replace(/\s+/g, '&nbsp;')}`)
    .replace(/\b(NIT)\s+([\d. -]{5,})/gi,
      (_match, label: string, documentValue: string) => `${label}&nbsp;${documentValue.trim()}`);
}

function renderTextWithLineBreaksHtml(value: string): string {
  return value.split('\n').map(preserveLegalNoBreaksHtml).join('<br>');
}

function splitTableRow(line: string, forceSeparator?: '|' | '\t' | ','): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  if (!forceSeparator) {
    const pipeCount = (trimmed.match(/\|/g) || []).length;
    const tabCount = (trimmed.match(/\t/g) || []).length;
    const commaCount = (trimmed.match(/,/g) || []).length;

    if (pipeCount > 0 && pipeCount >= tabCount && pipeCount >= commaCount) {
      forceSeparator = '|';
    } else if (tabCount > 0 && tabCount >= commaCount) {
      forceSeparator = '\t';
    } else if (commaCount > 0) {
      forceSeparator = ',';
    } else {
      return [trimmed];
    }
  }

  return trimmed.split(forceSeparator).map((cell) => cell.trim());
}

function getTableFontSizePt(config: NoticeConfig): number {
  return config.tableFontSizePt ?? Number(Math.max(4, config.bodyFontSizePt * 0.85).toFixed(2));
}

function renderTableHtml(blockContent: string, fontFamily: string, tableFontSizePt: number): string {
  const normalized = blockContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((line) => line.trim() !== '');
  if (lines.length < 1) return '';

  const firstLine = lines[0].trim();
  let sep: '|' | '\t' | ',' | undefined;
  if (firstLine.includes('|')) sep = '|';
  else if (firstLine.includes('\t')) sep = '\t';
  else if (firstLine.includes(',')) sep = ',';

  const headers = splitTableRow(lines[0], sep);
  if (headers.length === 0) return '';

  const rows = lines.slice(1).map((line) => splitTableRow(line, sep)).filter((row) => row.length > 0);
  const escapedFont = escapeCssString(fontFamily);

  return `
    <div class="notice-table-wrap">
      <table class="notice-table" style="font-family: ${escapedFont}; font-size: ${tableFontSizePt}pt;">
        <thead>
          <tr>${headers.map((header, index) => `<th class="${index === 0 ? 'text-left' : ''}">${escapeHtml(header)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>${Array.from({ length: headers.length }, (_unused, index) => `<td class="${index === 0 ? 'text-left' : ''}">${escapeHtml(row[index] || '')}</td>`).join('')}</tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function getMaxBodyImageWidthMm(config: NoticeConfig): number {
  return Math.max(4, (config.size.widthCm * 10) - (config.marginMm * 2));
}

function getBodyImageWidthMm(image: NoticeConfig['bodyImages'][number], maxWidthMm: number): number {
  const preferredWidthMm = image.widthMm && image.widthMm > 0 ? image.widthMm : 25;
  return Math.min(Math.max(4, maxWidthMm), Math.max(4, preferredWidthMm));
}

function renderBodyImageHtml(image: NoticeConfig['bodyImages'][number], maxWidthMm: number): string {
  const align = image.align || 'center';
  const widthMm = getBodyImageWidthMm(image, maxWidthMm);

  return `
    <div class="notice-body-image notice-body-image-${align}">
      <img src="${escapeHtml(image.dataUrl)}" alt="${escapeHtml(image.name)}" style="width: ${widthMm}mm;">
    </div>
  `;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderKeywordBoldHtml(value: string, boldKeywords: string[]): string {
  const uniqueKeywords = [...new Set(boldKeywords.map((kw) => kw.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  if (uniqueKeywords.length === 0) return renderTextWithLineBreaksHtml(value);

  const ranges: Array<{ start: number; end: number }> = [];

  uniqueKeywords.forEach((keyword) => {
    try {
      const escaped = escapeRegExp(keyword).replace(/[ \t]+/g, '[ \\t]+');
      const regex = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escaped})(?=$|[^\\p{L}\\p{N}_])`, 'giu');
      for (const match of value.matchAll(regex)) {
        const prefixLength = match[1]?.length || 0;
        const start = (match.index || 0) + prefixLength;
        const end = start + match[2].length;
        const overlaps = ranges.some((range) => start < range.end && end > range.start);
        if (!overlaps) ranges.push({ start, end });
      }
    } catch {
      // Ignore invalid user-provided highlight patterns.
    }
  });

  if (ranges.length === 0) return renderTextWithLineBreaksHtml(value);

  ranges.sort((a, b) => a.start - b.start);
  let html = '';
  let cursor = 0;

  ranges.forEach((range) => {
    if (range.start > cursor) html += renderTextWithLineBreaksHtml(value.slice(cursor, range.start));
    html += `<strong>${renderTextWithLineBreaksHtml(value.slice(range.start, range.end))}</strong>`;
    cursor = range.end;
  });

  if (cursor < value.length) html += renderTextWithLineBreaksHtml(value.slice(cursor));
  return html;
}

function renderInlineHtml(value: string, boldKeywords: string[]): string {
  const markdownBoldRe = /\*\*([\s\S]*?)\*\*/g;
  let html = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = markdownBoldRe.exec(value)) !== null) {
    if (match.index > lastIndex) {
      html += renderKeywordBoldHtml(value.slice(lastIndex, match.index), boldKeywords);
    }
    html += `<strong>${renderTextWithLineBreaksHtml(match[1])}</strong>`;
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    html += renderKeywordBoldHtml(value.slice(lastIndex), boldKeywords);
  }

  return html;
}

function renderBodyHtml(
  value: string,
  boldKeywords: string[],
  fontFamily: string,
  tableFontSizePt: number,
  bodyImages: NoticeConfig['bodyImages'] = [],
  usedBodyImageIds: Set<string> = new Set(),
  maxBodyImageWidthMm: number = 25,
): string {
  const blockRe = /##table[ \t]*\r?\n([\s\S]*?)##\/table|##image:([A-Za-z0-9_-]+)|##imagen:(\d+)/g;
  let html = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const renderTextChunk = (chunk: string) => {
    const renderNodes = (nodes: FormattedText[]): string => nodes.map((node) => {
      if (node.type === 'text') return renderInlineHtml(node.value, boldKeywords);
      const content = renderNodes(node.children);
      if (node.type === 'bold') return `<strong>${content}</strong>`;
      if (node.type === 'underline') return `<u>${content}</u>`;
      return `<span class="align-block align-${node.align}">${content}</span>`;
    }).join('');
    return renderNodes(parseFormattedText(chunk));
  };

  while ((match = blockRe.exec(value)) !== null) {
    if (match.index > lastIndex) html += renderTextChunk(value.slice(lastIndex, match.index));

    if (match[1] !== undefined) {
      html += renderTableHtml(match[1], fontFamily, tableFontSizePt);
    } else {
      const imageSlot = match[3] ? parseInt(match[3], 10) : null;
      const image = imageSlot
        ? bodyImages.find((item, index) => (item.slot || index + 1) === imageSlot)
        : bodyImages.find((item) => item.id === match?.[2]);
      if (image) {
        usedBodyImageIds.add(image.id);
        html += renderBodyImageHtml(image, maxBodyImageWidthMm);
      }
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) html += renderTextChunk(value.slice(lastIndex));
  return html;
}

function getBoldFontList(fontFamily: string): string {
  if (fontFamily.includes('Barlow Semi Condensed')) return '"Barlow Semi Condensed", "Barlow Condensed", "Roboto Condensed", "Roboto", "Arimo", sans-serif';
  if (fontFamily.includes('Barlow Condensed')) return '"Barlow Condensed", "Roboto Condensed", "Roboto", "Arimo", sans-serif';
  if (fontFamily.includes('Roboto Condensed') || fontFamily.includes('Narrow')) return '"Roboto Condensed", "Roboto", "Arimo", "Noto Sans", sans-serif';
  if (fontFamily.includes('Tinos') || fontFamily.includes('Times')) return '"Tinos", "Liberation Serif", "Noto Serif", serif';
  if (fontFamily.includes('Lora') || fontFamily.includes('Georgia')) return '"Noto Serif", "Liberation Serif", "Tinos", serif';
  if (fontFamily.includes('Courier')) return '"Liberation Mono", "Courier Prime", "Noto Sans Mono", monospace';
  return '"Roboto", "Arimo", "Noto Sans", "PT Sans", sans-serif';
}

function buildWeasyNoticeHtml(config: NoticeConfig, grayProfilePath: string | null): string {
  const widthCm = config.size.widthCm;
  const heightCm = config.size.heightCm;
  const marginMm = config.marginMm;
  const logoWidthMm = config.logoWidthMm || 12;
  const logoPosition = config.logoPosition || 'left';
  const logoVerticalAlign = config.logoVerticalAlign || 'body';
  const hasSideLogo = !!config.logoUrl && (logoPosition === 'left' || logoPosition === 'right') && logoVerticalAlign !== 'titles-top';
  const hasTopLogo = !!config.logoUrl && logoPosition === 'top-center';
  const hasTitlesLogo = !!config.logoUrl && (logoPosition === 'left' || logoPosition === 'right') && logoVerticalAlign === 'titles-top';
  const boldFontFamily = getBoldFontList(config.fontFamily);
  const trackingMm = config.letterSpacingMm || 0;
  const borderWidthPt = Math.max(0.2, config.borderWidthPx || 0.5) * 0.75;
  const outputIntentCss = grayProfilePath
    ? `@color-profile --newspaper-gray {
        src: url("${fileUrl(grayProfilePath)}");
        components: black;
        rendering-intent: relative-colorimetric;
      }`
    : '';
  const blackColor = grayProfilePath ? 'color(--newspaper-gray 0)' : 'black';
  const midGrayColor = grayProfilePath ? 'color(--newspaper-gray 0.53)' : '#777';
  const tableFontSizePt = getTableFontSizePt(config);
  const usedBodyImageIds = new Set<string>();
  const maxBodyImageWidthMm = getMaxBodyImageWidthMm(config);
  const bodyHtml = renderBodyHtml(
    config.bodyText || '',
    config.boldKeywords || [],
    config.fontFamily,
    tableFontSizePt,
    config.bodyImages || [],
    usedBodyImageIds,
    maxBodyImageWidthMm,
  );
  const trailingBodyImages = (config.bodyImages || []).filter((image) => !usedBodyImageIds.has(image.id));

  const renderTitlesHtml = () => `
    ${config.headerTitle ? `<div class="header-title">${renderTextWithLineBreaksHtml(config.headerTitle)}</div>` : ''}
    ${config.subheaderTitle ? `<div class="subheader-title">${renderTextWithLineBreaksHtml(config.subheaderTitle)}</div>` : ''}
  `;

  const logoHtml = config.logoUrl
    ? `<img class="notice-logo${config.grayscaleLogo ? ' grayscale-logo' : ''}" src="${escapeHtml(config.logoUrl)}" alt="Logo">`
    : '';

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Aviso WeasyPrint</title>
  <style>
    ${outputIntentCss}
    @page {
      size: ${widthCm}cm ${heightCm}cm;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      color: black;
      color: ${blackColor};
      border-color: black;
      border-color: ${blackColor};
    }
    html, body {
      margin: 0;
      padding: 0;
      width: ${widthCm}cm;
      height: ${heightCm}cm;
      background: white;
      color: black;
      color: ${blackColor};
      print-color-adjust: exact;
    }
    body {
      font-family: ${config.fontFamily};
      font-size: ${config.bodyFontSizePt}pt;
      line-height: ${config.lineHeight};
      letter-spacing: ${trackingMm}mm;
    }
    .notice-canvas {
      width: ${widthCm}cm;
      height: ${heightCm}cm;
      overflow: hidden;
      border: ${borderWidthPt}pt solid black;
      border-color: ${blackColor};
      padding: ${marginMm}mm;
      background: white;
      color: black;
      color: ${blackColor};
      print-color-adjust: exact;
    }
    .header-title,
    .subheader-title {
      font-family: ${boldFontFamily};
      font-weight: 700;
      text-align: center;
      line-height: 1.2;
      overflow-wrap: break-word;
      margin: 0 0 1.5pt;
    }
    .header-title { font-size: ${config.headerFontSizePt}pt; }
    .subheader-title { font-size: ${config.subheaderFontSizePt}pt; }
    .titles-logo-row {
      display: flex;
      align-items: center;
      gap: 2.5mm;
      margin-bottom: 1.5pt;
      flex-direction: ${logoPosition === 'right' ? 'row-reverse' : 'row'};
    }
    .titles-logo-row .titles {
      flex: 1;
      text-align: center;
    }
    .notice-logo {
      width: ${logoWidthMm}mm;
      height: auto;
      object-fit: contain;
    }
    .top-logo-wrap {
      text-align: center;
      margin-bottom: 1.5pt;
    }
    .side-logo {
      float: ${logoPosition === 'right' ? 'right' : 'left'};
      margin: ${logoPosition === 'right' ? '0 0 1mm 2.5mm' : '0 2.5mm 1mm 0'};
    }
    .grayscale-logo {
      filter: grayscale(100%);
    }
    .body {
      position: relative;
      text-align: ${config.textAlign};
      overflow-wrap: break-word;
      hyphens: none;
    }
    strong {
      font-family: ${boldFontFamily};
      font-weight: 700;
    }
    .align-block {
      display: block;
    }
    .align-left { text-align: left; }
    .align-center { text-align: center; }
    .align-right { text-align: right; }
    .align-justify { text-align: justify; }
    .notice-table-wrap {
      text-align: center;
      margin: 1pt 0;
    }
    .notice-table {
      display: inline-table;
      width: auto;
      max-width: 100%;
      border-collapse: collapse;
      line-height: 1.15;
      margin: 0;
      table-layout: auto;
    }
    .notice-table th {
      border: 0.03px solid black;
      border-color: ${blackColor};
      padding: 1px 2px;
      text-align: center;
      font-weight: 700;
      white-space: nowrap;
    }
    .notice-table td {
      padding: 1px 2px;
      text-align: center;
      border: 0.03px solid black;
      border-color: ${blackColor};
      white-space: nowrap;
    }
    .notice-table .text-left { text-align: left; }
    .body-images {
      margin-top: 2pt;
    }
    .body-images img {
      display: block;
      max-width: 100%;
      height: auto;
      margin: 2pt 0;
      filter: grayscale(100%);
    }
    .notice-body-image {
      margin: 2pt 0;
      line-height: 0;
    }
    .notice-body-image-left { text-align: left; }
    .notice-body-image-center { text-align: center; }
    .notice-body-image-right { text-align: right; }
    .notice-body-image img {
      display: inline-block;
      max-width: 100%;
      height: auto;
      object-fit: contain;
      filter: grayscale(100%);
    }
  </style>
</head>
<body>
  <div class="notice-canvas">
    ${hasTopLogo ? `<div class="top-logo-wrap">${logoHtml}</div>` : ''}
    ${hasTitlesLogo ? `<div class="titles-logo-row">${logoHtml}<div class="titles">${renderTitlesHtml()}</div></div>` : renderTitlesHtml()}
    <div class="body">
      ${hasSideLogo ? logoHtml.replace('notice-logo', 'notice-logo side-logo') : ''}
      ${bodyHtml}
      ${trailingBodyImages.length > 0 ? `<div class="body-images">${trailingBodyImages.map((image) => renderBodyImageHtml(image, maxBodyImageWidthMm)).join('')}</div>` : ''}
    </div>
  </div>
</body>
</html>`;
}

async function renderPdfViaWeasyPrint(config: NoticeConfig, tempDir: string): Promise<Buffer> {
  const htmlPath = path.join(tempDir, 'input.html');
  const outputPath = path.join(tempDir, 'output-weasy.pdf');
  const grayOutputPath = path.join(tempDir, 'output-weasy-gray.pdf');
  const grayProfile = await resolveRequiredGrayIccProfile();
  const preparedConfig = await prepareWeasyPrintImages(config, tempDir);
  const html = buildWeasyNoticeHtml(preparedConfig, grayProfile);

  await fs.writeFile(htmlPath, html, 'utf8');

  const advancedArgs = [
    '--pdf-variant',
    'pdf/x-1a',
    '--output-intent=--newspaper-gray',
    htmlPath,
    outputPath,
  ];
  const runWeasyPrint = async (args: string[]) => {
    try {
      await execFileAsync('weasyprint', args, {
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 10,
      });
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;

      try {
        await execFileAsync('python3', ['-m', 'weasyprint', ...args], {
          timeout: 30000,
          maxBuffer: 1024 * 1024 * 10,
        });
      } catch (pythonError: any) {
        if (pythonError?.code === 'ENOENT' || /No module named weasyprint/i.test(String(pythonError?.stderr || ''))) {
          throw new Error('WeasyPrint no está instalado en este servidor. Instala el binario `weasyprint`, el módulo Python `weasyprint`, o usa la imagen Docker actualizada.');
        }
        throw pythonError;
      }
    }
  };

  try {
    await runWeasyPrint(advancedArgs);
  } catch (error: any) {
    const stderr = String(error?.stderr || '');
    const stdout = String(error?.stdout || '');
    const output = `${stderr}\n${stdout}`;
    if (/no such option|unrecognized arguments|unknown option/i.test(output)) {
      throw new Error('La versión instalada de WeasyPrint no soporta `--pdf-variant`/`--output-intent`. Actualiza WeasyPrint para generar la salida paralela con perfil ICC.');
    } else {
      throw error;
    }
  }

  await convertPdfToDeviceGrayWithGhostscript(outputPath, grayOutputPath, 'preserve');

  return fs.readFile(grayOutputPath);
}

function noticeContainsTable(config: NoticeConfig): boolean {
  return /##table[ \t]*\r?\n[\s\S]*?##\/table/.test(config.bodyText || '');
}

async function verifyGrayPdfWithInkcov(outputPath: string): Promise<void> {
  const { stdout } = await execFileAsync('gs', ['-o', '-', '-sDEVICE=inkcov', outputPath], {
    timeout: 20000,
    maxBuffer: 1024 * 1024 * 10,
  });

  const coverage = parseInkCoverage(stdout);
  const hasColor = coverage.some(({ c, m, y }) => c > 0.000001 || m > 0.000001 || y > 0.000001);

  if (hasColor) {
    throw new Error(`La verificación inkcov detectó tinta C, M o Y en ${outputPath}.`);
  }
}

async function convertPdfToDeviceGrayWithGhostscript(
  inputPath: string,
  outputPath: string,
  mode: GrayConversionMode = 'flatten',
): Promise<void> {
  const grayProfile = await resolveRequiredGrayIccProfile();
  const compatibilityLevel = mode === 'flatten' ? '1.3' : '1.4';
  const renderResolution = '1200';
  const pdfxDefinitionPath = mode === 'flatten'
    ? await writePdfx1aDefinition(path.dirname(outputPath), grayProfile)
    : null;
  const gsArgs = [
    '-sDEVICE=pdfwrite',
    `-dCompatibilityLevel=${compatibilityLevel}`,
    `-r${renderResolution}`,
    ...(pdfxDefinitionPath ? ['-dPDFX=1'] : []),
    ...(pdfxDefinitionPath ? [`--permit-file-read=${grayProfile}`] : []),
    '-dPDFSETTINGS=/prepress',
    '-sColorConversionStrategy=Gray',
    '-dProcessColorModel=/DeviceGray',
    '-dOverrideICC=true',
    '-dDownsampleColorImages=false',
    '-dDownsampleGrayImages=false',
    '-dDownsampleMonoImages=false',
    '-dDetectDuplicateImages=true',
    '-dCompressFonts=true',
    '-dSubsetFonts=true',
    '-dEmbedAllFonts=true',
    '-dAutoRotatePages=/None',
    '-dNOPAUSE',
    '-dBATCH',
    `-sDefaultGrayProfile=${grayProfile}`,
    `-sOutputFile=${outputPath}`,
    ...(pdfxDefinitionPath ? [pdfxDefinitionPath] : []),
    inputPath,
  ];

  await execFileAsync('gs', gsArgs, {
    timeout: 30000,
    maxBuffer: 1024 * 1024 * 10,
  });

  await verifyGrayPdfWithInkcov(outputPath);
}

async function renderPdfViaApp(config: NoticeConfig): Promise<Buffer> {
  const executablePath = resolveChromeExecutablePath();
  const browser = await puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: Math.ceil(config.size.widthCm * PX_PER_CM),
      height: Math.ceil(config.size.heightCm * PX_PER_CM),
      deviceScaleFactor: 1,
    });

    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle0', timeout: 20000 });
    await page.waitForSelector('[data-notice-canvas]', { timeout: 10000 });

    await page.evaluate((cfg: NoticeConfig) => {
      (window as any).__pdfReady = false;
      (window as any).__setNoticeConfig(cfg);
    }, config);
    await page.waitForFunction('window.__pdfReady === true', { timeout: 10000 });

    await page.evaluate(() => {
      (window as any).__pdfExportReady = false;
      (window as any).__setPdfExportMode(true);
    });
    await page.waitForFunction('window.__pdfExportReady === true', { timeout: 10000 });

    if (noticeContainsTable(config)) {
      await page.waitForFunction(() => {
        const tables = Array.from(document.querySelectorAll('[data-notice-table="true"]'));
        return tables.length > 0 && tables.every((table) => {
          const rect = table.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
      }, { timeout: 10000 });
    }

    await page.evaluate(() => document.fonts.ready);
    await new Promise((resolve) => setTimeout(resolve, 500));

    await page.evaluate(() => {
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.background = 'white';
      document.body.style.overflow = 'hidden';
    });
    await new Promise((resolve) => setTimeout(resolve, 200));

    const overflow = await page.$eval('[data-notice-content="true"]', (element) => {
      const scrollHeight = element.scrollHeight;
      const clientHeight = element.clientHeight;
      return {
        scrollHeight,
        clientHeight,
        overflowPx: Math.max(0, scrollHeight - clientHeight),
      };
    });

    if (overflow.overflowPx > 1) {
      throw new PdfOverflowError(
        `El contenido se desborda ${overflow.overflowPx.toFixed(1)} px en el render exacto del PDF. Ajusta el aviso antes de exportar.`,
      );
    }

    const pdf = await page.pdf({
      width: `${config.size.widthCm}cm`,
      height: `${config.size.heightCm}cm`,
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

async function startServer() {
  const app = express();
  const host = process.env.HOST || '0.0.0.0';

  app.use(express.json({ limit: '25mb' }));

  const library = new SharedLibraryStore(path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data')));
  const libraryRoute = (action: (req: express.Request) => Promise<unknown>): express.RequestHandler =>
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      try { res.json(await action(req)); }
      catch (error) {
        console.error('Shared library error:', error);
        res.status(500).json({ error: 'No se pudo acceder al guardado compartido. Intenta nuevamente.' });
      }
    };
  app.get('/api/library', libraryRoute(() => library.get()));
  app.post('/api/library/notices', (req, res, next) => {
    if (!isSavedNotice(req.body)) { res.status(400).json({ error: 'Anuncio inválido.' }); return; }
    next();
  }, libraryRoute(req => library.addNotice(req.body)));
  app.delete('/api/library/notices/:id', libraryRoute(req => library.deleteNotice(String(req.params.id))));
  app.post('/api/library/history', (req, res, next) => {
    if (!isGeneratedLogEntry(req.body)) { res.status(400).json({ error: 'Registro inválido.' }); return; }
    next();
  }, libraryRoute(req => library.addLog(req.body)));
  app.delete('/api/library/history', libraryRoute(() => library.clearLog()));
  app.post('/api/library/migrate', (req, res, next) => {
    if (!Array.isArray(req.body?.savedNotices) || !req.body.savedNotices.every(isSavedNotice)
      || !Array.isArray(req.body?.generatedLog) || !req.body.generatedLog.every(isGeneratedLogEntry)) {
      res.status(400).json({ error: 'Datos locales inválidos.' }); return;
    }
    next();
  }, libraryRoute(req => library.migrate(req.body)));


  app.post('/api/pdf/analyze-print-risk', express.raw({ type: ['application/pdf', 'application/octet-stream'], limit: '100mb' }), (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: 'Debes cargar un PDF para analizar.' });
        return;
      }

      res.json(analyzePdfPrintRisk(req.body));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido analizando el PDF.';
      console.error('PDF print-risk analysis error:', error);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/pdf/convert-gray', express.raw({ type: ['application/pdf', 'application/octet-stream'], limit: '100mb' }), async (req, res) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'avisos-pdf-gray-'));

    try {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: 'Debes cargar un PDF para convertir.' });
        return;
      }

      const inputPath = path.join(tempDir, 'input.pdf');
      const outputPath = path.join(tempDir, 'output-gray.pdf');
      const requestedMode = String(req.header('x-gray-conversion-mode') || '');
      const conversionMode: GrayConversionMode = requestedMode === 'preserve' ? 'preserve' : 'flatten';
      await fs.writeFile(inputPath, req.body);
      await convertPdfToDeviceGrayWithGhostscript(inputPath, outputPath, conversionMode);

      const originalName = decodeURIComponent(String(req.header('x-filename') || 'documento.pdf'));
      const baseName = path.basename(originalName, path.extname(originalName)) || 'documento';
      const outputName = `${baseName}_K.pdf`;
      const output = await fs.readFile(outputPath);

      res
        .type('application/pdf')
        .setHeader('Content-Disposition', `attachment; filename="${outputName.replace(/"/g, '')}"`)
        .send(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido convirtiendo el PDF a grises.';
      console.error('Ghostscript gray conversion error:', error);
      res.status(500).json({ error: message });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  app.post('/api/pdf/render', async (req, res) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'avisos-pdf-render-'));

    try {
      const { config }: RenderPdfRequest = req.body;
      if (!config) {
        res.status(400).json({ error: 'Falta config para renderizar el PDF.' });
        return;
      }

      const pdfBuffer = await renderPdfViaApp(config);
      const inputPath = path.join(tempDir, 'input.pdf');
      const outputPath = path.join(tempDir, 'output-gray.pdf');
      await fs.writeFile(inputPath, pdfBuffer);
      await convertPdfToDeviceGrayWithGhostscript(inputPath, outputPath, 'preserve');

      const grayPdfBuffer = await fs.readFile(outputPath);
      const filename = `aviso_${config.size.widthCm}x${config.size.heightCm}cm_K.pdf`;

      res
        .type('application/pdf')
        .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        .send(grayPdfBuffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido renderizando PDF con Puppeteer.';
      console.error('Puppeteer PDF render error:', error);
      const statusCode = error instanceof PdfOverflowError ? error.statusCode : 500;
      res.status(statusCode).json({ error: message });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  app.post('/api/pdf/render-weasyprint', async (req, res) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'avisos-pdf-weasy-'));

    try {
      const { config }: RenderPdfRequest = req.body;
      if (!config) {
        res.status(400).json({ error: 'Falta config para renderizar el PDF con WeasyPrint.' });
        return;
      }

      const pdfBuffer = await renderPdfViaWeasyPrint(config, tempDir);
      const filename = `aviso_${config.size.widthCm}x${config.size.heightCm}cm_K_weasyprint_gs.pdf`;

      res
        .type('application/pdf')
        .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        .send(pdfBuffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido renderizando PDF con WeasyPrint.';
      console.error('WeasyPrint PDF render error:', error);
      res.status(500).json({ error: message });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, host, () => {
    console.log(`Local app running at http://localhost:${port}/`);
  });
}

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
