/**
 * Table markup shared by the canvas (preview + Puppeteer PDF), the WeasyPrint
 * renderer on the server, the paste cleaner and the table editor.
 *
 * A table lives in the body text as a block, with optional settings on the opening line:
 *
 *   ##table encabezado=no ancho=completo alinear=izq,centro,der
 *   Nombre | Cédula | Valor
 *   ##/table
 *
 * Cells are separated by `|` (a literal pipe is written `\|`); the editor writes rows as `| a | b |`. Older blocks that use
 * tabs, or commas when there is neither a pipe nor a tab, are still read.
 */

export type TableAlign = 'left' | 'center' | 'right';

export interface TableModel {
  /** Rectangular grid; when `header` is true, rows[0] is the header row. */
  rows: string[][];
  header: boolean;
  width: 'auto' | 'full';
  /** One entry per column. */
  align: TableAlign[];
}

export interface TableBlock {
  index: number;
  /** Offsets of the whole block (from `##table` to the end of `##/table`) in the text. */
  start: number;
  end: number;
  model: TableModel;
}

export const MAX_TABLE_COLUMNS = 12;
export const MAX_TABLE_ROWS = 100;

/** Matches a whole block: group 1 = settings on the opening line, group 2 = rows. */
export const TABLE_BLOCK_SOURCE = String.raw`##table([^\n]*)\r?\n([\s\S]*?)##\/table`;
export const createTableBlockRegex = () => new RegExp(TABLE_BLOCK_SOURCE, 'g');

const ALIGN_TO_WORD: Record<TableAlign, string> = { left: 'izq', center: 'centro', right: 'der' };
const WORD_TO_ALIGN: Record<string, TableAlign> = {
  izq: 'left', izquierda: 'left', left: 'left',
  centro: 'center', center: 'center',
  der: 'right', derecha: 'right', right: 'right',
};

/** Default alignment, matching how tables always rendered: first column left, the rest centered. */
export const defaultAlign = (columns: number): TableAlign[] =>
  Array.from({ length: columns }, (_, i) => (i === 0 ? 'left' : 'center'));

export function createEmptyTable(columns = 3, rows = 3): TableModel {
  return {
    rows: Array.from({ length: rows }, () => Array.from({ length: columns }, () => '')),
    header: true,
    width: 'auto',
    align: defaultAlign(columns),
  };
}

/** A row wrapped in outer pipes: "| a | b |" (the trailing pipe must not be an escaped `\|`). */
const isFramedRow = (line: string) => {
  const trimmed = line.trim();
  return trimmed.length >= 2 && trimmed.startsWith('|') && trimmed.endsWith('|') && !trimmed.endsWith('\\|');
};

/** Split on `|` that is not escaped as `\|`, then unescape. `framed` drops the outer pipes. */
function splitPipes(line: string, framed: boolean): string[] {
  let trimmed = line.trim();
  if (framed) trimmed = trimmed.slice(1, -1);
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === '\\' && trimmed[i + 1] === '|') {
      current += '|';
      i += 1;
    } else if (ch === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** Make every row the same length and cap the size. */
function normalizeGrid(rows: string[][]): string[][] {
  const limited = rows.slice(0, MAX_TABLE_ROWS);
  const columns = Math.min(MAX_TABLE_COLUMNS, Math.max(1, ...limited.map((row) => row.length)));
  return limited.map((row) => Array.from({ length: columns }, (_, i) => row[i] ?? ''));
}

function parseOptions(optionsLine: string, columns: number) {
  let header = true;
  let width: TableModel['width'] = 'auto';
  let align = defaultAlign(columns);
  for (const token of optionsLine.trim().split(/\s+/).filter(Boolean)) {
    const [rawKey, rawValue = ''] = token.split('=');
    const key = rawKey.toLowerCase();
    const value = rawValue.toLowerCase();
    if (key === 'encabezado') header = !['no', 'false', '0'].includes(value);
    else if (key === 'ancho') width = value === 'completo' || value === 'full' ? 'full' : 'auto';
    else if (key === 'alinear') {
      const parsed = value.split(',').map((word) => WORD_TO_ALIGN[word.trim()]);
      align = align.map((fallback, i) => parsed[i] ?? fallback);
    }
  }
  return { header, width, align };
}

/** Parse the settings line and the rows of a `##table` block. */
export function parseTableBlock(optionsLine: string, content: string): TableModel | null {
  const lines = content.replace(/\r\n?/g, '\n').split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) return null;

  const block = lines.join('\n');
  let rows: string[][];
  if (block.includes('|')) {
    // Framed rows ("| a | b |", what the editor writes) only when every row is framed,
    // so older blocks such as "| x" (empty first cell) keep their columns.
    const framed = lines.every(isFramedRow);
    rows = lines.map((line) => splitPipes(line, framed));
  } else if (block.includes('\t')) {
    rows = lines.map((line) => line.split('\t').map((cell) => cell.trim()));
  } else if (block.includes(',')) {
    // Legacy: comma-separated blocks written before pipes were the norm.
    rows = lines.map((line) => line.split(',').map((cell) => cell.trim()));
  } else {
    rows = lines.map((line) => [line.trim()]);
  }

  const grid = normalizeGrid(rows);
  return { rows: grid, ...parseOptions(optionsLine, grid[0].length) };
}

const escapeCell = (cell: string) => cell.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();

/** Write a model as a `##table … ##/table` block (settings only when they differ from the defaults). */
export function serializeTable(model: TableModel): string {
  const grid = normalizeGrid(model.rows);
  const columns = grid[0]?.length ?? 1;
  const align = Array.from({ length: columns }, (_, i) => model.align[i] ?? defaultAlign(columns)[i]);
  const options: string[] = [];
  if (!model.header) options.push('encabezado=no');
  if (model.width === 'full') options.push('ancho=completo');
  if (align.some((value, i) => value !== defaultAlign(columns)[i])) {
    options.push(`alinear=${align.map((value) => ALIGN_TO_WORD[value]).join(',')}`);
  }
  const opening = options.length ? `##table ${options.join(' ')}` : '##table';
  // Outer pipes keep empty first/last cells unambiguous.
  const body = grid.map((row) => `| ${row.map(escapeCell).join(' | ')} |`).join('\n');
  return `${opening}\n${body}\n##/table`;
}

export function findTableBlocks(text: string): TableBlock[] {
  const blocks: TableBlock[] = [];
  const re = createTableBlockRegex();
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const model = parseTableBlock(match[1], match[2]);
    if (model) blocks.push({ index: blocks.length, start: match.index, end: match.index + match[0].length, model });
  }
  return blocks;
}

/**
 * The table block containing the cursor, if any. A cursor right after `##/table`
 * is outside the block (that is where a new table would be inserted).
 */
export function tableAt(text: string, cursor: number): TableBlock | null {
  return findTableBlocks(text).find((block) => cursor >= block.start && cursor < block.end) ?? null;
}

/**
 * Split tab-separated text into rows and cells the way spreadsheets write it: a cell that
 * contains line breaks, tabs or quotes is wrapped in quotes (with "" for a literal quote).
 * Line breaks inside a cell become spaces, since a ##table row is a single line.
 */
function splitTabSeparated(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let atCellStart = true;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch === '\n' || ch === '\r' ? ' ' : ch;
      continue;
    }
    if (ch === '"' && atCellStart) { quoted = true; atCellStart = false; continue; }
    if (ch === '\t') { row.push(cell); cell = ''; atCellStart = true; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = ''; atCellStart = true;
      continue;
    }
    cell += ch;
    atCellStart = false;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((cells) => cells.map((value) => value.replace(/\s+/g, ' ').trim()));
}

/**
 * Detect a table copied from Excel, Google Sheets or Word (plain text, tab-separated).
 * Returns the grid, or null when the text does not look like a table.
 */
export function parseClipboardTable(text: string): string[][] | null {
  if (!text || !text.includes('\t')) return null;
  const rows = splitTabSeparated(text).filter((row) => row.some((cell) => cell !== ''));
  if (rows.length < 2) return null;
  // Every row of a copied table has several cells; prose with one stray tab does not qualify.
  if (!rows.every((row) => row.length >= 2)) return null;
  const grid = dropEmptyColumns(rows);
  if (Math.max(...grid.map((row) => row.length)) < 2) return null;
  return normalizeGrid(grid);
}

/** Drop columns that are empty in every row (spreadsheets often add trailing ones). */
function dropEmptyColumns(rows: string[][]): string[][] {
  const width = Math.max(0, ...rows.map((row) => row.length));
  const keep = Array.from({ length: width }, (_, i) => rows.some((row) => (row[i] ?? '').trim() !== ''));
  return rows.map((row) => row.filter((_, i) => keep[i]));
}

export interface SourceCell {
  text: string;
  colspan?: number;
  rowspan?: number;
}

/**
 * Lay out HTML table cells (from Excel/Word/Sheets clipboard HTML) on a grid, honoring
 * colspan/rowspan: the text goes in the first position and merged positions stay empty.
 * Empty columns and leading/trailing empty rows are removed. Returns null if nothing is left.
 */
export function buildGrid(sourceRows: SourceCell[][]): string[][] | null {
  const grid: (string | undefined)[][] = [];
  sourceRows.slice(0, MAX_TABLE_ROWS).forEach((cells, r) => {
    grid[r] ??= [];
    let c = 0;
    for (const cell of cells) {
      while (grid[r][c] !== undefined) c += 1;
      const colspan = Math.max(1, Math.min(MAX_TABLE_COLUMNS, Math.floor(cell.colspan ?? 1)));
      const rowspan = Math.max(1, Math.min(sourceRows.length - r, Math.floor(cell.rowspan ?? 1)));
      for (let dr = 0; dr < rowspan; dr += 1) {
        grid[r + dr] ??= [];
        for (let dc = 0; dc < colspan; dc += 1) {
          grid[r + dr][c + dc] = dr === 0 && dc === 0 ? cell.text.trim() : '';
        }
      }
      c += colspan;
    }
  });

  let rows = dropEmptyColumns(grid.slice(0, MAX_TABLE_ROWS).map((row) => Array.from(row ?? [], (cell) => cell ?? '')));
  const isEmpty = (row: string[]) => row.every((cell) => cell.trim() === '');
  while (rows.length && isEmpty(rows[0])) rows = rows.slice(1);
  while (rows.length && isEmpty(rows[rows.length - 1])) rows = rows.slice(0, -1);
  if (rows.length === 0 || rows[0].length === 0) return null;
  return normalizeGrid(rows);
}

/** A model with the default settings (header row, auto width, default alignment) for a grid. */
export const tableFromGrid = (rows: string[][]): TableModel => ({
  rows,
  header: true,
  width: 'auto',
  align: defaultAlign(rows[0]?.length ?? 1),
});
