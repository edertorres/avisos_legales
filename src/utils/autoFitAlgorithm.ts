import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { NoticeCanvas, getTableFontSizePt } from '../components/NoticeCanvas';
import { NoticeConfig, SizeOption } from '../types';

export interface AutoFitResult {
  changes: Partial<NoticeConfig>;
  message: string;
  suggestedSize?: SizeOption;
}

/**
 * Newspaper-appropriate font size ranges (in points).
 * Body: 5.5–9pt | Header: 6–10pt | Subheader: 5.5–8pt
 */
const NEWSPAPER_LIMITS = {
  bodyMin: 5.5,
  bodyMax: 9,
  headerMin: 6,
  headerMax: 10,
  subheaderMin: 5.5,
  subheaderMax: 8,
} as const;

/**
 * Line height range for newspaper body text.
 * Compact: 1.15 | Normal: 1.22 | Loose: 1.32
 */
const LINE_HEIGHT_RANGE = {
  min: 1.15,
  max: 1.32,
  step: 0.02,
} as const;

/**
 * Measures fit with the real NoticeCanvas (the same component used by the preview
 * and by Puppeteer for the PDF), rendered off-screen at scale 1. This keeps bold
 * text, auto-bold keywords, logos, tables and images in the measurement, so the
 * auto-fit result matches what the preview and the PDF show.
 */
class CanvasMeasurer {
  private readonly container: HTMLDivElement;
  private readonly root: Root;

  constructor() {
    this.container = document.createElement('div');
    this.container.setAttribute('aria-hidden', 'true');
    this.container.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none;visibility:hidden;';
    document.body.appendChild(this.container);
    this.root = createRoot(this.container);
  }

  async fits(config: NoticeConfig): Promise<boolean> {
    flushSync(() => {
      this.root.render(
        createElement(NoticeCanvas, { config, zoomScale: 1, onOverflowStatusChange: noop, showMarginGuides: false }),
      );
    });
    // Images (logo, inline images) must be decoded before their height counts.
    const images = Array.from(this.container.querySelectorAll('img'));
    await Promise.all(images.map((img) => (img.complete ? null : img.decode().catch(() => undefined))));
    const content = this.container.querySelector('[data-notice-content="true"]') as HTMLElement | null;
    return !content || (content.scrollHeight <= content.clientHeight + 1 && content.scrollWidth <= content.clientWidth + 1);
  }

  dispose() {
    this.root.unmount();
    this.container.remove();
  }
}

const noop = () => {};

/**
 * Check if the text content fits within the given notice dimensions.
 */
function fitsAtSize(
  measurer: CanvasMeasurer,
  config: NoticeConfig,
  bodyPt: number,
  headerPt: number,
  subheaderPt: number,
  lineHeight: number,
): Promise<boolean> {
  return measurer.fits({
    ...config,
    bodyFontSizePt: bodyPt,
    tableFontSizePt: tableSizeFor(bodyPt, config),
    headerFontSizePt: headerPt,
    subheaderFontSizePt: subheaderPt,
    lineHeight,
  });
}

/**
 * Table text scales with the body (same idea as the titles), so auto-fit can also
 * resolve tables that are too wide or too tall. Range matches the "Tamaño de tabla" control.
 */
function tableSizeFor(bodyPt: number, originalConfig: NoticeConfig): number {
  const ratio = getTableFontSizePt(originalConfig) / Math.max(0.1, originalConfig.bodyFontSizePt);
  return clamp(Number((bodyPt * ratio).toFixed(2)), 3.5, 12);
}

/**
 * Clamp a value to a range.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Calculate proportional header/subheader sizes based on body size.
 * Keeps the visual hierarchy: header > subheader > body.
 */
function proportionalSizes(bodyPt: number, originalConfig: NoticeConfig): {
  headerPt: number;
  subheaderPt: number;
} {
  const safeBody = Math.max(0.1, originalConfig.bodyFontSizePt);
  const headerRatio = originalConfig.headerFontSizePt / safeBody;
  const subheaderRatio = originalConfig.subheaderFontSizePt / safeBody;

  return {
    headerPt: clamp(
      Number((bodyPt * headerRatio).toFixed(2)),
      NEWSPAPER_LIMITS.headerMin,
      NEWSPAPER_LIMITS.headerMax,
    ),
    subheaderPt: clamp(
      Number((bodyPt * subheaderRatio).toFixed(2)),
      NEWSPAPER_LIMITS.subheaderMin,
      NEWSPAPER_LIMITS.subheaderMax,
    ),
  };
}

/**
 * Auto-fit algorithm for newspaper copyfit.
 *
 * Strategy (in order of preference):
 * 1. If current config fits → try to increase font slightly (up to reasonable max)
 * 2. If current config overflows:
 *    a. Try reducing line height first (cheaper, keeps font size)
 *    b. Then try smaller font sizes (still keeping proportions)
 *    c. Only suggest larger notice size as last resort
 *
 * Newspaper constraints:
 * - Body: 5.5–9pt (5.5pt absolute minimum for legibility)
 * - Line height: 1.15–1.32
 * - Header/subheader scale proportionally with body
 */
export async function calculateAutoFitFont(
  config: NoticeConfig,
  availableSizes: SizeOption[],
): Promise<AutoFitResult> {
  // Ensure DOM is ready
  await new Promise((r) => requestAnimationFrame(r));
  const measurer = new CanvasMeasurer();
  try {
    return await searchBestFit(measurer, config, availableSizes);
  } finally {
    measurer.dispose();
  }
}

async function searchBestFit(
  measurer: CanvasMeasurer,
  config: NoticeConfig,
  availableSizes: SizeOption[],
): Promise<AutoFitResult> {

  const currentBody = config.bodyFontSizePt;
  const currentLineHeight = config.lineHeight;
  const { headerPt: currentHeader, subheaderPt: currentSubheader } = proportionalSizes(currentBody, config);

  // ── Step 0: Does it currently fit? ──
  const currentFits = await fitsAtSize(measurer, config, currentBody, currentHeader, currentSubheader, currentLineHeight);

  if (currentFits) {
    // Current fits — try to go slightly bigger for better readability
    let bestBody = currentBody;

    for (let tryBody = currentBody + 0.25; tryBody <= NEWSPAPER_LIMITS.bodyMax; tryBody += 0.25) {
      const { headerPt, subheaderPt } = proportionalSizes(tryBody, config);
      if (await fitsAtSize(measurer, config, tryBody, headerPt, subheaderPt, currentLineHeight)) {
        bestBody = tryBody;
      } else {
        break;
      }
    }

    if (bestBody > currentBody + 0.2) {
      const { headerPt, subheaderPt } = proportionalSizes(bestBody, config);
      return {
        changes: {
          bodyFontSizePt: Number(bestBody.toFixed(2)),
          headerFontSizePt: headerPt,
          tableFontSizePt: tableSizeFor(bestBody, config),
          subheaderFontSizePt: subheaderPt,
          lineHeight: currentLineHeight,
        },
        message: `Fuente ampliada de ${currentBody} pt a ${bestBody.toFixed(2)} pt (máximo legible).`,
      };
    }

    return {
      changes: {},
      message: `La fuente actual (${currentBody} pt) ya es óptima para este tamaño.`,
    };
  }

  // ── Step 1: Text overflows — try reducing line height first ──
  let bestLineHeight = currentLineHeight;
  let bestBody = currentBody;
  let bestHeader = currentHeader;
  let bestSubheader = currentSubheader;

  // Try progressively tighter line heights (from current down to minimum)
  for (
    let tryLH = currentLineHeight - LINE_HEIGHT_RANGE.step;
    tryLH >= LINE_HEIGHT_RANGE.min;
    tryLH -= LINE_HEIGHT_RANGE.step
  ) {
    if (await fitsAtSize(measurer, config, currentBody, currentHeader, currentSubheader, Number(tryLH.toFixed(2)))) {
      bestLineHeight = Number(tryLH.toFixed(2));
      break;
    }
  }

  // Check if line height reduction was enough
  if (await fitsAtSize(measurer, config, currentBody, currentHeader, currentSubheader, bestLineHeight)) {
    return {
      changes: {
        lineHeight: bestLineHeight,
      },
      message: `Interlineado reducido de ${currentLineHeight.toFixed(2)} a ${bestLineHeight.toFixed(2)} para que quepa.`,
    };
  }

  // ── Step 2: Line height alone wasn't enough — reduce font size ──
  // Start from current size and go down to minimum, checking each step
  let foundFit = false;

  for (
    let tryBody = currentBody - 0.25;
    tryBody >= NEWSPAPER_LIMITS.bodyMin;
    tryBody -= 0.25
  ) {
    const { headerPt, subheaderPt } = proportionalSizes(tryBody, config);

    // Try with the best line height we found
    if (await fitsAtSize(measurer, config, tryBody, headerPt, subheaderPt, bestLineHeight)) {
      bestBody = tryBody;
      bestHeader = headerPt;
      bestSubheader = subheaderPt;
      foundFit = true;
      break;
    }

    // Also try with tighter line height
    for (
      let tryLH = bestLineHeight - LINE_HEIGHT_RANGE.step;
      tryLH >= LINE_HEIGHT_RANGE.min;
      tryLH -= LINE_HEIGHT_RANGE.step
    ) {
      if (await fitsAtSize(measurer, config, tryBody, headerPt, subheaderPt, Number(tryLH.toFixed(2)))) {
        bestBody = tryBody;
        bestHeader = headerPt;
        bestSubheader = subheaderPt;
        bestLineHeight = Number(tryLH.toFixed(2));
        foundFit = true;
        break;
      }
    }

    if (foundFit) break;
  }

  if (foundFit) {
    const bodyDelta = currentBody - bestBody;
    const lhDelta = currentLineHeight - bestLineHeight;
    const parts: string[] = [];
    if (bodyDelta > 0.05) parts.push(`fuente de ${currentBody} pt a ${bestBody.toFixed(2)} pt`);
    if (lhDelta > 0.02) parts.push(`interlineado de ${currentLineHeight.toFixed(2)} a ${bestLineHeight.toFixed(2)}`);
    if (/##table/.test(config.bodyText || '')) {
      const tableBefore = getTableFontSizePt(config);
      const tableAfter = tableSizeFor(bestBody, config);
      if (Math.abs(tableBefore - tableAfter) > 0.05) parts.push(`tablas de ${tableBefore} pt a ${tableAfter} pt`);
    }

    return {
      changes: {
        bodyFontSizePt: bestBody,
        headerFontSizePt: bestHeader,
        tableFontSizePt: tableSizeFor(bestBody, config),
        subheaderFontSizePt: bestSubheader,
        lineHeight: bestLineHeight,
      },
      message: `Ajustado: ${parts.join(' y ')}.`,
    };
  }

  // ── Step 3: Nothing fits — suggest larger notice size (don't auto-apply) ──
  const suggested = findSuggestedSize(config, availableSizes);

  return {
    changes: {},
    suggestedSize: suggested,
    message: suggested
      ? `El texto no cabe. Se sugiere usar ${suggested.widthCm}×${suggested.heightCm} cm — selecciona ese tamaño arriba.`
      : `El texto excede el espacio disponible con fuente mínima (${NEWSPAPER_LIMITS.bodyMin} pt). Reduce el contenido.`,
  };
}

/**
 * Suggest a larger notice size from available sizes.
 */
function findSuggestedSize(
  config: NoticeConfig,
  availableSizes: SizeOption[],
): SizeOption | undefined {
  const currentArea = config.size.widthCm * config.size.heightCm;
  const candidates = availableSizes
    .filter((s) => {
      const area = s.widthCm * s.heightCm;
      return s.widthCm === config.size.widthCm && area > currentArea;
    })
    .sort((a, b) => (a.widthCm * a.heightCm) - (b.widthCm * b.heightCm));

  return candidates[0];
}
