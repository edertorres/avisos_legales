import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGrid,
  createEmptyTable,
  findTableBlocks,
  parseClipboardTable,
  parseTableBlock,
  serializeTable,
  tableAt,
} from '../src/utils/tableMarkup';
import { cleanPastedText, cleanPastedTextPreservingReturns } from '../src/utils/textCleaner';

test('lee bloques antiguos con |, tabulador y coma como antes', () => {
  const pipes = parseTableBlock('', 'A | B | C\n1 | 2 | 3\n');
  assert.deepEqual(pipes?.rows, [['A', 'B', 'C'], ['1', '2', '3']]);
  assert.equal(pipes?.header, true);
  assert.deepEqual(pipes?.align, ['left', 'center', 'center']);

  assert.deepEqual(parseTableBlock('', 'A\tB\n1\t2')?.rows, [['A', 'B'], ['1', '2']]);
  assert.deepEqual(parseTableBlock('', 'A,B\n1,2')?.rows, [['A', 'B'], ['1', '2']]);
});

test('con | presente, las comas de los importes no parten celdas', () => {
  const model = parseTableBlock('', 'Concepto | Valor\nCuota | 1.234,56');
  assert.deepEqual(model?.rows[1], ['Cuota', '1.234,56']);
});

test('lee las opciones de la línea de apertura y completa filas cortas', () => {
  const model = parseTableBlock(' encabezado=no ancho=completo alinear=der,izq', 'a | b | c\nd');
  assert.equal(model?.header, false);
  assert.equal(model?.width, 'full');
  assert.deepEqual(model?.align, ['right', 'left', 'center']);
  assert.deepEqual(model?.rows[1], ['d', '', '']);
});

test('acepta filas con | al inicio y al final, y conserva celdas vacías', () => {
  assert.deepEqual(parseTableBlock('', '| A | B |\n| 1 | 2 |')?.rows, [['A', 'B'], ['1', '2']]);
  assert.deepEqual(parseTableBlock('', '|  |  |  |\n| a |  | c |')?.rows, [['', '', ''], ['a', '', 'c']]);
  // Bloque antiguo: una fila con celda inicial vacía no se confunde con el estilo enmarcado.
  assert.deepEqual(parseTableBlock('', 'A | B\n | x')?.rows, [['A', 'B'], ['', 'x']]);
});

test('una tabla vacía conserva sus columnas al escribirla y leerla', () => {
  const [block] = findTableBlocks(serializeTable(createEmptyTable(3, 2)));
  assert.deepEqual(block.model.rows, [['', '', ''], ['', '', '']]);
});

test('serializar y volver a leer conserva el modelo, incluidos | escapados y celdas vacías', () => {
  const model = {
    rows: [['Nombre', 'Nota'], ['Ana | Luis', ''], ['', 'x']],
    header: false,
    width: 'full' as const,
    align: ['center', 'right'] as const,
  };
  const block = serializeTable({ ...model, align: [...model.align] });
  assert.match(block, /^##table encabezado=no ancho=completo alinear=centro,der\n/);
  const [parsed] = findTableBlocks(`Texto\n${block}\nmás`);
  assert.deepEqual(parsed.model, { ...model, align: [...model.align] });
});

test('una tabla con valores por defecto se escribe sin opciones', () => {
  const block = serializeTable({ ...createEmptyTable(2, 2), rows: [['A', 'B'], ['1', '2']] });
  assert.equal(block, '##table\n| A | B |\n| 1 | 2 |\n##/table');
});

test('detecta tablas copiadas de Excel y Word, y descarta texto normal', () => {
  const excel = 'Nombre\tCédula\t\r\nAna\t1.234\t\r\n"Pérez, Luis"\t5.678\t\r\n';
  assert.deepEqual(parseClipboardTable(excel), [['Nombre', 'Cédula'], ['Ana', '1.234'], ['Pérez, Luis', '5.678']]);
  const word = 'Concepto\tValor\r\nCuota\t$ 50.000';
  assert.deepEqual(parseClipboardTable(word), [['Concepto', 'Valor'], ['Cuota', '$ 50.000']]);
  assert.equal(parseClipboardTable('Un párrafo normal.\nOtro párrafo.'), null);
  assert.equal(parseClipboardTable('Línea con\ttab suelto\nY otra sin tab'), null);
  assert.equal(parseClipboardTable('solo\tuna línea'), null);
});

test('localiza la tabla bajo el cursor', () => {
  const text = 'Intro\n##table\nA | B\n##/table\nFin\n##table ancho=completo\nC | D\n##/table';
  const blocks = findTableBlocks(text);
  assert.equal(blocks.length, 2);
  assert.equal(tableAt(text, text.indexOf('A |'))?.index, 0);
  assert.equal(tableAt(text, text.indexOf('C |'))?.model.width, 'full');
  assert.equal(tableAt(text, 2), null);
  // Justo después de ##/table el cursor está fuera: ahí se insertaría una tabla nueva.
  assert.equal(tableAt(text, text.length), null);
  assert.equal(tableAt(text, text.indexOf('##table'))?.index, 0);
});

test('el pegado y "Sin retornos" conservan un bloque con opciones', () => {
  const text = 'Texto\tcon tab\n##table ancho=completo alinear=izq,der\nA | B\n1 | 2\n##/table\nfin';
  for (const cleaned of [cleanPastedTextPreservingReturns(text), cleanPastedText(text)]) {
    const [block] = findTableBlocks(cleaned);
    assert.ok(block, cleaned);
    assert.equal(block.model.width, 'full');
    assert.deepEqual(block.model.align, ['left', 'right']);
    assert.deepEqual(block.model.rows, [['A', 'B'], ['1', '2']]);
  }
});

test('buildGrid respeta celdas combinadas (colspan y rowspan)', () => {
  const grid = buildGrid([
    [{ text: 'Titular', colspan: 2 }, { text: 'Valor', rowspan: 2 }],
    [{ text: 'Nombre' }, { text: 'Cédula' }],
    [{ text: 'Ana' }, { text: '1.234' }, { text: '$ 50.000' }],
  ]);
  assert.deepEqual(grid, [
    ['Titular', '', 'Valor'],
    ['Nombre', 'Cédula', ''],
    ['Ana', '1.234', '$ 50.000'],
  ]);
});

test('buildGrid quita columnas y filas vacías de los bordes y limita el tamaño', () => {
  assert.deepEqual(
    buildGrid([[{ text: '' }, { text: '' }], [{ text: 'A' }, { text: '' }, { text: 'B' }], [{ text: ' ' }]]),
    [['A', 'B']],
  );
  assert.equal(buildGrid([[{ text: '' }]]), null);
  const wide = buildGrid([Array.from({ length: 20 }, (_, i) => ({ text: `c${i}` }))]);
  assert.equal(wide?.[0].length, 12);
});

test('texto plano de Excel: una celda entre comillas con varias líneas queda en una sola celda', () => {
  const text = 'Nombre\tCédula\tValor\r\n"Ana\nPérez"\t1.234.567\t$ 50.000\r\nTotal\t\t$ 50.000\r\n';
  assert.deepEqual(parseClipboardTable(text), [
    ['Nombre', 'Cédula', 'Valor'],
    ['Ana Pérez', '1.234.567', '$ 50.000'],
    ['Total', '', '$ 50.000'],
  ]);
  assert.deepEqual(parseClipboardTable('Dice\tCita\r\nA\t"Él dijo ""sí"""\r\n')?.[1], ['A', 'Él dijo "sí"']);
});
