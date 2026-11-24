import { parseFormattedText, FormattedText } from '../utils/textFormatting';
import React, { useRef, useEffect, useCallback } from 'react';
import { BodyImage, NoticeConfig, OverflowStatus } from '../types';
import { parseTableBlock, TABLE_BLOCK_SOURCE, type TableModel } from '../utils/tableMarkup';

const PT_PER_CM = 28.3465;
const PT_PER_MM = 2.83465;
const CM_PER_PT = 1 / PT_PER_CM;
const PX_PER_CM = 37.795; // 96 DPI

interface NoticeCanvasProps {
  config: NoticeConfig;
  zoomScale: number;
  onOverflowStatusChange: (status: OverflowStatus) => void;
  showMarginGuides: boolean;
}

export function getTableFontSizePt(config: NoticeConfig): number {
  return config.tableFontSizePt ?? Number(Math.max(4, config.bodyFontSizePt * 0.85).toFixed(2));
}

/** Table rule width in points: thin but safe for newspaper presses (matches the funeral border). */
export const TABLE_RULE_PT = 0.25;
/**
 * Chrome rounds any CSS border thinner than 1px up to 1px (0.75pt in the PDF), so table
 * rules are painted with hard inset shadows instead, which keep their exact width:
 * each cell draws its right and bottom rule, the table draws the top and left ones.
 */
const CELL_RULES = `inset -${TABLE_RULE_PT}pt 0 0 0 #000, inset 0 -${TABLE_RULE_PT}pt 0 0 #000`;
const TABLE_RULES = `inset ${TABLE_RULE_PT}pt ${TABLE_RULE_PT}pt 0 0 #000`;
/** Slightly more room above than below: caps and figures leave the descender space empty. */
const CELL_PADDING = `0.7pt 2pt 0.45pt`;

interface NoticeTableProps {
  model: TableModel;
  fontFamily: string;
  fontSizePt: number;
  /** Position of the table in the body, used to open it in the editor from the canvas. */
  tableIndex?: number;
}

/**
 * A ##table block as printed. Cells wrap between words instead of overflowing the
 * notice; with auto table layout a cell only wraps when the table would not fit
 * otherwise, so tables that already fit keep their previous look. A table whose
 * words alone are wider than the notice is reported as horizontal overflow.
 */
export function NoticeTable({ model, fontFamily, fontSizePt, tableIndex }: NoticeTableProps) {
  const [headerRow, ...bodyRows] = model.header ? model.rows : [undefined, ...model.rows];
  const cellStyle = (column: number): React.CSSProperties => ({
    boxShadow: CELL_RULES,
    padding: CELL_PADDING,
    textAlign: model.align[column] ?? 'center',
    whiteSpace: 'normal',
    // Keep words whole (column widths follow the longest word); a word only breaks
    // when it cannot fit on a line by itself.
    overflowWrap: 'break-word',
    // The body wrapper uses word-break: break-word, which is inherited and would let
    // columns shrink mid-word; tables must keep words whole.
    wordBreak: 'normal',
    verticalAlign: 'middle',
  });

  return (
    <table
      data-notice-table="true"
      data-edit-target={tableIndex === undefined ? undefined : 'table'}
      data-table-index={tableIndex}
      style={{
        width: model.width === 'full' ? '100%' : 'auto',
        maxWidth: '100%',
        borderCollapse: 'collapse',
        fontFamily,
        fontSize: `${fontSizePt}pt`,
        lineHeight: 1.2,
        margin: 0,
        tableLayout: 'auto',
        boxShadow: TABLE_RULES,
        display: model.width === 'full' ? 'table' : 'inline-table',
      }}
    >
      {headerRow && (
        <thead>
          <tr>
            {headerRow.map((cell, column) => (
              <th key={column} style={{ ...cellStyle(column), fontWeight: 700 }}>{cell}</th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {bodyRows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row!.map((cell, column) => (
              <td key={column} style={cellStyle(column)}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Render a body image block inserted in the body text.
 */
function getBodyImageWidthMm(image: BodyImage, maxWidthMm: number): number {
  const preferredWidthMm = image.widthMm && image.widthMm > 0 ? image.widthMm : 25;
  return Math.min(Math.max(4, maxWidthMm), Math.max(4, preferredWidthMm));
}

function renderBodyImage(image: BodyImage, maxWidthMm: number): React.ReactNode {
  const align = image.align || 'center';
  const widthPx = getBodyImageWidthMm(image, maxWidthMm) * PX_PER_CM * 0.1;

  return (
    <div
      data-notice-body-image="true"
      style={{
        textAlign: align,
        marginTop: '2pt',
        marginBottom: '2pt',
        lineHeight: 0,
      }}
    >
      <img
        src={image.dataUrl}
        alt={image.name}
        style={{
          width: `${widthPx}px`,
          maxWidth: '100%',
          height: 'auto',
          display: 'inline-block',
          objectFit: 'contain',
        }}
      />
    </div>
  );
}

/**
 * Render body text with tables, inserted images, **bold** markdown and [align] tags.
 */
function parseBodyText(
  text: string,
  boldKeywords: string[] = [],
  fontFamily: string,
  tableFontSizePt: number,
  bodyImages: BodyImage[] = [],
  usedBodyImageIds: Set<string> = new Set(),
  maxBodyImageWidthMm: number = 25,
): React.ReactNode[] {
  if (!text) return [];

  const renderTextChunk = (chunk: string, keyPrefix: string): React.ReactNode[] => {
    const renderNodes = (nodes: FormattedText[], prefix: string): React.ReactNode[] =>
      nodes.map((node, index) => {
        const key = `${prefix}-${index}`;
        if (node.type === 'text') {
          return <React.Fragment key={key}>{renderInlineBold(node.value, boldKeywords, fontFamily)}</React.Fragment>;
        }
        if (node.type === 'underline') {
          return <u key={key}>{renderNodes(node.children, key)}</u>;
        }
        if (node.type === 'bold') {
          return <strong key={key} style={{ fontFamily: getBoldFontList(fontFamily), fontWeight: 700 }}>
            {renderNodes(node.children, key)}
          </strong>;
        }
        return <span key={key} style={{ display: 'block', textAlign: node.align }}>
          {renderNodes(node.children, key)}
        </span>;
      });
    return renderNodes(parseFormattedText(chunk), keyPrefix);
  };

  const blockRe = new RegExp(`${TABLE_BLOCK_SOURCE}|##image:([A-Za-z0-9_-]+)|##imagen:(\\d+)`, 'g');
  let tableIndex = 0;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(text)) !== null) {
    if (match.index > lastIndex && text.slice(lastIndex, match.index).trim().length > 0) {
      parts.push(
        <span key={`block-pre-${lastIndex}`}>
          {renderTextChunk(text.slice(lastIndex, match.index), `block-pre-${lastIndex}`)}
        </span>,
      );
    }

    if (match[2] !== undefined) {
      const tableModel = parseTableBlock(match[1], match[2]);
      if (tableModel) {
        const hasTextBefore = text.slice(0, match.index).trim().length > 0;
        const hasTextAfter = text.slice(match.index + match[0].length).trim().length > 0;
        parts.push(
          <div
            key={`table-${match.index}`}
            style={{
              marginTop: hasTextBefore ? '1pt' : 0,
              marginBottom: hasTextAfter ? '1pt' : 0,
              textAlign: 'center',
            }}
          >
            <NoticeTable model={tableModel} fontFamily={fontFamily} fontSizePt={tableFontSizePt} tableIndex={tableIndex++} />
          </div>,
        );
      }
    } else {
      const imageId = match[3];
      const imageSlot = match[4] ? parseInt(match[4], 10) : null;
      const image = imageSlot
        ? bodyImages.find((img, index) => (img.slot || index + 1) === imageSlot)
        : bodyImages.find((img) => img.id === imageId);
      if (image) {
        usedBodyImageIds.add(image.id);
        parts.push(
          <React.Fragment key={`image-${match.index}`}>
            {renderBodyImage(image, maxBodyImageWidthMm)}
          </React.Fragment>,
        );
      }
    }

    lastIndex = match.index + match[0].length;
    // The line break after ##/table only ends the marker line; a table is already a block,
    // so rendering that break would add a blank line below every table.
    if (match[2] !== undefined) {
      if (text.startsWith('\r\n', lastIndex)) lastIndex += 2;
      else if (text.startsWith('\n', lastIndex)) lastIndex += 1;
    }
  }

  if (lastIndex > 0) {
    if (lastIndex < text.length && text.slice(lastIndex).trim().length > 0) {
      parts.push(
        <span key={`block-post-${lastIndex}`}>
          {renderTextChunk(text.slice(lastIndex), `block-post-${lastIndex}`)}
        </span>,
      );
    }
    return parts;
  }

  return renderTextChunk(text, 'text');
}

/**
 * Render inline text with **bold** markdown and bold keywords as <strong> elements.
 */
function renderTextWithLineBreaks(text: string): React.ReactNode[] {
  return text.split('\n').map((line, index) => (
    <React.Fragment key={index}>
      {index > 0 && <br />}
      {preserveLegalNoBreaks(line)}
    </React.Fragment>
  ));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderKeywordBold(
  text: string,
  boldKeywords: string[],
  boldFontFamily: string,
  keyPrefix: string,
): React.ReactNode[] {
  if (!text) return [];

  const uniqueKeywords = [...new Set(boldKeywords.map((kw) => kw.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);

  if (uniqueKeywords.length === 0) {
    return renderTextWithLineBreaks(text).map((node, index) => (
      <React.Fragment key={`${keyPrefix}-plain-${index}`}>{node}</React.Fragment>
    ));
  }

  const ranges: Array<{ start: number; end: number }> = [];

  uniqueKeywords.forEach((keyword) => {
    try {
      const escaped = escapeRegExp(keyword).replace(/[ \t]+/g, '[ \\t]+');
      const regex = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escaped})(?=$|[^\\p{L}\\p{N}_])`, 'giu');

      for (const match of text.matchAll(regex)) {
        const prefixLength = match[1]?.length || 0;
        const start = (match.index || 0) + prefixLength;
        const end = start + match[2].length;
        const overlaps = ranges.some((range) => start < range.end && end > range.start);
        if (!overlaps) ranges.push({ start, end });
      }
    } catch {
      // Ignore invalid auto-highlight patterns.
    }
  });

  if (ranges.length === 0) {
    return renderTextWithLineBreaks(text).map((node, index) => (
      <React.Fragment key={`${keyPrefix}-plain-${index}`}>{node}</React.Fragment>
    ));
  }

  ranges.sort((a, b) => a.start - b.start);
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  ranges.forEach((range, index) => {
    if (range.start > cursor) {
      nodes.push(
        <React.Fragment key={`${keyPrefix}-plain-${index}`}>
          {renderTextWithLineBreaks(text.slice(cursor, range.start))}
        </React.Fragment>,
      );
    }

    nodes.push(
      <strong
        key={`${keyPrefix}-bold-${index}`}
        style={{
          fontFamily: boldFontFamily,
          fontWeight: 700,
        }}
      >
        {renderTextWithLineBreaks(text.slice(range.start, range.end))}
      </strong>,
    );

    cursor = range.end;
  });

  if (cursor < text.length) {
    nodes.push(
      <React.Fragment key={`${keyPrefix}-plain-tail`}>
        {renderTextWithLineBreaks(text.slice(cursor))}
      </React.Fragment>,
    );
  }

  return nodes;
}

function renderInlineBold(
  text: string,
  boldKeywords: string[] = [],
  fontFamily: string,
): React.ReactNode[] {
  if (!text) return [];

  const boldFontFamily = getBoldFontList(fontFamily);
  const nodes: React.ReactNode[] = [];
  const markdownBoldRe = /\*\*([\s\S]*?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = markdownBoldRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(...renderKeywordBold(text.slice(lastIndex, match.index), boldKeywords, boldFontFamily, `pre-${lastIndex}`));
    }

    nodes.push(
      <strong
        key={`manual-bold-${match.index}`}
        style={{
          fontFamily: boldFontFamily,
          fontWeight: 700,
        }}
      >
        {renderTextWithLineBreaks(match[1])}
      </strong>,
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(...renderKeywordBold(text.slice(lastIndex), boldKeywords, boldFontFamily, `tail-${lastIndex}`));
  }

  return nodes;
}

/**
 * Preserve legal no-break spaces (Cédula de Ciudadanía, NIT, etc.)
 */
function preserveLegalNoBreaks(text: string): string {
  return text
    .replace(/\b(Cédula)\s+de\s+(Ciudadanía)\s+(No\.)/gi, '$1\u00A0de\u00A0$2\u00A0$3')
    .replace(/\b(identificad[oa])\s+con\s+(Cédula(?:\s+de\s+Ciudadanía)?(?:\s+No\.?)?)/gi,
      (_match, qualifier: string, docLabel: string) => `${qualifier}\u00A0con\u00A0${docLabel.replace(/\s+/g, '\u00A0')}`)
    .replace(/\b(con)\s+(Cédula(?:\s+de\s+Ciudadanía)?(?:\s+No\.?)?)/gi,
      (_match, connector: string, docLabel: string) => `${connector}\u00A0${docLabel.replace(/\s+/g, '\u00A0')}`)
    .replace(/\b(NIT)\s+([\d. -]{5,})/gi,
      (_match, label: string, value: string) => `${label}\u00A0${value.trim()}`);
}

function getBoldFontList(fontFamily: string): string {
  if (['Libre Bodoni', 'Libre Baskerville', 'Cormorant Garamond'].some(name => fontFamily.includes(name))) return fontFamily;
  if (fontFamily.includes('Barlow Semi Condensed'))
    return '"Barlow Semi Condensed", "Barlow Condensed", "Roboto Condensed", "Roboto", "Arimo", sans-serif';
  if (fontFamily.includes('Barlow Condensed'))
    return '"Barlow Condensed", "Roboto Condensed", "Roboto", "Arimo", sans-serif';
  if (fontFamily.includes('Roboto Condensed') || fontFamily.includes('Narrow'))
    return '"Roboto Condensed", "Roboto", "Arimo", "Noto Sans", sans-serif';
  if (fontFamily.includes('Tinos') || fontFamily.includes('Times'))
    return '"Tinos", "Liberation Serif", "Noto Serif", serif';
  if (fontFamily.includes('Lora') || fontFamily.includes('Georgia'))
    return '"Noto Serif", "Liberation Serif", "Tinos", serif';
  if (fontFamily.includes('Courier'))
    return '"Liberation Mono", "Courier Prime", "Noto Sans Mono", monospace';
  return '"Roboto", "Arimo", "Noto Sans", "PT Sans", sans-serif';
}

/**
 * NoticeCanvas: Pure HTML/CSS notice renderer at exact physical dimensions.
 *
 * The notice is rendered as a styled
 * HTML div that matches the exact cm dimensions, with proper typography,
 * text justification, logo placement, and border.
 */
export const NoticeCanvas: React.FC<NoticeCanvasProps> = ({
  config,
  zoomScale,
  onOverflowStatusChange,
  showMarginGuides,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Physical dimensions in screen pixels
  const widthPx = config.size.widthCm * PX_PER_CM;
  const heightPx = config.size.heightCm * PX_PER_CM;
  const marginPx = (config.marginMm / 10) * PX_PER_CM;

  // Callers usually pass an inline callback. Keep it in a ref so a new identity on each
  // render does not re-trigger measurement (that caused a permanent render loop).
  const onOverflowRef = useRef(onOverflowStatusChange);
  onOverflowRef.current = onOverflowStatusChange;
  const lastStatusKey = useRef<string | null>(null);

  // Measure overflow via DOM — measure the content area, not the outer container
  const measureOverflow = useCallback(() => {
    const el = contentRef.current || canvasRef.current;
    if (!el) return;

    const scrollH = el.scrollHeight;
    const clientH = el.clientHeight;
    const overflowHeightPx = Math.max(0, scrollH - clientH);
    // Horizontal overflow: e.g. a table whose words cannot fit the notice width.
    const overflowWidthPx = Math.max(0, el.scrollWidth - el.clientWidth);
    const isOverflowing = overflowHeightPx > 1 || overflowWidthPx > 1; // 1px tolerance
    const overflowHeightPt = overflowHeightPx * (72 / 96);
    const overflowPercentage = isOverflowing
      ? Math.round((overflowHeightPt / (config.size.heightCm * PT_PER_CM)) * 100)
      : 0;
    const recommendedHeightCm = isOverflowing
      ? Number((config.size.heightCm + overflowHeightPt / PT_PER_CM + 0.3).toFixed(1))
      : config.size.heightCm;

    // Only notify when the result changes, so parents storing it in state don't re-render needlessly.
    const statusKey = `${isOverflowing}|${overflowHeightPx}|${overflowWidthPx}|${overflowPercentage}|${recommendedHeightCm}`;
    if (statusKey === lastStatusKey.current) return;
    lastStatusKey.current = statusKey;
    onOverflowRef.current({
      isOverflowing,
      overflowHeightPx,
      overflowWidthPx,
      overflowPercentage,
      recommendedHeightCm,
    });
  }, [config.size.heightCm, config.size.widthCm]);

  // Re-measure on every content/style change
  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM is painted before measuring
    const raf = requestAnimationFrame(() => {
      measureOverflow();
    });
    return () => cancelAnimationFrame(raf);
  }, [
    config.funeral,
    config.bodyText,
    config.headerTitle,
    config.subheaderTitle,
    config.bodyFontSizePt,
    config.tableFontSizePt,
    config.headerFontSizePt,
    config.subheaderFontSizePt,
    config.lineHeight,
    config.letterSpacingMm,
    config.marginMm,
    config.size,
    config.fontFamily,
    config.logoUrl,
    config.logoWidthMm,
    config.logoPosition,
    config.logoVerticalAlign,
    config.bodyImages,
    config.borderWidthPx,
    config.textAlign,
    config.boldKeywords,
    measureOverflow,
  ]);

  // Typography styles are laid out at real export scale. Preview zoom is only a visual transform,
  // which keeps line wrapping and overflow detection synchronized with the PDF.
  const lineHeightEm = config.lineHeight;
  const trackingMm = config.letterSpacingMm || 0;

  // Logo dimensions
  const logoWidthMm = config.logoWidthMm || 12;
  const logoWidthPx = logoWidthMm * PX_PER_CM * 0.1; // mm→cm→px
  const logoPosition = config.logoPosition || 'left';
  const logoVerticalAlign = config.logoVerticalAlign || 'body';
  const hasSideLogo = !!config.logoUrl && (logoPosition === 'left' || logoPosition === 'right') && logoVerticalAlign !== 'titles-top';
  const hasTopLogo = !!config.logoUrl && logoPosition === 'top-center';
  const hasTitlesLogo = !!config.logoUrl && (logoPosition === 'left' || logoPosition === 'right') && logoVerticalAlign === 'titles-top';

  // Render titles
  const renderTitles = () => {
    const titles: React.ReactNode[] = [];
    if (config.headerTitle) {
      titles.push(
        <div
          key="header"
          data-edit-target="headerTitle"
          style={{
            fontFamily: getBoldFontList(config.fontFamily),
            fontSize: `${config.headerFontSizePt}pt`,
            fontWeight: 700,
            textAlign: 'center',
            lineHeight: 1.2,
            marginBottom: '1.5pt',
            wordBreak: 'break-word',
          }}
        >
          {renderTextWithLineBreaks(config.headerTitle)}
        </div>,
      );
    }
    if (config.subheaderTitle) {
      titles.push(
        <div
          key="subheader"
          data-edit-target="subheaderTitle"
          style={{
            fontFamily: getBoldFontList(config.fontFamily),
            fontSize: `${config.subheaderFontSizePt}pt`,
            fontWeight: 700,
            textAlign: 'center',
            lineHeight: 1.2,
            marginBottom: '1.5pt',
            wordBreak: 'break-word',
          }}
        >
          {renderTextWithLineBreaks(config.subheaderTitle)}
        </div>,
      );
    }
    return titles.length > 0 ? <>{titles}</> : null;
  };

  // Render body text
  const tableFontSizePt = getTableFontSizePt(config);
  const usedBodyImageIds = new Set<string>();
  const maxBodyImageWidthMm = Math.max(4, (config.size.widthCm * 10) - (config.marginMm * 2));
  const bodyContent = parseBodyText(
    config.bodyText,
    config.boldKeywords,
    config.fontFamily,
    tableFontSizePt,
    config.bodyImages || [],
    usedBodyImageIds,
    maxBodyImageWidthMm,
  );
  const trailingBodyImages = (config.bodyImages || []).filter((image) => !usedBodyImageIds.has(image.id));

  // Text wrapper for side logo (float-based)
  const renderSideLogo = () => {
    if (!hasSideLogo || !config.logoUrl) return null;
    const floatDir = logoPosition === 'left' ? 'left' : 'right';
    return (
      <img
        src={config.logoUrl}
        alt="Logo"
        data-edit-target="logo"
        style={{
              float: floatDir,
              width: `${logoWidthPx}px`,
              height: 'auto',
              margin: logoPosition === 'left'
                ? `0 ${2.5 * PX_PER_CM * 0.1}px ${1 * PX_PER_CM * 0.1}px 0`
                : `0 0 ${1 * PX_PER_CM * 0.1}px ${2.5 * PX_PER_CM * 0.1}px`,
          filter: config.grayscaleLogo ? 'grayscale(100%)' : undefined,
          display: 'block',
          objectFit: 'contain',
        }}
      />
    );
  };

  const funeral = config.funeral;
  const funeralLogoPosition = funeral?.logoPosition || 'top-center';
  const funeralLogoWithPayer = funeral?.logoAlignment === 'payer';
  const funeralLogoAtBottom = funeralLogoPosition === 'bottom-center';
  const renderFuneralCross = () => {
    if (!funeral?.crossEnabled) return null;
    const height = funeral.crossHeightMm ?? 6;
    return <span style={{ display: 'inline-flex', flexShrink: 0, padding: `${funeral.crossInsetMm ?? 0}mm`, transform: config.logoUrl ? `translateY(${funeral.logoOffsetYMm || 0}mm)` : undefined, lineHeight: 0 }}>
      <svg data-funeral-cross="true" role="img" aria-label="Cruz" viewBox="0 0 60 100" style={{ width: `${height * 0.6}mm`, height: `${height}mm`, overflow: 'visible' }}>
        <path d="M30 3V97 M3 32H57" fill="none" stroke="black" strokeWidth={`${funeral.crossStrokePt ?? 0.5}pt`} vectorEffect="non-scaling-stroke" />
      </svg>
    </span>;
  };
  const renderFuneralLogo = () => {
    if (!config.logoUrl || !funeral) return null;
    const offsetX = funeral.logoOffsetXMm || 0;
    const offsetY = funeral.logoOffsetYMm || 0;
    return <div data-funeral-logo="true" style={{
      position: 'relative',
      textAlign: funeralLogoPosition === 'left' ? 'left' : funeralLogoPosition === 'right' ? 'right' : 'center',
      padding: `${Math.abs(offsetY)}mm ${Math.abs(offsetX)}mm`,
      marginTop: funeralLogoAtBottom ? `${funeral.logoGapMm ?? 0.7}mm` : 0,
      marginBottom: funeralLogoAtBottom ? 0 : `${funeral.logoGapMm ?? 0.7}mm`,
      lineHeight: 0,
    }}>
      {funeral.crossEnabled && <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', lineHeight: 0 }}>
        {renderFuneralCross()}
      </div>}
      <div style={{ display: 'inline-block', maxWidth: '100%', minWidth: 0 }}>
      <img src={config.logoUrl} alt="Logo" onLoad={measureOverflow} style={{
        width: `${logoWidthPx}px`, maxWidth: '100%', height: 'auto', display: 'inline-block',
        transform: `translate(${offsetX}mm, ${offsetY}mm)`,
        filter: config.grayscaleLogo ? 'grayscale(100%)' : undefined,
      }} />
      </div>
    </div>;
  };

  // Border
  const borderWidth = Math.max(0.2, config.borderWidthPx || 0.5);

  return (
    <div
      ref={canvasRef}
      data-notice-canvas="true"
      style={{
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        position: 'relative',
        overflow: 'hidden',
        boxSizing: 'border-box',
        border: `${borderWidth}px solid ${config.funeral?.borderColor || 'black'}`,
        background: 'white',
        color: 'black',
        transform: zoomScale === 1 ? undefined : `scale(${zoomScale})`,
        transformOrigin: 'top left',
      }}
    >
      {config.noticeType === 'funeral' && config.funeral && <div style={{ position: 'absolute', inset: `${config.funeral.borderGapMm * 3.7795 + borderWidth}px`, border: `${borderWidth}px solid ${config.funeral.borderColor}`, pointerEvents: 'none' }} />}
      {/* 3mm Margin Guide */}
      {showMarginGuides && (
        <div
          style={{
            position: 'absolute',
            top: `${marginPx}px`,
            left: `${marginPx}px`,
            right: `${marginPx}px`,
            bottom: `${marginPx}px`,
            border: '1px dashed rgba(220, 38, 38, 0.5)',
            pointerEvents: 'none',
            zIndex: 20,
          }}
          title={`Guía de margen (${config.marginMm} mm)`}
        />
      )}

      {/* Content area with padding (margin) */}
      <div
        ref={contentRef}
        data-notice-content="true"
        style={{
          position: 'absolute',
          display: config.noticeType === 'funeral' ? 'flex' : undefined,
          flexDirection: config.noticeType === 'funeral' ? 'column' : undefined,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          padding: `${marginPx + (config.noticeType === 'funeral' ? (config.funeral?.borderGapMm || 0) * 3.7795 + borderWidth : 0)}px`,
          boxSizing: 'border-box',
          fontFamily: config.fontFamily,
          fontSize: `${config.bodyFontSizePt}pt`,
          lineHeight: lineHeightEm,
          letterSpacing: `${trackingMm * PX_PER_CM * 0.1}px`,
          textAlign: config.textAlign,
          overflow: 'hidden',
          hyphens: 'none',
          WebkitHyphens: 'none' as any,
          color: 'black',
        }}
      >
        {config.noticeType === 'funeral' && config.funeral ? <div style={{ margin: config.funeral.crossEnabled && !config.logoUrl ? '0' : 'auto 0', textAlign: 'center', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', letterSpacing: `${trackingMm * 3.7795}px` }}>
          {!config.logoUrl && config.funeral.crossEnabled && <div style={{ textAlign: 'left', marginBottom: `${config.funeral.blockGapMm}mm` }}>{renderFuneralCross()}</div>}
          {!funeralLogoWithPayer && !funeralLogoAtBottom && renderFuneralLogo()}
          <div style={{ width: funeralLogoWithPayer ? 'fit-content' : undefined, maxWidth: '100%', margin: '0 auto', marginBottom: `${config.funeral.blockGapMm}mm` }}>
            {funeralLogoWithPayer && !funeralLogoAtBottom && renderFuneralLogo()}
            <div style={{ fontWeight: 700, fontSize: `${config.headerFontSizePt}pt` }}>{config.funeral.payer}</div>
            {funeralLogoWithPayer && funeralLogoAtBottom && renderFuneralLogo()}
          </div>
          <div style={{ fontStyle: 'italic', marginBottom: `${config.funeral.blockGapMm}mm` }}>{config.funeral.introduction}</div>
          <div style={{ fontWeight: 700, fontSize: `${config.subheaderFontSizePt}pt`, marginBottom: `${config.funeral.blockGapMm}mm` }}>{config.funeral.deceased}</div>
          <div style={{ fontStyle: 'italic' }}>{config.funeral.condolences}</div>
          {!funeralLogoWithPayer && funeralLogoAtBottom && renderFuneralLogo()}
        </div> : <>
        {/* Top-center logo */}
        {hasTopLogo && (
          <div style={{ textAlign: 'center', marginBottom: '1.5pt' }}>
            <img
              src={config.logoUrl!}
              alt="Logo"
              data-edit-target="logo"
              style={{
                width: `${logoWidthPx}px`,
                height: 'auto',
                filter: config.grayscaleLogo ? 'grayscale(100%)' : undefined,
                display: 'inline-block',
                objectFit: 'contain',
              }}
            />
          </div>
        )}

        {/* Titles-only logo (left/right aligned with titles) */}
        {hasTitlesLogo && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: `${2.5 * PX_PER_CM * 0.1}px`,
            marginBottom: '1.5pt',
            flexDirection: logoPosition === 'right' ? 'row-reverse' : 'row',
          }}>
            <img
              src={config.logoUrl!}
              alt="Logo"
              data-edit-target="logo"
              style={{
              width: `${logoWidthPx}px`,
              height: 'auto',
              filter: config.grayscaleLogo ? 'grayscale(100%)' : undefined,
              flexShrink: 0,
                objectFit: 'contain',
              }}
            />
            <div style={{ flex: 1, textAlign: 'center' }}>
              {renderTitles()}
            </div>
          </div>
        )}

        {/* Normal titles (no logo or top-center logo) */}
        {!hasTitlesLogo && renderTitles()}

        {/* Body text with optional side logo float */}
        <div style={{ position: 'relative' }}>
          {renderSideLogo()}
          <div data-edit-target="bodyText" style={{ wordBreak: 'break-word' }}>
            {bodyContent}
          </div>
          {/* Body images */}
          {trailingBodyImages.length > 0 && (
            <div style={{ marginTop: '2pt' }}>
              {trailingBodyImages.map((img) => (
                <React.Fragment key={img.id}>
                  {renderBodyImage(img, maxBodyImageWidthMm)}
                </React.Fragment>
              ))}
            </div>
          )}
          {hasSideLogo && <div style={{ clear: 'both' }} />}
        </div>
        </>}
      </div>
    </div>
  );
};
