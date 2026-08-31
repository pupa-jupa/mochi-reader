import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { DesktopBridge } from '../../app/bridge';
import { WorkDetailsPage } from './WorkDetailsPage';

describe('work details', () => {
  it('updates favorite, status and collection membership', async () => {
    const work = {
      id: 'work-1',
      title: 'Moonlit pages',
      author: 'Mochi',
      kind: 'book' as const,
      format: 'epub' as const,
      coverPath: null,
      status: 'planned' as const,
      favorite: false,
      progressPercent: 0,
      missingFile: false,
      addedAt: '2026-08-30T00:00:00Z',
      lastOpenedAt: null,
      originalTitle: null,
      description: null,
      sourcePath: 'C:/books/moon.epub',
      fileSize: 20,
      pageCount: null,
      chapterCount: 2,
    };
    const bridge = {
      getWork: vi.fn().mockResolvedValue(work),
      listCollections: vi.fn().mockResolvedValue([
        {
          id: 'collection-1',
          title: 'Evening',
          description: null,
          itemCount: 0,
          createdAt: '2026-08-30T00:00:00Z',
          updatedAt: '2026-08-30T00:00:00Z',
        },
      ]),
      setFavorite: vi.fn().mockResolvedValue(undefined),
      setWorkStatus: vi.fn().mockResolvedValue(undefined),
      addToCollection: vi.fn().mockResolvedValue(undefined),
      updateWorkMetadata: vi.fn().mockImplementation(async (_id, metadata) => ({ ...work, ...metadata })),
    } as unknown as DesktopBridge;

    render(
      <MemoryRouter initialEntries={['/work/work-1']}>
        <Routes><Route element={<WorkDetailsPage bridge={bridge} />} path="/work/:id" /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Moonlit pages' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Добавить в избранное' }));
    fireEvent.change(screen.getByLabelText('Статус чтения'), { target: { value: 'completed' } });
    fireEvent.change(screen.getByLabelText('Коллекция'), { target: { value: 'collection-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить в коллекцию' }));

    await waitFor(() => expect(bridge.setFavorite).toHaveBeenCalledWith('work-1', true));
    expect(bridge.setWorkStatus).toHaveBeenCalledWith('work-1', 'completed');
    expect(bridge.addToCollection).toHaveBeenCalledWith('collection-1', 'work-1');
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать информацию' }));
    fireEvent.change(screen.getByLabelText('Название произведения'), {
      target: { value: 'Moonlit pages revised' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить информацию' }));
    await waitFor(() =>
      expect(bridge.updateWorkMetadata).toHaveBeenCalledWith(
        'work-1',
        expect.objectContaining({ title: 'Moonlit pages revised' }),
      ),
    );
  });

  it('shows a remote manga as an online library work without local-file actions', async () => {
    const bridge = {
      getWork: vi.fn().mockResolvedValue({
        id: 'remote-work-1',
        title: 'Moon Panels',
        author: null,
        kind: 'manga',
        format: 'remote_manga',
        coverPath: null,
        status: 'reading',
        favorite: false,
        progressPercent: 25,
        missingFile: false,
        addedAt: '2026-08-31T00:00:00Z',
        lastOpenedAt: null,
        originalTitle: null,
        description: 'A quiet lunar story.',
        sourcePath: 'https://panels.example/manga/moon',
        fileSize: 0,
        pageCount: null,
        chapterCount: 3,
        originKind: 'remote',
        sourceId: 'source-1',
        remoteId: 'moon',
        remoteUrl: 'https://panels.example/manga/moon',
        remoteCoverUrl: 'https://panels.example/covers/moon.jpg',
      }),
      listCollections: vi.fn().mockResolvedValue([]),
    } as unknown as DesktopBridge;

    render(
      <MemoryRouter initialEntries={['/work/remote-work-1']}>
        <Routes><Route element={<WorkDetailsPage bridge={bridge} />} path="/work/:id" /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Moon Panels' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Читать' })).toHaveAttribute(
      'href',
      '/read/remote-work-1',
    );
    expect(screen.getByText('Онлайн-каталог')).toBeVisible();
    expect(screen.queryByText('Размер')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Изменить расположение' })).not.toBeInTheDocument();
  });
});
