import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { BookCard } from './BookCard';

const work = {
  id: 'work-1',
  title: 'Moon Book',
  author: 'Mochi',
  kind: 'book' as const,
  format: 'epub' as const,
  coverPath: null,
  status: 'reading' as const,
  favorite: false,
  progressPercent: 20,
  missingFile: false,
  addedAt: '2026-08-30T00:00:00Z',
  lastOpenedAt: null,
};

describe('book card context menu', () => {
  it('offers working reading, organization, file and removal actions', () => {
    const onToggleFavorite = vi.fn();
    const onRevealSource = vi.fn();
    const onRemove = vi.fn();
    render(
      <MemoryRouter>
        <BookCard
          onRemove={onRemove}
          onRevealSource={onRevealSource}
          onToggleFavorite={onToggleFavorite}
          work={work}
        />
      </MemoryRouter>,
    );

    fireEvent.contextMenu(screen.getByRole('link', { name: 'Открыть «Moon Book»' }), {
      clientX: 120,
      clientY: 80,
    });

    expect(screen.getByRole('menu')).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Читать' })).toHaveAttribute('href', '/read/work-1');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Открыть расположение файла' }));
    fireEvent.contextMenu(screen.getByRole('link', { name: 'Открыть «Moon Book»' }), {
      clientX: 120,
      clientY: 80,
    });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Убрать из библиотеки' }));
    expect(onRevealSource).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
