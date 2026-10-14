import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { parseCSV, rowsToNotices, readFuneralFile } from '../src/utils/funeralImport';

test('CSV admite BOM, nombres con comas, comillas escapadas y saltos de línea', () => {
  const rows = parseCSV('\uFEFFquien paga,fallecido\r\n"Familia, Pérez","ANA ""MARÍA"""\r\n"Empresa\nCentral",JUAN');
  assert.deepEqual(rowsToNotices(rows, 0, 1, true), [
    { payer: 'Familia, Pérez', deceased: 'ANA "MARÍA"' },
    { payer: 'Empresa\nCentral', deceased: 'JUAN' },
  ]);
});
test('CSV con punto y coma preserva vacíos para corregirlos en revisión', () => {
  assert.deepEqual(rowsToNotices(parseCSV('fallecido;quien paga\nJUAN;Empresa\nANA;\n;;'), 1, 0, true), [
    { payer: 'Empresa', deceased: 'JUAN' }, { payer: '', deceased: 'ANA' },
  ]);
});
test('importación sin encabezados conserva la primera fila', () => {
  assert.deepEqual(rowsToNotices([['Familia', 'ANA']], 0, 1, false), [{ payer: 'Familia', deceased: 'ANA' }]);
});
test('rechaza CSV truncado, columnas repetidas, lote vacío y lote excesivo', () => {
  assert.throws(() => parseCSV('"Familia,ANA'), /comillas sin cerrar/);
  assert.throws(() => rowsToNotices([['A', 'B']], 0, 0, false), /diferentes/);
  assert.throws(() => rowsToNotices([['A', 'B']], 0, 1, true), /no contiene/);
  assert.throws(() => rowsToNotices(Array.from({ length: 201 }, () => ['A', 'B']), 0, 1, false), /máximo/);
});

test('XLSX lee la primera hoja y permite mapear columnas en otro orden', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Avisos');
  sheet.addRow(['Fallecido', 'Quien paga', 'logo']);
  sheet.addRow(['MARÍA GÓMEZ', 'Familia Gómez', 'familia.png']);
  workbook.addWorksheet('Ignorar').addRow(['Otro', 'Dato']);
  const buffer = await workbook.xlsx.writeBuffer();
  const file = new File([new Uint8Array(buffer)], 'avisos.xlsx');
  const rows = await readFuneralFile(file);
  assert.deepEqual(rowsToNotices(rows, 1, 0, true), [{ payer: 'Familia Gómez', deceased: 'MARÍA GÓMEZ' }]);
  assert.deepEqual(rowsToNotices(rows, 1, 0, true, 2), [{ payer: 'Familia Gómez', deceased: 'MARÍA GÓMEZ', logoFile: 'familia.png' }]);
});

test('la columna opcional logo preserva el nombre completo y las celdas vacías', () => {
  const rows = parseCSV('anunciante;fallecido;logo\nEmpresa ABC;JUAN; empresa-abc.png \nFamilia Gómez;MARÍA;');
  assert.deepEqual(rowsToNotices(rows, 0, 1, true, 2), [
    { payer: 'Empresa ABC', deceased: 'JUAN', logoFile: 'empresa-abc.png' },
    { payer: 'Familia Gómez', deceased: 'MARÍA', logoFile: '' },
  ]);
  assert.throws(() => rowsToNotices(rows, 0, 1, true, 0), /columna del logo/);
});
