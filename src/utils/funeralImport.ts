import type { CropRect } from './logoCrop';

export interface FuneralRow { payer: string; deceased: string; logoFile?: string; crossEnabled?: boolean; croppedLogoUrl?: string; logoCrop?: CropRect }

export function parseCSV(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/)[0];
  const delimiter = (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || !cell.trim()) quoted = !quoted;
      else throw new Error('CSV inválido: comillas dentro de un campo sin delimitar.');
    } else if (!quoted && char === delimiter) { row.push(cell.trim()); cell = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) {
      row.push(cell.trim()); rows.push(row); row = []; cell = '';
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else cell += char;
  }
  if (quoted) throw new Error('CSV inválido: hay comillas sin cerrar.');
  row.push(cell.trim()); rows.push(row);
  return rows.filter(row => row.some(Boolean));
}

export function rowsToNotices(rows: string[][], payerColumn: number, deceasedColumn: number, hasHeader: boolean, logoColumn?: number): FuneralRow[] {
  if (payerColumn === deceasedColumn) throw new Error('Selecciona columnas diferentes para los dos nombres.');
  if (logoColumn !== undefined && (logoColumn === payerColumn || logoColumn === deceasedColumn)) throw new Error('La columna del logo debe ser distinta de las columnas de los nombres.');
  const notices = rows.slice(hasHeader ? 1 : 0).filter(row => row.some(cell => cell.trim())).map(row => ({
    payer: (row[payerColumn] || '').trim(), deceased: (row[deceasedColumn] || '').trim(),
    ...(logoColumn === undefined ? {} : { logoFile: (row[logoColumn] || '').trim() }),
  }));
  if (!notices.length) throw new Error('El archivo no contiene avisos.');
  if (notices.length > 200) throw new Error('Importa un máximo de 200 avisos por lote.');
  return notices;
}

export async function readFuneralFile(file: File): Promise<string[][]> {
  if (file.size > 10 * 1024 * 1024) throw new Error('El archivo supera 10 MB.');
  if (/\.csv$/i.test(file.name)) return parseCSV(await file.text());
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Selecciona un archivo XLSX o CSV.');
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('El libro no contiene hojas.');
  const rows: string[][] = [];
  sheet.eachRow(row => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => { cells[column - 1] = cell.text.trim(); });
    rows.push(Array.from({ length: cells.length }, (_, index) => cells[index] || ''));
  });
  return rows;
}
