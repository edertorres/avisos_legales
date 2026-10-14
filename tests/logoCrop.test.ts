import assert from 'node:assert/strict';
import test from 'node:test';
import { contentBounds } from '../src/utils/logoCrop';
import { funeralConfigForRow } from '../src/utils/funeralLogos';
import { DEFAULT_NOTICE_CONFIG } from '../src/data/samples';

test('detecta contenido entre márgenes blancos y transparentes, incluidos bordes', () => {
  const pixels = new Uint8ClampedArray(4 * 4 * 4).fill(255);
  pixels.set([0, 0, 0, 0], 0);
  pixels.set([0, 0, 0, 255], (1 * 4 + 2) * 4);
  pixels.set([40, 50, 60, 255], (3 * 4 + 3) * 4);
  assert.deepEqual(contentBounds(pixels, 4, 4), { x: 2, y: 1, width: 2, height: 3 });
  assert.equal(contentBounds(new Uint8ClampedArray(16).fill(255), 2, 2), null);
  assert.equal(contentBounds(new Uint8ClampedArray(16), 2, 2), null);
});
test('el recorte afecta solo a su fila y requiere un logo original válido', () => {
  const logo = { name: 'logo.png', dataUrl: 'original' };
  const row = { payer: '', deceased: 'Prueba', logoFile: 'logo.png' };
  assert.equal(funeralConfigForRow(DEFAULT_NOTICE_CONFIG, { ...row, croppedLogoUrl: 'recorte' }, [logo]).logoUrl, 'recorte');
  assert.equal(funeralConfigForRow(DEFAULT_NOTICE_CONFIG, row, [logo]).logoUrl, 'original');
  assert.equal(funeralConfigForRow(DEFAULT_NOTICE_CONFIG, { ...row, croppedLogoUrl: 'recorte' }, []).logoUrl, null);
  assert.equal(logo.dataUrl, 'original');
});
