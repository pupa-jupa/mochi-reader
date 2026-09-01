import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';

import type { DesktopBridge } from '../../app/bridge';
import { createLibraryStore } from '../../stores/libraryStore';
import { LibraryPage } from './LibraryPage';

function bridgeFixture(): DesktopBridge {
  return {
    listWorks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getWork: vi.fn(),
    addRemoteWorkToLibrary: vi.fn(),
    findRemoteWork: vi.fn(),
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
    listAnnotations: vi.fn(),
    createAnnotation: vi.fn(),
    updateAnnotation: vi.fn(),
    deleteAnnotation: vi.fn(),
    copyText: vi.fn(),
    exportAnnotations: vi.fn(),
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
    previewOpdsCatalog: vi.fn(),
    addOpdsSource: vi.fn(),
    importOpdsBook: vi.fn(),
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
}

function LocationProbe() {
  return <output aria-label="Текущий маршрут">{useLocation().search}</output>;
}

describe('library page', () => {
  it('offers real file and folder imports in an empty library', async () => {
    const bridge = bridgeFixture();
    const store = createLibraryStore(bridge, {
      status: 'ready',
      items: [],
      total: 0,
    });

    render(<MemoryRouter><LibraryPage store={store} /></MemoryRouter>);

    expect(screen.getByRole('button', { name: 'Добавить книги' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Добавить папку' })).toBeEnabled();
    expect(screen.getByText('Библиотека пуста')).toBeVisible();
  });

  it('loads a route filter through the native query before pagination', async () => {
    const bridge = bridgeFixture();
    const store = createLibraryStore(bridge);

    render(
      <MemoryRouter initialEntries={['/library?filter=manga&sort=title_asc&q=moon']}>
        <LibraryPage store={store} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(bridge.listWorks).toHaveBeenCalledWith({
        query: 'moon',
        kinds: ['manga'],
        statuses: [],
        favorite: null,
        sort: 'title_asc',
        offset: 0,
        limit: 80,
      });
    });
  });

  it('stores a selected kind in the route instead of component-only state', async () => {
    const user = userEvent.setup();
    const bridge = bridgeFixture();
    const store = createLibraryStore(bridge, { status: 'ready' });

    render(
      <MemoryRouter initialEntries={['/library']}>
        <LibraryPage store={store} />
        <LocationProbe />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Манга' }));

    expect(screen.getByRole('status', { name: 'Текущий маршрут' })).toHaveTextContent(
      '?filter=manga',
    );
  });
});
