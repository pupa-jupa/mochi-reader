import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { ReaderDocument } from '../../types/reader';
import type { ReaderAnnotation, ReaderAnnotationDraft } from '../../types/annotations';
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

function annotationRecord(draft: ReaderAnnotationDraft): ReaderAnnotation {
  return {
    ...draft,
    id: 'annotation-1',
    contentIdentity: 'local:work-1',
    workTitle: 'Quiet Moon',
    workKind: 'book',
    coverPath: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };
}

function selectText(element: HTMLElement, start = 0, end = element.textContent?.length ?? 0) {
  const node = element.firstChild;
  if (!node) throw new Error('text fixture is missing');
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.mouseUp(element);
}

describe('book reader', () => {
  it('renders sanitized reading content and working reader controls', () => {
    const { container } = render(
      <MemoryRouter>
        <BookReader document={documentFixture} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'First light' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Настройки текста' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Текущая глава' })).toHaveValue('chapter-0');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[onclick]')).toBeNull();
  });

  it('applies detailed typography controls and can reset them', () => {
    localStorage.removeItem('mochi-reader:reader-preferences');
    const { container } = render(
      <MemoryRouter>
        <BookReader document={documentFixture} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Настройки текста' }));
    fireEvent.change(screen.getByLabelText('Интервал между абзацами'), {
      target: { value: '1.4' },
    });
    fireEvent.change(screen.getByLabelText('Отступ первой строки'), {
      target: { value: '1.8' },
    });
    fireEvent.change(screen.getByLabelText('Межбуквенный интервал'), {
      target: { value: '0.03' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Моноширинный' }));

    const reader = container.querySelector<HTMLElement>('.book-reader');
    const content = container.querySelector<HTMLElement>('.reader-content');
    expect(reader?.style.getPropertyValue('--reader-paragraph-spacing')).toBe('1.4em');
    expect(reader?.style.getPropertyValue('--reader-paragraph-indent')).toBe('1.8em');
    expect(reader?.style.getPropertyValue('--reader-letter-spacing')).toBe('0.03em');
    expect(content).toHaveClass('reader-content--mono');

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить настройки текста' }));

    expect(reader?.style.getPropertyValue('--reader-paragraph-spacing')).toBe('0.7em');
    expect(reader?.style.getPropertyValue('--reader-paragraph-indent')).toBe('0em');
    expect(reader?.style.getPropertyValue('--reader-letter-spacing')).toBe('0em');
    expect(content).toHaveClass('reader-content--serif');
  });

  it('keeps safe embedded FB2 images and local footnote links', () => {
    const fb2Document: ReaderDocument = {
      ...documentFixture,
      format: 'fb2',
      chapters: [
        {
          ...documentFixture.chapters[0]!,
          html: '<h1>Первая</h1><img alt="Обложка" src="data:image/png;base64,iVBORw0KGgo="><a class="fb2-note-link" href="#fb2-note-1">[1]</a><aside id="fb2-note-1">Примечание</aside>',
        },
      ],
    };

    render(
      <MemoryRouter>
        <BookReader document={fb2Document} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('img', { name: 'Обложка' })).toHaveAttribute(
      'src',
      'data:image/png;base64,iVBORw0KGgo=',
    );
    expect(screen.getByRole('link', { name: '[1]' })).toHaveAttribute('href', '#fb2-note-1');
    expect(screen.getByText('Примечание')).toBeVisible();
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

  it('creates a highlight from the compact text-selection toolbar', async () => {
    const listAnnotations = vi.fn().mockResolvedValue([]);
    const createAnnotation = vi
      .fn<(draft: ReaderAnnotationDraft) => Promise<ReaderAnnotation>>()
      .mockImplementation(async (draft) => annotationRecord(draft));
    render(
      <MemoryRouter>
        <BookReader
          createAnnotation={createAnnotation}
          document={documentFixture}
          listAnnotations={listAnnotations}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listAnnotations).toHaveBeenCalledWith({ workId: 'work-1' }));
    selectText(screen.getByText('Safe text'));
    fireEvent.click(await screen.findByRole('button', { name: 'Подсветить' }));

    await waitFor(() => {
      expect(createAnnotation).toHaveBeenCalledWith(
        expect.objectContaining({
          workId: 'work-1',
          kind: 'highlight',
          quote: 'Safe text',
          note: null,
          color: 'sakura',
          locator: expect.objectContaining({
            kind: 'book',
            chapterId: 'chapter-0',
            quote: expect.objectContaining({ exact: 'Safe text' }),
          }),
        }),
      );
    });
  });

  it('opens a small selection editor and saves an anchored note', async () => {
    const createAnnotation = vi
      .fn<(draft: ReaderAnnotationDraft) => Promise<ReaderAnnotation>>()
      .mockImplementation(async (draft) => annotationRecord(draft));
    render(
      <MemoryRouter>
        <BookReader
          createAnnotation={createAnnotation}
          document={documentFixture}
          listAnnotations={vi.fn().mockResolvedValue([])}
        />
      </MemoryRouter>,
    );

    selectText(screen.getByText('Safe text'));
    fireEvent.click(await screen.findByRole('button', { name: 'Заметка к выделению' }));
    fireEvent.change(screen.getByLabelText('Комментарий к выделению'), {
      target: { value: 'Очень тихий момент.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить заметку к выделению' }));

    await waitFor(() => {
      expect(createAnnotation).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'note',
          quote: 'Safe text',
          note: 'Очень тихий момент.',
          color: 'lavender',
        }),
      );
    });
  });

  it('restores persisted highlights in the matching chapter', async () => {
    const annotation = annotationRecord({
      workId: 'work-1',
      kind: 'highlight',
      quote: 'Safe text',
      note: null,
      locator: {
        kind: 'book',
        chapterId: 'chapter-0',
        startOffset: 11,
        endOffset: 20,
        quote: { exact: 'Safe text', prefix: 'First light', suffix: '' },
        domRange: null,
      },
      color: 'butter',
    });
    const { container } = render(
      <MemoryRouter>
        <BookReader
          document={documentFixture}
          listAnnotations={vi.fn().mockResolvedValue([annotation])}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-reader-annotation="annotation-1"]')).toHaveTextContent(
        'Safe text',
      );
    });
  });

  it('opens a linked annotation in its exact chapter', async () => {
    const linkedDocument: ReaderDocument = {
      ...documentFixture,
      workId: 'work-linked',
      chapters: [
        documentFixture.chapters[0]!,
        {
          id: 'chapter-1',
          title: 'Second light',
          html: '<h1>Second light</h1><p>Exact place</p>',
          plainTextLength: 23,
        },
      ],
    };
    const annotation = annotationRecord({
      workId: 'work-linked',
      kind: 'note',
      quote: 'Exact place',
      note: 'Linked thought',
      locator: {
        kind: 'book',
        chapterId: 'chapter-1',
        startOffset: 12,
        endOffset: 23,
        quote: { exact: 'Exact place', prefix: 'Second light', suffix: '' },
        domRange: null,
      },
      color: 'lavender',
    });

    const { container } = render(
      <MemoryRouter>
        <BookReader
          document={linkedDocument}
          focusAnnotationId="annotation-1"
          listAnnotations={vi.fn().mockResolvedValue([annotation])}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Текущая глава' })).toHaveValue('chapter-1');
    });
    expect(container.querySelector('[data-reader-annotation="annotation-1"]')).toHaveTextContent('Exact place');
    expect(screen.getByRole('complementary', { name: 'Заметки к книге' })).toBeVisible();
  });
});
