import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { DesktopBridge } from '../app/bridge';
import { BookmarksPage } from './bookmarks/BookmarksPage';
import { CollectionsPage } from './collections/CollectionsPage';
import { HistoryPage } from './history/HistoryPage';

describe('persistent library pages', () => {
  it('loads and removes a saved bookmark', async () => {
    const bridge = {
      listBookmarks: vi.fn().mockResolvedValue([
        {
          id: 'bookmark-1',
          workId: 'work-1',
          workTitle: 'Moonlit pages',
          chapterId: 'chapter-2',
          pageIndex: null,
          charOffset: 10,
          percent: 0.4,
          excerpt: 'A quiet moon',
          note: 'Return here',
          createdAt: '2026-08-30T12:00:00Z',
          updatedAt: '2026-08-30T12:00:00Z',
        },
      ]),
      deleteBookmark: vi.fn().mockResolvedValue(undefined),
    } as unknown as DesktopBridge;

    render(<MemoryRouter><BookmarksPage bridge={bridge} /></MemoryRouter>);
    expect(await screen.findByText('Moonlit pages')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Удалить закладку' }));
    await waitFor(() => expect(bridge.deleteBookmark).toHaveBeenCalledWith('bookmark-1'));
    expect(screen.queryByText('Moonlit pages')).not.toBeInTheDocument();
  });

  it('clears reading history after an explicit action', async () => {
    const bridge = {
      listHistory: vi.fn().mockResolvedValue([
        {
          id: 'session-1',
          contentIdentity: 'local:work-1',
          workId: 'work-1',
          workTitle: 'Moonlit pages',
          workKind: 'book',
          coverPath: null,
          startLocator: { kind: 'book', chapterId: 'chapter-1', charOffset: 10 },
          endLocator: { kind: 'book', chapterId: 'chapter-2', charOffset: 20 },
          startedAt: '2026-08-30T12:00:00Z',
          endedAt: '2026-08-30T12:10:00Z',
          durationSeconds: 600,
        },
      ]),
      clearHistory: vi.fn().mockResolvedValue(undefined),
    } as unknown as DesktopBridge;

    render(<MemoryRouter><HistoryPage bridge={bridge} /></MemoryRouter>);
    expect(await screen.findByText('Moonlit pages')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Очистить историю' }));
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить очистку' }));
    await waitFor(() => expect(bridge.clearHistory).toHaveBeenCalledOnce());
    expect(screen.queryByText('Moonlit pages')).not.toBeInTheDocument();
  });

  it('groups reading sessions and removes one history row without touching the work', async () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).toISOString();
    const yesterday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1,
      12,
    ).toISOString();
    const bridge = {
      listHistory: vi.fn().mockResolvedValue([
        {
          id: 'session-today',
          contentIdentity: 'local:work-1',
          workId: 'work-1',
          workTitle: 'Moonlit pages',
          workKind: 'book',
          coverPath: null,
          startLocator: { kind: 'book', chapterId: 'chapter-1', charOffset: 10 },
          endLocator: { kind: 'book', chapterId: 'chapter-2', charOffset: 20 },
          startedAt: today,
          endedAt: today,
          durationSeconds: 600,
        },
        {
          id: 'session-yesterday',
          contentIdentity: 'local:work-2',
          workId: 'work-2',
          workTitle: 'Quiet panels',
          workKind: 'manga',
          coverPath: null,
          startLocator: { kind: 'manga', chapterId: 'chapter-7', pageIndex: 2 },
          endLocator: { kind: 'manga', chapterId: 'chapter-7', pageIndex: 9 },
          startedAt: yesterday,
          endedAt: yesterday,
          durationSeconds: 125,
        },
      ]),
      deleteHistoryEntry: vi.fn().mockResolvedValue(undefined),
    } as unknown as DesktopBridge;

    render(<MemoryRouter><HistoryPage bridge={bridge} /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Сегодня' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Вчера' })).toBeVisible();
    expect(screen.getByText(/10 мин/)).toBeVisible();
    expect(screen.getByText(/Страница 10/)).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: 'Удалить Moonlit pages из истории' }),
    );

    await waitFor(() => {
      expect(bridge.deleteHistoryEntry).toHaveBeenCalledWith('session-today');
    });
    expect(screen.queryByText('Moonlit pages')).not.toBeInTheDocument();
    expect(screen.getByText('Quiet panels')).toBeVisible();
  });

  it('creates a named collection and reloads the collection list', async () => {
    const bridge = {
      listCollections: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'collection-1',
            title: 'Evening',
            description: null,
            itemCount: 0,
            createdAt: '2026-08-30T12:00:00Z',
            updatedAt: '2026-08-30T12:00:00Z',
          },
        ]),
      createCollection: vi.fn().mockResolvedValue('collection-1'),
    } as unknown as DesktopBridge;

    render(<MemoryRouter><CollectionsPage bridge={bridge} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Новая коллекция' }));
    fireEvent.change(screen.getByLabelText('Название коллекции'), { target: { value: 'Evening' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }));

    expect(await screen.findByText('Evening')).toBeVisible();
    expect(bridge.createCollection).toHaveBeenCalledWith('Evening', null);
  });
});
