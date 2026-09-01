import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { DesktopBridge } from '../../app/bridge';
import { SourceCatalogPage } from './SourceCatalogPage';

describe('source catalog page', () => {
  it('credits MangaDex in its catalog', async () => {
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
    } as unknown as DesktopBridge;

    render(
      <MemoryRouter initialEntries={['/sources/mangadex']}>
        <Routes>
          <Route element={<SourceCatalogPage bridge={bridge} />} path="/sources/:sourceId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Данные и изображения: MangaDex')).toBeVisible();
  });

  it('searches an enabled source and exposes real manga result links', async () => {
    const bridge = {
      listSources: vi.fn().mockResolvedValue([
        {
          id: 'source-1',
          name: 'Panels',
          baseUrl: 'https://panels.example/',
          adapterKind: 'manifest',
          enabled: true,
          capabilities: { search: true, download: false },
          createdAt: '2026-08-30T00:00:00Z',
          updatedAt: '2026-08-30T00:00:00Z',
        },
      ]),
      searchSource: vi.fn().mockResolvedValue({
        items: [
          {
            remoteId: 'moon',
            title: 'Moon Panels',
            url: 'https://panels.example/manga/moon',
            coverUrl: null,
            summary: 'A quiet lunar story.',
          },
        ],
        hasNextPage: false,
      }),
    } as unknown as DesktopBridge;

    render(
      <MemoryRouter initialEntries={['/sources/source-1']}>
        <Routes>
          <Route element={<SourceCatalogPage bridge={bridge} />} path="/sources/:sourceId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Panels' })).toBeVisible();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск по каталогу' }), {
      target: { value: 'moon' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Найти' }));

    expect(await screen.findByRole('link', { name: /Открыть Moon Panels/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/sources/source-1/manga?'),
    );
    expect(bridge.searchSource).toHaveBeenCalledWith('source-1', 'moon', 1);
  });

  it('imports an open-access OPDS book instead of opening the manga flow', async () => {
    const bridge = {
      listSources: vi.fn().mockResolvedValue([
        {
          id: 'opds-1',
          name: 'Lunar Library',
          baseUrl: 'https://books.example/opds',
          adapterKind: 'opds',
          enabled: true,
          capabilities: { search: true, download: true },
          createdAt: '2026-09-01T00:00:00Z',
          updatedAt: '2026-09-01T00:00:00Z',
        },
      ]),
      searchSource: vi.fn().mockResolvedValue({
        items: [
          {
            remoteId: 'urn:isbn:moon',
            title: 'Moon Letters',
            url: 'https://books.example/books/moon.epub',
            coverUrl: null,
            summary: 'Quiet letters.',
            contentKind: 'book',
            author: 'Aki Snow',
            acquisitionUrl: 'https://books.example/books/moon.epub',
            format: 'epub',
          },
        ],
        hasNextPage: false,
      }),
      importOpdsBook: vi.fn().mockResolvedValue('work-1'),
    } as unknown as DesktopBridge;

    render(
      <MemoryRouter initialEntries={['/sources/opds-1']}>
        <Routes>
          <Route element={<SourceCatalogPage bridge={bridge} />} path="/sources/:sourceId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Lunar Library' })).toBeVisible();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск по каталогу' }), {
      target: { value: 'moon' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Найти' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить Moon Letters в библиотеку' }));

    expect(bridge.importOpdsBook).toHaveBeenCalledWith(
      'opds-1',
      'https://books.example/books/moon.epub',
      'Moon Letters',
    );
    expect(await screen.findByRole('link', { name: 'Открыть Moon Letters' })).toHaveAttribute(
      'href',
      '/work/work-1',
    );
  });
});
