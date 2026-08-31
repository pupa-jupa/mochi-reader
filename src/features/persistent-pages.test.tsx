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
          workId: 'work-1',
          workTitle: 'Moonlit pages',
          chapterId: 'chapter-2',
          pageIndex: null,
          openedAt: '2026-08-30T12:00:00Z',
          closedAt: '2026-08-30T12:10:00Z',
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
