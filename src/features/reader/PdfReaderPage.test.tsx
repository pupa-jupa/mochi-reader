import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

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
});
