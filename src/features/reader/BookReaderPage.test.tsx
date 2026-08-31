import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { ReaderDocument } from '../../types/reader';
import { BookReader } from './BookReaderPage';

const documentFixture: ReaderDocument = {
  workId: 'work-1',
  title: 'Quiet Moon',
  author: null,
  format: 'epub',
  kind: 'book',
  chapters: [
    {
      id: 'chapter-0',
      title: 'First light',
      html: '<h1>First light</h1><p onclick="bad()">Safe text</p><script>bad()</script>',
      plainTextLength: 20,
    },
  ],
};

describe('book reader', () => {
  it('renders sanitized reading content and working reader controls', () => {
    const { container } = render(
      <MemoryRouter>
        <BookReader document={documentFixture} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'First light' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Настройки чтения' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Текущая глава' })).toHaveValue('chapter-0');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[onclick]')).toBeNull();
  });

  it('sends a typed bookmark to persistent storage', () => {
    const createBookmark = vi.fn().mockResolvedValue('bookmark-1');
    render(
      <MemoryRouter>
        <BookReader createBookmark={createBookmark} document={documentFixture} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Добавить закладку' }));

    expect(createBookmark).toHaveBeenCalledWith(
      expect.objectContaining({
        workId: 'work-1',
        chapterId: 'chapter-0',
        percent: expect.any(Number),
      }),
    );
  });

  it('starts a reading session from the restored typed locator', async () => {
    const startReadingSession = vi.fn().mockResolvedValue('session-1');
    render(
      <MemoryRouter>
        <BookReader
          document={documentFixture}
          initialProgress={{
            contentIdentity: 'local:work-1',
            workId: 'work-1',
            locator: { kind: 'book', chapterId: 'chapter-0', charOffset: 12 },
            percent: 0.6,
            readerMode: 'book',
            updatedAt: '2026-08-31T12:00:00Z',
          }}
          startReadingSession={startReadingSession}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(startReadingSession).toHaveBeenCalledWith('work-1', {
        kind: 'book',
        chapterId: 'chapter-0',
        charOffset: 12,
      });
    });
  });

  it('saves a reader note at the current position', () => {
    const createBookmark = vi.fn().mockResolvedValue('bookmark-2');
    render(
      <MemoryRouter>
        <BookReader createBookmark={createBookmark} document={documentFixture} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Добавить заметку' }));
    fireEvent.change(screen.getByLabelText('Текст заметки'), {
      target: { value: 'Вернуться к этой мысли.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить заметку' }));

    expect(createBookmark).toHaveBeenCalledWith(
      expect.objectContaining({ note: 'Вернуться к этой мысли.' }),
    );
  });
});
