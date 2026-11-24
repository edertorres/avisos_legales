/**
 * Reads tables from the HTML that Excel, Google Sheets and Word put on the clipboard.
 * The HTML keeps the real structure (merged cells, cells with several lines, a table
 * among paragraphs) that the plain-text version loses. Browser-only (uses DOMParser).
 */
import { buildGrid, serializeTable, tableFromGrid, type SourceCell } from './tableMarkup';
import { cleanPastedTextPreservingReturns } from './textCleaner';

export type ClipboardContent =
  /** Only a table was copied (a range of cells, or a table on its own). */
  | { kind: 'table'; grid: string[][] }
  /** Text and table(s) together (e.g. part of a Word document): body text with ##table blocks. */
  | { kind: 'mixed'; text: string; grids: string[][][] };

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'TR', 'PRE',
]);

const isHidden = (el: Element) => /display\s*:\s*none/i.test(el.getAttribute('style') || '');

/** Text of a cell on one line: line breaks and paragraphs inside the cell become spaces. */
function cellText(cell: Element): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || '');
      return;
    }
    if (!(node instanceof Element) || isHidden(node)) return;
    if (node.tagName === 'BR') {
      parts.push(' ');
      return;
    }
    const block = BLOCK_TAGS.has(node.tagName);
    if (block) parts.push(' ');
    node.childNodes.forEach(walk);
    if (block) parts.push(' ');
  };
  cell.childNodes.forEach(walk);
  return parts.join('').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

function tableToGrid(table: HTMLTableElement): string[][] | null {
  const rows: SourceCell[][] = Array.from(table.rows)
    .filter((row) => !isHidden(row))
    .map((row) =>
      Array.from(row.cells)
        .filter((cell) => !isHidden(cell))
        .map((cell) => ({ text: cellText(cell), colspan: cell.colSpan, rowspan: cell.rowSpan })),
    );
  return buildGrid(rows);
}

/** Body text in reading order, with each table replaced by its ##table block. */
function documentToText(root: Element, gridFor: Map<Element, string[][] | null>): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push((node.textContent || '').replace(/\s+/g, ' '));
      return;
    }
    if (!(node instanceof Element) || isHidden(node)) return;
    if (node.tagName === 'BR') {
      parts.push('\n');
      return;
    }
    if (gridFor.has(node)) {
      const grid = gridFor.get(node);
      if (grid && grid[0].length >= 2) parts.push(`\n\n${serializeTable(tableFromGrid(grid))}\n\n`);
      // A one-column table reads better as plain lines.
      else if (grid) parts.push(`\n${grid.map((row) => row[0]).join('\n')}\n`);
      return;
    }
    const block = BLOCK_TAGS.has(node.tagName);
    if (block) parts.push('\n');
    node.childNodes.forEach(walk);
    if (block) parts.push('\n');
  };
  root.childNodes.forEach(walk);
  return cleanPastedTextPreservingReturns(parts.join(''));
}

/** Interpret the clipboard HTML. Returns null when it holds no usable table (use the plain text then). */
export function readClipboard(data: DataTransfer | null): ClipboardContent | null {
  const html = data?.getData('text/html') || '';
  if (!/<table[\s>]/i.test(html)) return null;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style, script, meta, link, title, xml').forEach((node) => node.remove());

  // Top-level tables only; a table nested in a cell contributes its text to that cell.
  const tables = Array.from(doc.querySelectorAll('table')).filter((table) => !table.parentElement?.closest('table'));
  const gridFor = new Map<Element, string[][] | null>(tables.map((table) => [table, tableToGrid(table)]));
  const grids = tables.map((table) => gridFor.get(table)).filter((grid): grid is string[][] => !!grid && grid[0].length >= 2);
  if (grids.length === 0) return null;

  // Text outside the tables decides between "just a table" and "text with tables".
  const outside = doc.body.cloneNode(true) as HTMLElement;
  outside.querySelectorAll('table').forEach((table) => table.remove());
  const hasOutsideText = (outside.textContent || '').replace(/ /g, ' ').trim().length > 0;

  if (!hasOutsideText && grids.length === 1) return { kind: 'table', grid: grids[0] };
  return { kind: 'mixed', text: documentToText(doc.body, gridFor), grids };
}
