import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { DesktopBridge } from '../../app/bridge';
import { RemoteMangaDetailsPage } from './RemoteMangaDetailsPage';

describe('remote manga details page', () => {
  it('credits MangaDex and the chapter translation group', async () => {
    const bridge = {
      listSources: vi.fn().mockResolvedValue([
        {
          id: 'mangadex',
          name: 'MangaDex',
          baseUrl: 'https://api.mangadex.org',
          adapterKind: 'mangadex',
          enabled: true,
          capabilities: { search: true, download: false },
          createdAt: '2026-08-31T00:00:00Z',
          updatedAt: '2026-08-31T00:00:00Z',
        },
      ]),
      getSourceChapters: vi.fn().mockResolvedValue([
        {
          remoteId: 'chapter-1',
          title: 'Глава 1 · RU',
          url: 'https://mangadex.org/chapter/chapter-1',
          attribution: 'Moon Team',
        },
      ]),
    } as unknown as DesktopBridge;
    const parameters = new URLSearchParams({
      remoteId: 'moon',
      url: 'https://mangadex.org/title/moon',
      title: 'Лунные письма',
    });

    render(
      <MemoryRouter initialEntries={[`/sources/mangadex/manga?${parameters.toString()}`]}>
        <Routes>
          <Route
            element={<RemoteMangaDetailsPage bridge={bridge} />}
            path="/sources/:sourceId/manga"
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Данные и изображения: MangaDex')).toBeVisible();
    expect(screen.getByText('Перевод: Moon Team')).toBeVisible();
  });

  it('loads chapters through the selected adapter and builds reader links', async () => {
    const bridge = {
      listSources: vi.fn().mockResolvedValue([
        {
          id: 'source-1',
          name: 'Panels',
          baseUrl: 'https://panels.example/',
          adapterKind: 'manifest',
          enabled: true,
          capabilities: { search: true, download: true },
          createdAt: '2026-08-30T00:00:00Z',
          updatedAt: '2026-08-30T00:00:00Z',
        },
      ]),
      getSourceChapters: vi.fn().mockResolvedValue([
        {
          remoteId: 'chapter-1',
          title: 'Chapter 1',
          url: 'https://panels.example/chapter/1',
        },
      ]),
      downloadSourceChapter: vi.fn().mockResolvedValue({ totalPages: 12, cachedPages: 12 }),
    } as unknown as DesktopBridge;
    const parameters = new URLSearchParams({
      remoteId: 'moon',
      url: 'https://panels.example/manga/moon',
      title: 'Moon Panels',
      summary: 'A quiet lunar story.',
    });

    render(
      <MemoryRouter initialEntries={[`/sources/source-1/manga?${parameters.toString()}`]}>
        <Routes>
          <Route
            element={<RemoteMangaDetailsPage bridge={bridge} />}
            path="/sources/:sourceId/manga"
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Moon Panels' })).toBeVisible();
    expect(bridge.getSourceChapters).toHaveBeenCalledWith(
      'source-1',
      'moon',
      'https://panels.example/manga/moon',
    );
    expect(await screen.findByRole('link', { name: /Читать Chapter 1/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/sources/source-1/read?'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Скачать Chapter 1' }));
    await waitFor(() =>
      expect(bridge.downloadSourceChapter).toHaveBeenCalledWith(
        'source-1',
        'chapter-1',
        'https://panels.example/chapter/1',
      ),
    );
    expect(await screen.findByText('12 страниц сохранено для офлайн-чтения.')).toBeVisible();
  });
});
