import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

import type { ReaderAnnotation, ReaderAnnotationDraft } from '../../types/annotations';
import { PdfReader, type PdfTextLayerRenderer } from './PdfReaderPage';

function pdfFixture() {
  const pages = [
    pageFixture(1, 'A quiet moon above the garden.'),
    pageFixture(2, 'The moon returned after rain.'),
    pageFixture(3, 'Only flowers remained.'),
  ];
  return {
    numPages: pages.length,
    getPage: vi.fn(async (pageNumber: number) => pages[pageNumber - 1]!),
  } as unknown as PDFDocumentProxy;
}

function pageFixture(pageNumber: number, text: string) {
  return {
    pageNumber,
    getViewport: vi.fn(({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
      scale,
    })),
    getTextContent: vi.fn().mockResolvedValue({
      items: [{ str: text }],
      styles: {},
      lang: null,
    }),
    render: vi.fn(() => ({
      promise: Promise.resolve(),
      cancel: vi.fn(),
    })),
  } as unknown as PDFPageProxy;
}

const renderTextLayer: PdfTextLayerRenderer = async (page, container) => {
  const content = await page.getTextContent();
  const span = document.createElement('span');
  span.textContent = content.items
    .map((item) => ('str' in item ? item.str : ''))
    .join(' ');
  container.replaceChildren(span);
  return () => container.replaceChildren();
};

function annotationRecord(draft: ReaderAnnotationDraft): ReaderAnnotation {
  return {
    ...draft,
    id: 'pdf-annotation-1',
    contentIdentity: 'local:pdf-annotation-work',
    workTitle: 'Quiet PDF',
    workKind: 'book',
    coverPath: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };
}

function selectPdfText(element: HTMLElement, start: number, end: number) {
  const node = element.firstChild;
  if (!node) throw new Error('PDF text fixture is missing');
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  Object.defineProperty(range, 'getClientRects', {
    value: () => [{ left: 60, top: 80, right: 360, bottom: 96, width: 300, height: 16 }],
  });
  Object.defineProperty(range, 'getBoundingClientRect', {
    value: () => ({ left: 60, top: 80, right: 360, bottom: 96, width: 300, height: 16 }),
  });
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.mouseUp(element.closest('.pdf-text-layer') ?? element);
}

describe('PDF reader', () => {
  it('renders a selectable text layer and persists page navigation', async () => {
    const document = pdfFixture();
    const saveProgress = vi.fn().mockResolvedValue({});
    render(
      <MemoryRouter>
        <PdfReader
          document={document}
          initialPage={1}
          renderTextLayer={renderTextLayer}
          saveProgress={saveProgress}
          workId="pdf-1"
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('The moon returned after rain.')).toBeVisible();
    expect(screen.getByLabelText('Текущая страница PDF')).toHaveValue(2);
    fireEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));

    await waitFor(() => {
      expect(saveProgress).toHaveBeenCalledWith({
        workId: 'pdf-1',
        locator: { kind: 'pdf', pageIndex: 2 },
        percent: 1,
      });
    });
  });

  it('searches every page and opens a matching result', async () => {
    const document = pdfFixture();
    render(
      <MemoryRouter>
        <PdfReader document={document} renderTextLayer={renderTextLayer} workId="pdf-1" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Поиск в PDF' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Текст для поиска в PDF' }), {
      target: { value: 'moon' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Искать в PDF' }));

    expect(await screen.findByText('2 страницы с совпадениями')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть результат на странице 2' }));
    expect(screen.getByLabelText('Текущая страница PDF')).toHaveValue(2);
  });

  it('opens thumbnail navigation and saves a real PDF bookmark', async () => {
    const document = pdfFixture();
    const createBookmark = vi.fn().mockResolvedValue('bookmark-1');
    render(
      <MemoryRouter>
        <PdfReader
          createBookmark={createBookmark}
          document={document}
          renderTextLayer={renderTextLayer}
          workId="pdf-1"
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Миниатюры страниц' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Открыть страницу 3' }));
    expect(screen.getByLabelText('Текущая страница PDF')).toHaveValue(3);

    fireEvent.click(screen.getByRole('button', { name: 'Добавить закладку PDF' }));
    expect(createBookmark).toHaveBeenCalledWith({
      workId: 'pdf-1',
      chapterId: null,
      pageIndex: 2,
      charOffset: null,
      percent: 1,
      excerpt: null,
      note: null,
    });
  });

  it('creates an anchored highlight from selected PDF text', async () => {
    const document = pdfFixture();
    const createAnnotation = vi
      .fn<(draft: ReaderAnnotationDraft) => Promise<ReaderAnnotation>>()
      .mockImplementation(async (draft) => annotationRecord(draft));
    const { container } = render(
      <MemoryRouter>
        <PdfReader
          createAnnotation={createAnnotation}
          document={document}
          initialPage={0}
          listAnnotations={vi.fn().mockResolvedValue([])}
          renderTextLayer={renderTextLayer}
          workId="pdf-annotation-work"
        />
      </MemoryRouter>,
    );

    const text = await screen.findByText('A quiet moon above the garden.');
    const stage = container.querySelector<HTMLElement>('.pdf-page');
    expect(stage).not.toBeNull();
    Object.defineProperty(stage, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 600, bottom: 800, width: 600, height: 800 }),
    });
    selectPdfText(text, 2, 12);
    fireEvent.click(await screen.findByRole('button', { name: 'Подсветить' }));

    await waitFor(() => {
      expect(createAnnotation).toHaveBeenCalledWith({
        workId: 'pdf-annotation-work',
        kind: 'highlight',
        quote: 'quiet moon',
        note: null,
        color: 'sakura',
        locator: {
          kind: 'pdf',
          pageIndex: 0,
          quote: {
            exact: 'quiet moon',
            prefix: 'A ',
            suffix: ' above the garden.',
          },
          rects: [{ x: 0.1, y: 0.1, width: 0.5, height: 0.02 }],
        },
      });
    });
  });

  it('opens a linked PDF annotation on its exact page and restores its marker', async () => {
    const document = pdfFixture();
    const annotation = annotationRecord({
      workId: 'pdf-annotation-work',
      kind: 'note',
      quote: 'moon returned',
      note: 'Remember the rain.',
      locator: {
        kind: 'pdf',
        pageIndex: 1,
        quote: { exact: 'moon returned', prefix: 'The ', suffix: ' after rain.' },
        rects: [{ x: 0.12, y: 0.18, width: 0.35, height: 0.025 }],
      },
      color: 'lavender',
    });
    const { container } = render(
      <MemoryRouter>
        <PdfReader
          document={document}
          focusAnnotationId="pdf-annotation-1"
          initialPage={0}
          listAnnotations={vi.fn().mockResolvedValue([annotation])}
          renderTextLayer={renderTextLayer}
          workId="pdf-annotation-work"
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Текущая страница PDF')).toHaveValue(2);
    });
    expect(screen.getByRole('complementary', { name: 'Заметки к PDF' })).toBeVisible();
    expect(container.querySelector('[data-reader-annotation="pdf-annotation-1"]')).toBeVisible();
  });
});
