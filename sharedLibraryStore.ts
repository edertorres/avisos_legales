import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SharedLibrary, SavedNotice, GeneratedLogEntry } from './src/types/sharedLibrary';
import { isSavedNotice, isGeneratedLogEntry } from './src/types/sharedLibrary';

interface StoredLibrary extends SharedLibrary {
  schemaVersion: 1;
  deletedNoticeIds: string[];
  deletedLogIds: string[];
}

/** One server process owns this file. Serialize writes and replace it atomically. */
export class SharedLibraryStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private directory: string) {}
  private get filename() { return path.join(this.directory, 'shared-library.json'); }

  private async read(): Promise<StoredLibrary> {
    try {
      const data = JSON.parse(await fs.readFile(this.filename, 'utf8'));
      if (data.schemaVersion !== 1 || !Array.isArray(data.savedNotices) || !data.savedNotices.every(isSavedNotice)
        || !Array.isArray(data.generatedLog) || !data.generatedLog.every(isGeneratedLogEntry)
        || !Array.isArray(data.deletedNoticeIds) || !Array.isArray(data.deletedLogIds)) {
        throw new Error('El archivo de biblioteca compartida no es válido.');
      }
      return data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return { schemaVersion: 1, savedNotices: [], generatedLog: [], deletedNoticeIds: [], deletedLogIds: [] };
    }
  }

  private publicData(data: StoredLibrary): SharedLibrary {
    return { savedNotices: data.savedNotices, generatedLog: data.generatedLog };
  }

  async get(): Promise<SharedLibrary> {
    await this.queue;
    return this.publicData(await this.read());
  }

  private mutate(update: (data: StoredLibrary) => void): Promise<SharedLibrary> {
    const operation = this.queue.then(async () => {
      const data = await this.read();
      update(data);
      data.generatedLog.sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt));
      const removed = data.generatedLog.splice(200);
      data.deletedLogIds.push(...removed.map(item => item.id));
      data.savedNotices.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      await fs.mkdir(this.directory, { recursive: true });
      const temporary = `${this.filename}.${randomUUID()}.tmp`;
      try {
        const file = await fs.open(temporary, 'wx', 0o600);
        try { await file.writeFile(JSON.stringify(data)); await file.sync(); }
        finally { await file.close(); }
        await fs.rename(temporary, this.filename);
      } finally { await fs.rm(temporary, { force: true }); }
      return this.publicData(data);
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  addNotice(item: SavedNotice) {
    return this.mutate(data => {
      if (!data.deletedNoticeIds.includes(item.id) && !data.savedNotices.some(existing => existing.id === item.id)) data.savedNotices.push(item);
    });
  }
  deleteNotice(id: string) {
    return this.mutate(data => {
      data.savedNotices = data.savedNotices.filter(item => item.id !== id);
      if (!data.deletedNoticeIds.includes(id)) data.deletedNoticeIds.push(id);
    });
  }
  addLog(item: GeneratedLogEntry) {
    return this.mutate(data => {
      if (!data.deletedLogIds.includes(item.id) && !data.generatedLog.some(existing => existing.id === item.id)) data.generatedLog.push(item);
    });
  }
  clearLog() {
    return this.mutate(data => {
      data.deletedLogIds.push(...data.generatedLog.map(item => item.id));
      data.generatedLog = [];
    });
  }
  migrate(library: SharedLibrary) {
    return this.mutate(data => {
      for (const item of library.savedNotices) {
        if (!data.deletedNoticeIds.includes(item.id) && !data.savedNotices.some(existing => existing.id === item.id)) data.savedNotices.push(item);
      }
      for (const item of library.generatedLog) {
        if (!data.deletedLogIds.includes(item.id) && !data.generatedLog.some(existing => existing.id === item.id)) data.generatedLog.push(item);
      }
    });
  }
}
