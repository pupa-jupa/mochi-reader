import { describe, expect, it, vi } from 'vitest';

import type { DesktopBridge } from '../app/bridge';
import { createLibraryStore } from './libraryStore';

function bridgeFixture(): DesktopBridge {
  return {
    listWorks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getWork: vi.fn(),
    importPaths: vi.fn().mockResolvedValue({ items: [], imported: 0, failed: 0 }),
    removeFromLibrary: vi.fn(),
    setFavorite: vi.fn(),
    setWorkStatus: vi.fn(),
    revealWorkSource: vi.fn(),
    updateWorkMetadata: vi.fn(),
    relinkWorkSource: vi.fn(),
    getReaderDocument: vi.fn(),
    getMangaManifest: vi.fn(),
    getMangaPage: vi.fn(),
    getPdfBytes: vi.fn(),
    getProgress: vi.fn(),
    saveProgress: vi.fn(),
    createBookmark: vi.fn(),
    listBookmarks: vi.fn(),
    deleteBookmark: vi.fn(),
    startReadingSession: vi.fn(),
    endReadingSession: vi.fn(),
    listHistory: vi.fn(),
    deleteHistoryEntry: vi.fn(),
    clearHistory: vi.fn(),
    listCollections: vi.fn(),
    getCollection: vi.fn(),
    createCollection: vi.fn(),
    addToCollection: vi.fn(),
    updateCollection: vi.fn(),
    removeFromCollection: vi.fn(),
    deleteCollection: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    listSources: vi.fn(),
    addBuiltInSource: vi.fn(),
    addSourceFromUrl: vi.fn(),
    importSourceProfile: vi.fn(),
    setSourceEnabled: vi.fn(),
    removeSource: vi.fn(),
    searchSource: vi.fn(),
    getSourceChapters: vi.fn(),
    getSourcePages: vi.fn(),
    getSourcePage: vi.fn(),
    downloadSourceChapter: vi.fn(),
    getCacheStats: vi.fn(),
    clearCache: vi.fn(),
    openLogDirectory: vi.fn(),
    copyDiagnosticInformation: vi.fn(),
    pickBookFiles: vi.fn().mockResolvedValue([]),
    pickFolder: vi.fn().mockResolvedValue(null),
  };
}

describe('library store', () => {
  it('loads the current query and exposes a settled empty page', async () => {
    const bridge = bridgeFixture();
    const store = createLibraryStore(bridge);

    store.getState().setQuery('moon');
    await store.getState().load();

    expect(bridge.listWorks).toHaveBeenCalledWith({
      query: 'moon',
      kinds: [],
      statuses: [],
      favorite: null,
      sort: 'added_desc',
      offset: 0,
      limit: 80,
    });
    expect(store.getState()).toMatchObject({ status: 'ready', total: 0, items: [] });
  });

  it('reloads the library after importing selected files', async () => {
    const bridge = bridgeFixture();
    vi.mocked(bridge.pickBookFiles).mockResolvedValue(['C:\\Books\\Moon.epub']);
    vi.mocked(bridge.importPaths).mockResolvedValue({
      imported: 1,
      failed: 0,
      items: [{ path: 'C:\\Books\\Moon.epub', workId: 'work-1', title: 'Moon', error: null }],
    });
    const store = createLibraryStore(bridge);

    await store.getState().importFiles();

    expect(bridge.importPaths).toHaveBeenCalledWith(['C:\\Books\\Moon.epub']);
    expect(bridge.listWorks).toHaveBeenCalledOnce();
    expect(store.getState().lastImport?.imported).toBe(1);
  });

  it('does not expose raw desktop bridge errors to the interface', async () => {
    const bridge = bridgeFixture();
    vi.mocked(bridge.listWorks).mockRejectedValue(
      new Error("Cannot read properties of undefined (reading 'invoke')"),
    );
    const store = createLibraryStore(bridge);

    await store.getState().load();

    expect(store.getState().error).toBe(
      'Не удалось связаться с desktop-частью приложения. Перезапусти Mochi Reader и попробуй снова.',
    );
    expect(store.getState().error).not.toContain('invoke');
  });

  it('toggles favorite state through the native library contract', async () => {
    const bridge = bridgeFixture();
    vi.mocked(bridge.setFavorite).mockResolvedValue(undefined);
    const store = createLibraryStore(bridge, {
      status: 'ready',
      total: 1,
      items: [
        {
          id: 'work-1',
          title: 'Moon',
          author: null,
          kind: 'book',
          format: 'epub',
          coverPath: null,
          status: 'planned',
          favorite: false,
          progressPercent: 0,
          missingFile: false,
          addedAt: '2026-08-30T00:00:00Z',
          lastOpenedAt: null,
        },
      ],
    });

    await store.getState().toggleFavorite('work-1');

    expect(bridge.setFavorite).toHaveBeenCalledWith('work-1', true);
    expect(store.getState().items[0]?.favorite).toBe(true);
  });

  it('reveals a work through the bridge owned by the store', async () => {
    const bridge = bridgeFixture();
    vi.mocked(bridge.revealWorkSource).mockResolvedValue(undefined);
    const store = createLibraryStore(bridge);

    await store.getState().revealSource('work-1');

    expect(bridge.revealWorkSource).toHaveBeenCalledWith('work-1');
    expect(store.getState().error).toBeNull();
  });

  it('loads the next library window without replacing already visible works', async () => {
    const bridge = bridgeFixture();
    vi.mocked(bridge.listWorks)
      .mockResolvedValueOnce({
        items: [{ id: 'work-1', title: 'One' }],
        total: 2,
      } as never)
      .mockResolvedValueOnce({
        items: [{ id: 'work-2', title: 'Two' }],
        total: 2,
      } as never);
    const store = createLibraryStore(bridge);

    await store.getState().load();
    await store.getState().loadMore();

    expect(bridge.listWorks).toHaveBeenNthCalledWith(2, {
      query: '',
      kinds: [],
      statuses: [],
      favorite: null,
      sort: 'added_desc',
      offset: 1,
      limit: 80,
    });
    expect(store.getState().items.map((item) => item.id)).toEqual(['work-1', 'work-2']);
  });
});
