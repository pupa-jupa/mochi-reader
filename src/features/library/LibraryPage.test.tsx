import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import type { DesktopBridge } from '../../app/bridge';
import { createLibraryStore } from '../../stores/libraryStore';
import { LibraryPage } from './LibraryPage';

describe('library page', () => {
  it('offers real file and folder imports in an empty library', async () => {
    const bridge: DesktopBridge = {
      listWorks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      getWork: vi.fn(),
      importPaths: vi.fn(),
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
      clearHistory: vi.fn(),
      listCollections: vi.fn(),
      createCollection: vi.fn(),
      addToCollection: vi.fn(),
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      listSources: vi.fn(),
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
      pickBookFiles: vi.fn(),
      pickFolder: vi.fn(),
    };
    const store = createLibraryStore(bridge, {
      status: 'ready',
      items: [],
      total: 0,
    });

    render(<MemoryRouter><LibraryPage store={store} /></MemoryRouter>);

    expect(screen.getByRole('button', { name: 'Добавить книги' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Добавить папку' })).toBeEnabled();
    expect(screen.getByText('Здесь пока тихо')).toBeVisible();
  });
});
