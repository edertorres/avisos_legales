import type { NoticeConfig } from '../types';
export interface SavedNotice {
  id: string;
  name: string;
  config: NoticeConfig;
  createdAt: string;
  updatedAt: string;
}
export interface GeneratedLogEntry {
  id: string;
  generatedAt: string;
  title: string;
  filename: string;
  exportType: 'single-exact';
  config: NoticeConfig;
}
export interface SharedLibrary {
  savedNotices: SavedNotice[];
  generatedLog: GeneratedLogEntry[];
}
export function isNoticeConfig(value: unknown): value is NoticeConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Partial<NoticeConfig>;
  return typeof config.headerTitle === 'string' && typeof config.subheaderTitle === 'string'
    && typeof config.bodyText === 'string' && !!config.size
    && Number.isFinite(config.size.widthCm) && config.size.widthCm > 0
    && Number.isFinite(config.size.heightCm) && config.size.heightCm > 0;
}
const validId = (id: unknown) => typeof id === 'string' && /^[\w-]{1,160}$/.test(id);
const validDate = (date: unknown) => typeof date === 'string' && Number.isFinite(Date.parse(date));
export function isSavedNotice(value: unknown): value is SavedNotice {
  const item = value as SavedNotice | null;
  return !!item && validId(item.id) && typeof item.name === 'string' && !!item.name.trim()
    && validDate(item.createdAt) && validDate(item.updatedAt) && isNoticeConfig(item.config);
}
export function isGeneratedLogEntry(value: unknown): value is GeneratedLogEntry {
  const item = value as GeneratedLogEntry | null;
  return !!item && validId(item.id) && validDate(item.generatedAt) && typeof item.title === 'string'
    && typeof item.filename === 'string' && item.exportType === 'single-exact' && isNoticeConfig(item.config);
}
