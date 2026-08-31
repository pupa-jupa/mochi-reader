import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { DesktopBridge } from '../../app/bridge';
import type { ReaderAnnotation } from '../../types/annotations';
import { NotesPage } from './NotesPage';

const annotations: ReaderAnnotation[] = [
  {
    id: 'note-1',
    contentIdentity: 'local:work-1',
    workId: 'work-1',
    workTitle: 'Тихая луна',
    workKind: 'book',
    coverPath: null,
    kind: 'note',
    quote: 'Луна стояла совсем близко.',
    note: 'Вернуться к этой тихой сцене.',
    locator: {
      kind: 'book',
      chapterId: 'chapter-2',
      startOffset: 14,
      endOffset: 42,
      quote: { exact: 'Луна стояла совсем близко.', prefix: '', suffix: '' },
      domRange: null,
    },
    color: 'lavender',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 'quote-1',
    contentIdentity: 'local:work-2',
    workId: 'work-2',
    workTitle: 'Сад после дождя',
    workKind: 'book',
    coverPath: null,
    kind: 'quote',
    quote: 'Листья помнили дождь.',
    note: null,
    locator: {
      kind: 'book',
      chapterId: 'chapter-1',
      startOffset: 5,
      endOffset: 26,
      quote: { exact: 'Листья помнили дождь.', prefix: '', suffix: '' },
      domRange: null,
    },
    color: null,
    createdAt: '2026-08-31T00:00:00Z',
    updatedAt: '2026-08-31T00:00:00Z',
  },
];

function bridgeFixture() {
  return {
    listAnnotations: vi.fn().mockResolvedValue(annotations),
    updateAnnotation: vi.fn().mockImplementation(async (id, update) => ({
      ...annotations.find((annotation) => annotation.id === id)!,
      ...update,
      updatedAt: '2026-09-01T01:00:00Z',
    })),
    deleteAnnotation: vi.fn().mockResolvedValue(undefined),
    copyText: vi.fn().mockResolvedValue(undefined),
    exportAnnotations: vi.fn().mockResolvedValue(true),
  } as unknown as DesktopBridge;
}

describe('notes page', () => {
  it('searches and filters annotations while keeping exact reader links', async () => {
    const bridge = bridgeFixture();
    render(<MemoryRouter><NotesPage bridge={bridge} /></MemoryRouter>);

    expect(await screen.findByText('Вернуться к этой тихой сцене.')).toBeVisible();
    expect(screen.getByText('Листья помнили дождь.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Открыть фрагмент: Луна стояла совсем близко.' }))
      .toHaveAttribute('href', '/read/work-1?annotation=note-1');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск по заметкам' }), {
      target: { value: 'тихой' },
    });
    expect(screen.getByText('Вернуться к этой тихой сцене.')).toBeVisible();
    expect(screen.queryByText('Листья помнили дождь.')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск по заметкам' }), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('Тип заметки'), { target: { value: 'quote' } });
    expect(screen.getByText('Листья помнили дождь.')).toBeVisible();
    expect(screen.queryByText('Вернуться к этой тихой сцене.')).not.toBeInTheDocument();
  });

  it('edits and deletes a persisted annotation', async () => {
    const bridge = bridgeFixture();
    render(<MemoryRouter><NotesPage bridge={bridge} /></MemoryRouter>);
    await screen.findByText('Вернуться к этой тихой сцене.');

    fireEvent.click(screen.getByRole('button', { name: 'Редактировать заметку: Луна стояла совсем близко.' }));
    fireEvent.change(screen.getByLabelText('Текст заметки'), {
      target: { value: 'Новая мысль о лунном свете.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

    await waitFor(() => {
      expect(bridge.updateAnnotation).toHaveBeenCalledWith('note-1', {
        note: 'Новая мысль о лунном свете.',
        color: 'lavender',
      });
    });
    expect(screen.getByText('Новая мысль о лунном свете.')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Удалить заметку: Луна стояла совсем близко.' }));
    await waitFor(() => expect(bridge.deleteAnnotation).toHaveBeenCalledWith('note-1'));
    expect(screen.queryByText('Новая мысль о лунном свете.')).not.toBeInTheDocument();
  });

  it('copies the visible set and exports the active filters', async () => {
    const bridge = bridgeFixture();
    render(<MemoryRouter><NotesPage bridge={bridge} /></MemoryRouter>);
    await screen.findByText('Листья помнили дождь.');

    fireEvent.change(screen.getByLabelText('Книга'), { target: { value: 'work-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Скопировать всё' }));
    await waitFor(() => {
      expect(bridge.copyText).toHaveBeenCalledWith(expect.stringContaining('Тихая луна'));
    });
    expect(bridge.copyText).toHaveBeenCalledWith(expect.not.stringContaining('Сад после дождя'));

    fireEvent.click(screen.getByRole('button', { name: 'Экспорт Markdown' }));
    fireEvent.click(screen.getByRole('button', { name: 'Экспорт JSON' }));
    await waitFor(() => {
      expect(bridge.exportAnnotations).toHaveBeenCalledWith({ workId: 'work-1' }, 'markdown');
      expect(bridge.exportAnnotations).toHaveBeenCalledWith({ workId: 'work-1' }, 'json');
    });
  });
});
