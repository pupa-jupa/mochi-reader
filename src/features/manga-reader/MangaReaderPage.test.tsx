import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { MangaManifest } from '../../types/manga';
import { MangaReader } from './MangaReaderPage';

const manifest: MangaManifest = {
  workId: 'manga-1',
  title: 'Quiet Panels',
  pages: [
    { index: 0, label: '1.png', mediaType: 'image/png' },
    { index: 1, label: '2.png', mediaType: 'image/png' },
  ],
};

describe('manga reader', () => {
  it('loads the current page and exposes real display modes', async () => {
    const loadPage = vi.fn().mockResolvedValue({ index: 0, dataUrl: 'data:image/png;base64,AAAA' });
    render(
      <MemoryRouter>
        <MangaReader loadPage={loadPage} manifest={manifest} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Одна страница' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Вертикальная лента' })).toBeEnabled();
    expect(await screen.findByRole('img', { name: 'Страница 1' })).toHaveAttribute('src', 'data:image/png;base64,AAAA');
  });

  it('persists page navigation through the reader bridge contract', async () => {
    const loadPage = vi.fn().mockResolvedValue({ index: 0, dataUrl: 'data:image/png;base64,AAAA' });
    const saveProgress = vi.fn().mockResolvedValue({});
    render(
      <MemoryRouter>
        <MangaReader loadPage={loadPage} manifest={manifest} saveProgress={saveProgress} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));

    expect(saveProgress).toHaveBeenCalledWith(
      expect.objectContaining({ workId: 'manga-1', pageIndex: 1, readerMode: 'manga' }),
    );
  });

  it('saves a bookmark for the visible manga page', () => {
    const loadPage = vi.fn().mockResolvedValue({ index: 0, dataUrl: 'data:image/png;base64,AAAA' });
    const createBookmark = vi.fn().mockResolvedValue('bookmark-1');
    render(
      <MemoryRouter>
        <MangaReader createBookmark={createBookmark} initialPageIndex={0} loadPage={loadPage} manifest={manifest} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Добавить закладку' }));

    expect(createBookmark).toHaveBeenCalledWith(
      expect.objectContaining({ workId: 'manga-1', pageIndex: 0, note: null }),
    );
  });
});
