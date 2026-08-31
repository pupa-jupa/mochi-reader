import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

import type {
  ImportBatchResult,
  LibraryQuery,
  WorkDetails,
  WorkMetadataUpdate,
  WorkPage,
} from '../types/library';
import type { ReaderDocument } from '../types/reader';
import type { MangaManifest, MangaPageData } from '../types/manga';
import type {
  BookmarkDraft,
  BookmarkRecord,
  CollectionSummary,
  HistoryEntry,
  ProgressUpdate,
  ReadingProgress,
} from '../types/persistence';
import type { AppSettings } from '../types/settings';
import type { CacheStats } from '../types/cache';
import type {
  RemoteChapter,
  ChapterDownloadResult,
  RemotePage,
  RemoteSearchPage,
  SourceConfig,
} from '../types/sources';

export type InvokeFunction = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export function isDesktopRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export interface DesktopBridge {
  listWorks(query: LibraryQuery): Promise<WorkPage>;
  getWork(id: string): Promise<WorkDetails>;
  importPaths(paths: string[]): Promise<ImportBatchResult>;
  removeFromLibrary(id: string): Promise<void>;
  setFavorite(id: string, favorite: boolean): Promise<void>;
  setWorkStatus(id: string, status: WorkDetails['status']): Promise<void>;
  revealWorkSource(id: string): Promise<void>;
  updateWorkMetadata(id: string, metadata: WorkMetadataUpdate): Promise<WorkDetails>;
  relinkWorkSource(id: string, newPath: string): Promise<WorkDetails>;
  getReaderDocument(workId: string): Promise<ReaderDocument>;
  getMangaManifest(workId: string): Promise<MangaManifest>;
  getMangaPage(workId: string, index: number): Promise<MangaPageData>;
  getPdfBytes(workId: string): Promise<Uint8Array>;
  getProgress(workId: string): Promise<ReadingProgress | null>;
  saveProgress(update: ProgressUpdate): Promise<ReadingProgress>;
  createBookmark(draft: BookmarkDraft): Promise<string>;
  listBookmarks(): Promise<BookmarkRecord[]>;
  deleteBookmark(id: string): Promise<void>;
  startReadingSession(workId: string, chapterId?: string | null, pageIndex?: number | null): Promise<string>;
  endReadingSession(id: string, chapterId?: string | null, pageIndex?: number | null): Promise<void>;
  listHistory(limit?: number): Promise<HistoryEntry[]>;
  clearHistory(): Promise<void>;
  listCollections(): Promise<CollectionSummary[]>;
  createCollection(title: string, description?: string | null): Promise<string>;
  addToCollection(collectionId: string, workId: string): Promise<void>;
  getSettings(): Promise<AppSettings>;
  updateSettings(settings: AppSettings): Promise<void>;
  listSources(): Promise<SourceConfig[]>;
  addBuiltInSource(kind: 'mangadex'): Promise<SourceConfig>;
  addSourceFromUrl(url: string): Promise<SourceConfig>;
  importSourceProfile(profileJson: string): Promise<SourceConfig>;
  setSourceEnabled(id: string, enabled: boolean): Promise<void>;
  removeSource(id: string): Promise<void>;
  searchSource(sourceId: string, query: string, page: number): Promise<RemoteSearchPage>;
  getSourceChapters(sourceId: string, remoteId: string, mangaUrl: string): Promise<RemoteChapter[]>;
  getSourcePages(sourceId: string, chapterId: string, chapterUrl: string): Promise<RemotePage[]>;
  getSourcePage(sourceId: string, pageUrl: string, index: number): Promise<MangaPageData>;
  downloadSourceChapter(sourceId: string, chapterId: string, chapterUrl: string): Promise<ChapterDownloadResult>;
  getCacheStats(): Promise<CacheStats>;
  clearCache(includeDownloads?: boolean): Promise<CacheStats>;
  openLogDirectory(): Promise<void>;
  copyDiagnosticInformation(): Promise<void>;
  pickBookFiles(): Promise<string[]>;
  pickFolder(): Promise<string | null>;
}

const supportedExtensions = [
  'epub',
  'pdf',
  'fb2',
  'txt',
  'html',
  'htm',
  'md',
  'markdown',
  'cbz',
  'cbr',
  'zip',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'avif',
];

export function createDesktopBridge(invoke: InvokeFunction): DesktopBridge {
  return {
    listWorks: (request) => invoke<WorkPage>('list_works', { request }),
    getWork: (id) => invoke<WorkDetails>('get_work', { id }),
    importPaths: (paths) =>
      invoke<ImportBatchResult>('import_paths', {
        request: { paths, options: { copyIntoLibrary: false } },
      }),
    removeFromLibrary: (id) => invoke<void>('remove_from_library', { id }),
    setFavorite: (id, favorite) => invoke<void>('set_favorite', { id, favorite }),
    setWorkStatus: (id, status) => invoke<void>('set_work_status', { id, status }),
    revealWorkSource: (id) => invoke<void>('reveal_work_source', { id }),
    updateWorkMetadata: (id, metadata) =>
      invoke<WorkDetails>('update_work_metadata', { id, metadata }),
    relinkWorkSource: (id, newPath) =>
      invoke<WorkDetails>('relink_work_source', { id, newPath }),
    getReaderDocument: (workId) => invoke<ReaderDocument>('get_reader_document', { workId }),
    getMangaManifest: (workId) => invoke<MangaManifest>('get_manga_manifest', { workId }),
    getMangaPage: (workId, index) => invoke<MangaPageData>('get_manga_page', { workId, index }),
    async getPdfBytes(workId) {
      const response = await invoke<ArrayBuffer | Uint8Array | number[]>('get_pdf_bytes', { workId });
      if (response instanceof Uint8Array) return response;
      if (response instanceof ArrayBuffer) return new Uint8Array(response);
      return Uint8Array.from(response);
    },
    getProgress: (workId) => invoke<ReadingProgress | null>('get_progress', { workId }),
    saveProgress: (update) => invoke<ReadingProgress>('save_progress', { update }),
    createBookmark: (draft) => invoke<string>('create_bookmark', { draft }),
    listBookmarks: () => invoke<BookmarkRecord[]>('list_bookmarks'),
    deleteBookmark: (id) => invoke<void>('delete_bookmark', { id }),
    startReadingSession: (workId, chapterId = null, pageIndex = null) =>
      invoke<string>('start_reading_session', { workId, chapterId, pageIndex }),
    endReadingSession: (id, chapterId = null, pageIndex = null) =>
      invoke<void>('end_reading_session', { id, chapterId, pageIndex }),
    listHistory: (limit = 100) => invoke<HistoryEntry[]>('list_history', { limit }),
    clearHistory: () => invoke<void>('clear_history'),
    listCollections: () => invoke<CollectionSummary[]>('list_collections'),
    createCollection: (title, description = null) =>
      invoke<string>('create_collection', { title, description }),
    addToCollection: (collectionId, workId) =>
      invoke<void>('add_to_collection', { collectionId, workId }),
    getSettings: () => invoke<AppSettings>('get_settings'),
    updateSettings: (settings) => invoke<void>('update_settings', { settings }),
    listSources: () => invoke<SourceConfig[]>('list_sources'),
    addBuiltInSource: (kind) => invoke<SourceConfig>('add_builtin_source', { kind }),
    addSourceFromUrl: (url) => invoke<SourceConfig>('add_source_from_url', { url }),
    importSourceProfile: (profileJson) =>
      invoke<SourceConfig>('import_source_profile', { profileJson }),
    setSourceEnabled: (id, enabled) => invoke<void>('set_source_enabled', { id, enabled }),
    removeSource: (id) => invoke<void>('remove_source', { id }),
    searchSource: (sourceId, query, page) =>
      invoke<RemoteSearchPage>('search_source', { sourceId, query, page }),
    getSourceChapters: (sourceId, remoteId, mangaUrl) =>
      invoke<RemoteChapter[]>('get_source_chapters', { sourceId, remoteId, mangaUrl }),
    getSourcePages: (sourceId, chapterId, chapterUrl) =>
      invoke<RemotePage[]>('get_source_pages', { sourceId, chapterId, chapterUrl }),
    getSourcePage: (sourceId, pageUrl, index) =>
      invoke<MangaPageData>('get_source_page', { sourceId, pageUrl, index }),
    downloadSourceChapter: (sourceId, chapterId, chapterUrl) =>
      invoke<ChapterDownloadResult>('download_source_chapter', {
        sourceId,
        chapterId,
        chapterUrl,
      }),
    getCacheStats: () => invoke<CacheStats>('get_cache_stats'),
    clearCache: (includeDownloads = false) =>
      invoke<CacheStats>('clear_cache', { includeDownloads }),
    openLogDirectory: () => invoke<void>('open_log_directory'),
    copyDiagnosticInformation: () => invoke<void>('copy_diagnostic_information'),
    async pickBookFiles() {
      const selection = await open({
        multiple: true,
        directory: false,
        title: 'Добавить книги и мангу',
        filters: [{ name: 'Книги и манга', extensions: supportedExtensions }],
      });
      if (selection === null) return [];
      return Array.isArray(selection) ? selection : [selection];
    },
    async pickFolder() {
      const selection = await open({
        multiple: false,
        directory: true,
        title: 'Добавить папку',
      });
      return Array.isArray(selection) ? (selection[0] ?? null) : selection;
    },
  };
}

export const desktopBridge = createDesktopBridge(tauriInvoke);
