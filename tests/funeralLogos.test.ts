import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveFuneralLogo, funeralConfigForRow } from '../src/utils/funeralLogos';
import { DEFAULT_NOTICE_CONFIG } from '../src/data/samples';

const row = { payer: 'Empresa ABC', deceased: 'JUAN', logoFile: 'empresa-abc.png' };
const logo = { name: 'empresa-abc.png', dataUrl: 'data:image/png;base64,AA==' };

test('el nombre completo del archivo identifica el logo de cada anunciante', () => {
  assert.deepEqual(resolveFuneralLogo(row, [logo]), { status: 'ready', dataUrl: logo.dataUrl });
  assert.equal(resolveFuneralLogo({ ...row, logoFile: 'EMPRESA-ABC.png' }, [logo]).status, 'missing');
  assert.equal(resolveFuneralLogo({ ...row, logoFile: 'empresa-abc' }, [logo]).status, 'missing');
  assert.equal(resolveFuneralLogo({ ...row, logoFile: ' empresa-abc.png ' }, [logo]).status, 'ready');
});
test('distingue sin logo, archivo faltante y coincidencia duplicada', () => {
  assert.equal(resolveFuneralLogo({ ...row, logoFile: '' }, [logo]).status, 'none');
  assert.equal(resolveFuneralLogo({ payer: 'Familia', deceased: 'ANA' }, [logo]).status, 'none');
  assert.equal(resolveFuneralLogo(row, []).status, 'missing');
  assert.equal(resolveFuneralLogo(row, [logo, { ...logo, dataUrl: 'otra imagen' }]).status, 'duplicate');
  assert.equal(resolveFuneralLogo(row, [logo, { ...logo, name: 'otro.png' }]).status, 'ready');
});
test('las imágenes de plantillas antiguas no se heredan por otros anunciantes', () => {
  const design = { ...DEFAULT_NOTICE_CONFIG, logoUrl: 'logo de otro anunciante' };
  assert.equal(funeralConfigForRow(design, { ...row, logoFile: '' }, [logo]).logoUrl, null);
  assert.equal(funeralConfigForRow(design, row, []).logoUrl, null);
  assert.equal(funeralConfigForRow(design, row, [logo]).logoUrl, logo.dataUrl);
  assert.equal(design.logoUrl, 'logo de otro anunciante');
});

test('la cruz se activa por aviso y no se hereda de la plantilla', () => {
  const design = { ...DEFAULT_NOTICE_CONFIG, funeral: { payer: '', deceased: '', introduction: '', condolences: '', borderGapMm: 0.5, borderColor: '#000000', blockGapMm: 1, crossEnabled: true, crossHeightMm: 8 } };
  assert.equal(funeralConfigForRow(design, row, [logo]).funeral?.crossEnabled, false);
  const enabled = funeralConfigForRow(design, { ...row, crossEnabled: true }, [logo]);
  assert.equal(enabled.funeral?.crossEnabled, true);
  assert.equal(enabled.funeral?.crossHeightMm, 8);
});
