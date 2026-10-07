import { isSavedNotice, isGeneratedLogEntry, type SharedLibrary } from '../types/sharedLibrary';

export const SAVED_NOTICES_KEY = 'avisos.savedNotices.v1';
export const GENERATED_LOG_KEY = 'avisos.generatedLog.v1';

export async function requestSharedLibrary(endpoint = '', method = 'GET', body?: unknown): Promise<SharedLibrary> {
  const response = await fetch(`/api/library${endpoint}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('No se pudo acceder al guardado compartido. Intenta nuevamente.');
  const library = await response.json();
  if (!Array.isArray(library.savedNotices) || !library.savedNotices.every(isSavedNotice)
    || !Array.isArray(library.generatedLog) || !library.generatedLog.every(isGeneratedLogEntry)) {
    throw new Error('El servidor devolvió datos de guardado inválidos.');
  }
  return library;
}

export async function loadAndMigrateLibrary(): Promise<SharedLibrary> {
  const readLocal = (key: string): unknown[] => {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('No se pudieron migrar los datos locales. La copia local se conserva.');
    return parsed;
  };
  const notices = readLocal(SAVED_NOTICES_KEY);
  const history = readLocal(GENERATED_LOG_KEY);
  if (!notices.every(isSavedNotice) || !history.every(isGeneratedLogEntry)) {
    throw new Error('Hay datos locales inválidos. La copia local se conserva.');
  }
  if (notices.length || history.length) {
    const result = await requestSharedLibrary('/migrate', 'POST', { savedNotices: notices, generatedLog: history });
    localStorage.removeItem(SAVED_NOTICES_KEY);
    localStorage.removeItem(GENERATED_LOG_KEY);
    return result;
  }
  return requestSharedLibrary();
}
