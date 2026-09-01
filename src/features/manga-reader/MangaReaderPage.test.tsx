import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const longManifest: MangaManifest = {
  workId: 'manga-long',
  title: 'Long Panels',
  pages: Array.from({ length: 10 }, (_, index) => ({
    index,
    label: `${index + 1}.png`,
    mediaType: 'image/png',
  })),
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
    expect(screen.getByRole('button', { name: 'Вебтун' })).toBeEnabled();
    expect(await screen.findByRole('img', { name: 'Страница 1' })).toHaveAttribute('src', 'data:image/png;base64,AAAA');
  });

  it('persists page navigation through the reader bridge contract', async () => {
    const loadPage = vi.fn().mockImplementation(async (index: number) => ({
      index,
      dataUrl: 'data:image/png;base64,AAAA',
    }));
    const saveProgress = vi.fn().mockResolvedValue({});
    render(
      <MemoryRouter>
        <MangaReader loadPage={loadPage} manifest={manifest} saveProgress={saveProgress} />
      </MemoryRouter>,
    );

    await screen.findByRole('img', { name: 'Страница 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));

    await waitFor(() => {
      expect(saveProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          workId: 'manga-1',
          locator: { kind: 'manga', chapterId: null, pageIndex: 1 },
        }),
      );
    });
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

  it('supports fit-width, fit-height, and explicit zoom without conflicting states', async () => {
    const loadPage = vi.fn().mockResolvedValue({ index: 0, dataUrl: 'data:image/png;base64,AAAA' });
    const { container } = render(
      <MemoryRouter>
        <MangaReader initialPageIndex={0} loadPage={loadPage} manifest={manifest} />
      </MemoryRouter>,
    );

    await screen.findByRole('img', { name: 'Страница 1' });
    const viewport = container.querySelector<HTMLElement>('.manga-paged');
    expect(viewport).toHaveAttribute('data-fit', 'height');
    fireEvent.click(screen.getByRole('button', { name: 'Настройки манги' }));
    fireEvent.click(screen.getByRole('button', { name: 'По ширине' }));
    expect(viewport).toHaveAttribute('data-fit', 'width');
    fireEvent.click(screen.getByRole('button', { name: 'Увеличить' }));
    expect(viewport).toHaveAttribute('data-fit', 'custom');
    fireEvent.click(screen.getByRole('button', { name: 'По высоте' }));
    expect(viewport).toHaveAttribute('data-fit', 'height');
  });

  it('tracks the page at the center of the vertical reading viewport', async () => {
    const loadPage = vi.fn().mockImplementation(async (index: number) => ({
      index,
      dataUrl: `data:image/png;base64,${index}`,
    }));
    const saveProgress = vi.fn().mockResolvedValue({});
    const { container } = render(
      <MemoryRouter>
        <MangaReader initialPageIndex={0} loadPage={loadPage} manifest={manifest} saveProgress={saveProgress} />
      </MemoryRouter>,
    );

    await screen.findByRole('img', { name: 'Страница 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Вертикальная лента' }));
    const viewport = container.querySelector<HTMLElement>('.manga-vertical');
    const pages = container.querySelectorAll<HTMLElement>('[data-manga-page-index]');
    expect(viewport).not.toBeNull();
    expect(pages).toHaveLength(2);
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 800 });
    Object.defineProperty(viewport, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 600, bottom: 800, width: 600, height: 800 }),
    });
    Object.defineProperty(pages[0], 'getBoundingClientRect', {
      value: () => ({ left: 0, top: -780, right: 600, bottom: -20, width: 600, height: 760 }),
    });
    Object.defineProperty(pages[1], 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 40, right: 600, bottom: 800, width: 600, height: 760 }),
    });
    fireEvent.scroll(viewport!);

    await waitFor(() => {
      expect(saveProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          locator: { kind: 'manga', chapterId: null, pageIndex: 1 },
        }),
      );
    });
  });

  it('evicts distant page data instead of growing the cache without limit', async () => {
    const loadPage = vi.fn().mockImplementation(async (index: number) => ({
      index,
      dataUrl: `data:image/png;base64,page-${index}`,
    }));
    render(
      <MemoryRouter>
        <MangaReader loadPage={loadPage} manifest={longManifest} />
      </MemoryRouter>,
    );

    await screen.findByRole('img', { name: 'Страница 1' });
    fireEvent.change(screen.getByRole('slider', { name: 'Страница' }), { target: { value: '10' } });
    await screen.findByRole('img', { name: 'Страница 10' });
    fireEvent.change(screen.getByRole('slider', { name: 'Страница' }), { target: { value: '1' } });
    await screen.findByRole('img', { name: 'Страница 1' });

    expect(loadPage.mock.calls.filter(([index]) => index === 0)).toHaveLength(2);
  });
});
