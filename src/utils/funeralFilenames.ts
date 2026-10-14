/** Build safe, unique filenames so repeated advertisers cannot overwrite ZIP entries. */
export function individualFuneralFilename(payer: string, rowIndex: number, usedNames: Set<string>, logoFile?: string): string {
  const source = payer.trim() || (logoFile || '').trim().replace(/\.[^.]+$/, '');
  let name = source.normalize('NFC').trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 100).replace(/[.\s]+$/g, '');
  if (!name) name = `aviso_funerario_${String(rowIndex + 1).padStart(3, '0')}`;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `aviso_${name}`;
  let filename = `${name}.pdf`;
  let suffix = 2;
  while (usedNames.has(filename.toLocaleLowerCase('es'))) filename = `${name}_${String(suffix++).padStart(3, '0')}.pdf`;
  usedNames.add(filename.toLocaleLowerCase('es'));
  return filename;
}
