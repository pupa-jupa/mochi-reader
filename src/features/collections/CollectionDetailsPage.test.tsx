import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { DesktopBridge } from '../../app/bridge';
import { CollectionDetailsPage } from './CollectionDetailsPage';

const work = {
  id: 'work-1',
  title: 'Moonlit pages',
  author: 'Mochi',
  kind: 'book' as const,
  format: 'epub' as const,
  coverPath: null,
  status: 'reading' as const,
  favorite: true,
  progressPercent: 64,
  missingFile: false,
  addedAt: '2026-08-30T12:00:00Z',
  lastOpenedAt: '2026-08-31T12:00:00Z',
};

describe('collection details page', () => {
  it('reopens a collection as a real shelf and removes only its membership', async () => {
    const user = userEvent.setup();
    const bridge = {
      getCollection: vi.fn().mockResolvedValue({
        id: 'collection-1',
        title: 'Evening',
        description: 'For quiet reading',
        itemCount: 1,
        createdAt: '2026-08-30T12:00:00Z',
        updatedAt: '2026-08-31T12:00:00Z',
        items: [work],
      }),
      removeFromCollection: vi.fn().mockResolvedValue(undefined),
      setFavorite: vi.fn().mockResolvedValue(undefined),
    } as unknown as DesktopBridge;

    render(
      <MemoryRouter initialEntries={['/collections/collection-1']}>
        <Routes>
          <Route element={<CollectionDetailsPage bridge={bridge} />} path="/collections/:id" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Evening' })).toBeVisible();
    expect(screen.getByText('For quiet reading')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Открыть «Moonlit pages»' })).toHaveAttribute(
      'href',
      '/work/work-1',
    );

    await user.click(
      screen.getByRole('button', { name: 'Убрать «Moonlit pages» из избранного' }),
    );
    await waitFor(() => expect(bridge.setFavorite).toHaveBeenCalledWith('work-1', false));

    await user.click(
      screen.getByRole('button', { name: 'Убрать «Moonlit pages» из коллекции' }),
    );

    await waitFor(() => {
      expect(bridge.removeFromCollection).toHaveBeenCalledWith('collection-1', 'work-1');
    });
    expect(screen.queryByText('Moonlit pages')).not.toBeInTheDocument();
  });

  it('edits collection metadata and deletes only the shelf after confirmation', async () => {
    const user = userEvent.setup();
    const bridge = {
      getCollection: vi.fn().mockResolvedValue({
        id: 'collection-1',
        title: 'Evening',
        description: 'For quiet reading',
        itemCount: 0,
        createdAt: '2026-08-30T12:00:00Z',
        updatedAt: '2026-08-31T12:00:00Z',
        items: [],
      }),
      updateCollection: vi.fn().mockResolvedValue(undefined),
      deleteCollection: vi.fn().mockResolvedValue(undefined),
    } as unknown as DesktopBridge;

    render(
      <MemoryRouter initialEntries={['/collections/collection-1']}>
        <Routes>
          <Route element={<CollectionDetailsPage bridge={bridge} />} path="/collections/:id" />
          <Route element={<h1>Коллекции</h1>} path="/collections" />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Редактировать коллекцию' }));
    await user.clear(screen.getByLabelText('Название коллекции'));
    await user.type(screen.getByLabelText('Название коллекции'), 'Rainy evening');
    await user.clear(screen.getByLabelText('Описание коллекции'));
    await user.type(screen.getByLabelText('Описание коллекции'), 'Updated shelf');
    await user.click(screen.getByRole('button', { name: 'Сохранить коллекцию' }));

    await waitFor(() => {
      expect(bridge.updateCollection).toHaveBeenCalledWith(
        'collection-1',
        'Rainy evening',
        'Updated shelf',
      );
    });
    expect(screen.getByRole('heading', { name: 'Rainy evening' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Удалить коллекцию' }));
    await user.click(screen.getByRole('button', { name: 'Подтвердить удаление коллекции' }));

    await waitFor(() => expect(bridge.deleteCollection).toHaveBeenCalledWith('collection-1'));
    expect(screen.getByRole('heading', { name: 'Коллекции' })).toBeVisible();
  });
});
