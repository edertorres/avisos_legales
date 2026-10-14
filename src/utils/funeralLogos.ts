import type { NoticeConfig } from '../types';
import type { FuneralRow } from './funeralImport';

export interface FuneralLogo { name: string; dataUrl: string }
export type LogoResolution =
  | { status: 'none'; dataUrl: null }
  | { status: 'missing' | 'duplicate'; dataUrl: null }
  | { status: 'ready'; dataUrl: string };

// Match the complete filename exactly (including case and extension).
export function resolveFuneralLogo(row: FuneralRow, logos: FuneralLogo[]): LogoResolution {
  const name = row.logoFile?.trim();
  if (!name) return { status: 'none', dataUrl: null };
  const matches = logos.filter(logo => logo.name === name);
  if (!matches.length) return { status: 'missing', dataUrl: null };
  if (matches.length > 1) return { status: 'duplicate', dataUrl: null };
  return { status: 'ready', dataUrl: matches[0].dataUrl };
}

export function funeralConfigForRow(design: NoticeConfig, row: FuneralRow, logos: FuneralLogo[]): NoticeConfig {
  return {
    ...design,
    // A template's legacy image must never leak into another advertiser's notice.
    logoUrl: resolveFuneralLogo(row, logos).status === 'ready'
      ? row.croppedLogoUrl || resolveFuneralLogo(row, logos).dataUrl
      : null,
    funeral: { ...design.funeral!, payer: row.payer, deceased: row.deceased, crossEnabled: row.crossEnabled === true },
  };
}

export function logoResolutionLabel(status: LogoResolution['status']): string {
  return { none: 'Sin logo', missing: 'Archivo pendiente', duplicate: 'Nombre duplicado', ready: 'Logo asignado' }[status];
}
