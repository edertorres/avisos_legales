import assert from 'node:assert/strict';
import test from 'node:test';
import { individualFuneralFilename } from '../src/utils/funeralFilenames';

test('usa el anunciante y conserva espacios y acentos', () => {
  assert.equal(individualFuneralFilename(' Empresa Gómez ', 0, new Set()), 'Empresa Gómez.pdf');
});
test('sin anunciante usa el consecutivo de la fila', () => {
  assert.equal(individualFuneralFilename('', 0, new Set()), 'aviso_funerario_001.pdf');
  assert.equal(individualFuneralFilename('  ', 12, new Set()), 'aviso_funerario_013.pdf');
});
test('resuelve colisiones sin perder avisos en el ZIP', () => {
  const used = new Set<string>();
  assert.equal(individualFuneralFilename('Empresa', 0, used), 'Empresa.pdf');
  assert.equal(individualFuneralFilename('empresa', 1, used), 'empresa_002.pdf');
  assert.equal(individualFuneralFilename('empresa_002', 2, used), 'empresa_002_002.pdf');
  assert.equal(used.size, 3);
});
test('evita caracteres de ruta y nombres reservados', () => {
  assert.equal(individualFuneralFilename('../Empresa/ABC', 0, new Set()), '-Empresa-ABC.pdf');
  assert.equal(individualFuneralFilename('CON', 0, new Set()), 'aviso_CON.pdf');
});
