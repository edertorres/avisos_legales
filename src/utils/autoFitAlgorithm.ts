import { NoticeConfig, SizeOption } from '../types';

export interface AutoFitResult {
  changes: Partial<NoticeConfig>;
  message: string;
  suggestedSize?: SizeOption;
}

const PX_PER_CM = 37.795;

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
 * Create a hidden off-screen measurement element that mirrors the notice layout.
 */
function createMeasurementElement(config: NoticeConfig): { el: HTMLDivElement; cleanup: () => void } {
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    left: -99999px;
    top: -99999px;
    pointer-events: none;
    z-index: -1;
  `;

  const widthPx = config.size.widthCm * PX_PER_CM;
  const heightPx = config.size.heightCm * PX_PER_CM;
  const marginPx = (config.marginMm / 10) * PX_PER_CM;
  const borderWidth = Math.max(0.2, config.borderWidthPx || 0.5);

  container.innerHTML = `
    <div style="
      width: ${widthPx}px;
      height: ${heightPx}px;
      overflow: hidden;
      box-sizing: border-box;
      border: ${borderWidth}px solid black;
      background: white;
      position: relative;
    ">
      <div style="
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        padding: ${marginPx}px;
        box-sizing: border-box;
        font-family: ${config.fontFamily};
        font-size: ${config.bodyFontSizePt}pt;
        line-height: ${config.lineHeight};
        letter-spacing: ${(config.letterSpacingMm || 0) * PX_PER_CM * 0.1}px;
        text-align: ${config.textAlign};
        overflow: hidden;
        color: black;
      ">
        <div class="af-header" style="
          font-family: ${config.fontFamily};
          font-size: ${config.headerFontSizePt}pt;
          font-weight: 700;
          text-align: center;
          line-height: 1.2;
          margin-bottom: 1.5pt;
          word-break: break-word;
        "></div>
        <div class="af-subheader" style="
          font-family: ${config.fontFamily};
          font-size: ${config.subheaderFontSizePt}pt;
          font-weight: 700;
          text-align: center;
          line-height: 1.2;
          margin-bottom: 1.5pt;
          word-break: break-word;
        "></div>
        <div class="af-body" style="word-break: break-word;"></div>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  return {
    el: container,
    cleanup: () => {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    },
  };
}

/**
 * Strip bold, underline and alignment tags for measurement purposes.
 */
function stripFormatting(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\[(left|center|right|justify|u)\]/gi, '')
    .replace(/\[\/(left|center|right|justify|u)\]/gi, '');
}

/**
 * Check if the text content fits within the given notice dimensions.
 */
function fitsAtSize(
  config: NoticeConfig,
  bodyPt: number,
  headerPt: number,
  subheaderPt: number,
  lineHeight: number,
): boolean {
  const { el, cleanup } = createMeasurementElement({
    ...config,
    bodyFontSizePt: bodyPt,
    headerFontSizePt: headerPt,
    subheaderFontSizePt: subheaderPt,
    lineHeight,
  });

  const headerEl = el.querySelector('.af-header') as HTMLDivElement;
  const subheaderEl = el.querySelector('.af-subheader') as HTMLDivElement;
  const bodyEl = el.querySelector('.af-body') as HTMLDivElement;

  if (headerEl) headerEl.textContent = config.headerTitle || '';
  if (subheaderEl) subheaderEl.textContent = config.subheaderTitle || '';
  if (bodyEl) bodyEl.textContent = stripFormatting(config.bodyText || '');

  const innerContainer = el.firstElementChild as HTMLDivElement;
  const contentArea = innerContainer?.firstElementChild as HTMLDivElement;
  const isOverflowing = contentArea
    ? contentArea.scrollHeight > contentArea.clientHeight + 1
    : false;

  cleanup();
  return !isOverflowing;
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

  const currentBody = config.bodyFontSizePt;
  const currentLineHeight = config.lineHeight;
  const { headerPt: currentHeader, subheaderPt: currentSubheader } = proportionalSizes(currentBody, config);

  // ── Step 0: Does it currently fit? ──
  const currentFits = fitsAtSize(config, currentBody, currentHeader, currentSubheader, currentLineHeight);

  if (currentFits) {
    // Current fits — try to go slightly bigger for better readability
    let bestBody = currentBody;

    for (let tryBody = currentBody + 0.25; tryBody <= NEWSPAPER_LIMITS.bodyMax; tryBody += 0.25) {
      const { headerPt, subheaderPt } = proportionalSizes(tryBody, config);
      if (fitsAtSize(config, tryBody, headerPt, subheaderPt, currentLineHeight)) {
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
    if (fitsAtSize(config, currentBody, currentHeader, currentSubheader, Number(tryLH.toFixed(2)))) {
      bestLineHeight = Number(tryLH.toFixed(2));
      break;
    }
  }

  // Check if line height reduction was enough
  if (fitsAtSize(config, currentBody, currentHeader, currentSubheader, bestLineHeight)) {
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
    if (fitsAtSize(config, tryBody, headerPt, subheaderPt, bestLineHeight)) {
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
      if (fitsAtSize(config, tryBody, headerPt, subheaderPt, Number(tryLH.toFixed(2)))) {
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

    return {
      changes: {
        bodyFontSizePt: bestBody,
        headerFontSizePt: bestHeader,
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
