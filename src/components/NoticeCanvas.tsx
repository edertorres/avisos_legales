import React, { useRef, useEffect, useCallback } from 'react';
import { BodyImage, NoticeConfig, OverflowStatus } from '../types';

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

/**
 * Parse body text with **bold** markdown and [align]...[/align] tags into React elements.
 */
interface TableData {
  headers: string[];
  rows: string[][];
}

/**
 * Auto-detect separator and split a line into cells.
 * Priority: pipe (|) > tab (\t) > comma (,)
 */
function splitTableRow(line: string, forceSeparator?: '|' | '\t' | ','): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  // Auto-detect: check which separator appears most
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
      // No separator found — single cell
      return [trimmed];
    }
  }

  // Split and trim
  return trimmed.split(forceSeparator).map((cell) => cell.trim());
}

/**
 * Parse a ##table ... ##/table block into structured data.
 * Supports pipe (|), tab (\t), or comma (,) separators — auto-detected.
 * First row = headers, remaining rows = data.
 */
function parseTableData(blockContent: string): TableData | null {
  const normalized = blockContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 1) return null;

  // Detect separator from the first non-empty line
  const firstLine = lines[0].trim();
  let sep: '|' | '\t' | ',' | undefined;
  if (firstLine.includes('|')) sep = '|';
  else if (firstLine.includes('\t')) sep = '\t';
  else if (firstLine.includes(',')) sep = ',';

  const headers = splitTableRow(lines[0], sep);
  if (headers.length === 0) return null;

  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitTableRow(lines[i], sep);
    if (cells.length > 0) rows.push(cells);
  }

  return { headers, rows };
}

/**
 * Render a parsed table as a React element with press-appropriate styling.
 */
function getTableFontSizePt(config: NoticeConfig): number {
  return config.tableFontSizePt ?? Number(Math.max(4, config.bodyFontSizePt * 0.85).toFixed(2));
}

function renderTable(data: TableData, fontFamily: string, tableFontSizePt: number): React.ReactNode {
  const colCount = data.headers.length;
  const cellPaddingH = 2;
  const cellPaddingV = 1;

  return (
    <table
      data-notice-table="true"
      style={{
        width: 'auto',
        maxWidth: '100%',
        borderCollapse: 'collapse',
        fontFamily,
        fontSize: `${tableFontSizePt}pt`,
        lineHeight: 1.15,
        margin: 0,
        tableLayout: 'auto',
        display: 'inline-table',
      }}
    >
      <thead>
        <tr>
          {data.headers.map((h, i) => (
            <th
              key={i}
              style={{
                border: '0.03px solid black',
                padding: `${cellPaddingV}px ${cellPaddingH}px`,
                textAlign: i === 0 ? 'left' : 'center',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.rows.map((row, ri) => (
          <tr key={ri}>
            {Array.from({ length: colCount }, (_, ci) => (
              <td
                key={ci}
                style={{
                  padding: `${cellPaddingV}px ${cellPaddingH}px`,
                  textAlign: ci === 0 ? 'left' : 'center',
                  border: '0.03px solid black',
                  whiteSpace: 'nowrap',
                }}
              >
                {row[ci] || ''}
              </td>
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
    const alignRe = /\[(left|center|right|justify)\]([\s\S]*?)\[\/\1\]/gi;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = alignRe.exec(chunk)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <span key={`${keyPrefix}-pre-${lastIndex}`}>
            {renderInlineBold(chunk.slice(lastIndex, match.index), boldKeywords, fontFamily)}
          </span>,
        );
      }
      const align = match[1].toLowerCase();
      const content = match[2];
      parts.push(
        <span
          key={`${keyPrefix}-align-${match.index}`}
          style={{
            display: 'block',
            textAlign: align as React.CSSProperties['textAlign'],
          }}
        >
          {renderInlineBold(content, boldKeywords, fontFamily)}
        </span>,
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < chunk.length) {
      parts.push(
        <span key={`${keyPrefix}-post-${lastIndex}`}>
          {renderInlineBold(chunk.slice(lastIndex), boldKeywords, fontFamily)}
        </span>,
      );
    }

    return parts;
  };

  const blockRe = /##table[ \t]*\r?\n([\s\S]*?)##\/table|##image:([A-Za-z0-9_-]+)|##imagen:(\d+)/g;
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

    if (match[1] !== undefined) {
      const tableData = parseTableData(match[1]);
      if (tableData) {
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
            {renderTable(tableData, fontFamily, tableFontSizePt)}
          </div>,
        );
      }
    } else {
      const imageId = match[2];
      const imageSlot = match[3] ? parseInt(match[3], 10) : null;
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
 * This replaces the Typst SVG pipeline. The notice is rendered as a styled
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

  // Measure overflow via DOM — measure the content area, not the outer container
  const measureOverflow = useCallback(() => {
    const el = contentRef.current || canvasRef.current;
    if (!el) return;

    const scrollH = el.scrollHeight;
    const clientH = el.clientHeight;
    const isOverflowing = scrollH > clientH + 1; // 1px tolerance
    const overflowHeightPx = Math.max(0, scrollH - clientH);
    const overflowHeightPt = overflowHeightPx * (72 / 96);
    const overflowPercentage = isOverflowing
      ? Math.round((overflowHeightPt / (config.size.heightCm * PT_PER_CM)) * 100)
      : 0;
    const recommendedHeightCm = isOverflowing
      ? Number((config.size.heightCm + overflowHeightPt / PT_PER_CM + 0.3).toFixed(1))
      : config.size.heightCm;

    onOverflowStatusChange({
      isOverflowing,
      overflowHeightPx,
      overflowPercentage,
      recommendedHeightCm,
    });
  }, [config.size.heightCm, config.size.widthCm, onOverflowStatusChange]);

  // Re-measure on every content/style change
  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM is painted before measuring
    const raf = requestAnimationFrame(() => {
      measureOverflow();
    });
    return () => cancelAnimationFrame(raf);
  }, [
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
        alt="Logo"            style={{
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
        border: `${borderWidth}px solid black`,
        background: 'white',
        color: 'black',
        transform: zoomScale === 1 ? undefined : `scale(${zoomScale})`,
        transformOrigin: 'top left',
      }}
    >
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
          title="Guía de margen de seguridad (3 mm)"
        />
      )}

      {/* Content area with padding (margin) */}
      <div
        ref={contentRef}
        data-notice-content="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          padding: `${marginPx}px`,
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
        {/* Top-center logo */}
        {hasTopLogo && (
          <div style={{ textAlign: 'center', marginBottom: '1.5pt' }}>
            <img
              src={config.logoUrl!}
              alt="Logo"
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
          <div style={{ wordBreak: 'break-word' }}>
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
      </div>
    </div>
  );
};
