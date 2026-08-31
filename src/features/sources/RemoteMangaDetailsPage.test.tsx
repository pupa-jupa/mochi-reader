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

  it('adds remote manga to Library without downloading and reuses its work id', async () => {
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
          title: 'Глава 1',
          url: 'https://mangadex.org/chapter/chapter-1',
          attribution: null,
        },
      ]),
      findRemoteWork: vi.fn().mockResolvedValue(null),
      addRemoteWorkToLibrary: vi.fn().mockResolvedValue('remote-work-1'),
    } as unknown as DesktopBridge;
    const parameters = new URLSearchParams({
      remoteId: 'moon',
      url: 'https://mangadex.org/title/moon',
      title: 'Лунные письма',
      summary: 'Тихая история.',
      coverUrl: 'https://uploads.mangadex.org/covers/moon/cover.jpg.256.jpg',
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

    const addButton = await screen.findByRole('button', { name: 'Добавить в библиотеку' });
    await waitFor(() => expect(addButton).toBeEnabled());
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(bridge.addRemoteWorkToLibrary).toHaveBeenCalledWith({
        sourceId: 'mangadex',
        remoteId: 'moon',
        title: 'Лунные письма',
        description: 'Тихая история.',
        remoteUrl: 'https://mangadex.org/title/moon',
        coverUrl: 'https://uploads.mangadex.org/covers/moon/cover.jpg.256.jpg',
        chapterCount: 1,
      });
    });
    expect(screen.getByRole('button', { name: 'В библиотеке' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Читать Глава 1' })).toHaveAttribute(
      'href',
      expect.stringContaining('workId=remote-work-1'),
    );
    expect(screen.queryByRole('button', { name: /Скачать/ })).not.toBeInTheDocument();
  });
});
