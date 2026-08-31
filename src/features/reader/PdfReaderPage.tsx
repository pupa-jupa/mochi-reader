import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Expand,
  Maximize2,
  Minus,
  PanelLeft,
  Plus,
  Rows3,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import { desktopBridge } from '../../app/bridge';
import type {
  BookmarkDraft,
  ProgressUpdate,
  ReaderLocator,
  ReadingProgress,
} from '../../types/persistence';

function savedPage(workId: string) {
  const value = Number(localStorage.getItem(`mochi-reader:pdf-position:${workId}`) ?? 1);
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1;
}

function pdfError(error: unknown) {
  if (typeof error === 'object' && error !== null && 'userMessage' in error) return String(error.userMessage);
  return 'Не удалось прочитать PDF. Возможно, файл повреждён или защищён паролем.';
}

function ignorePersistenceFailure(promise: Promise<unknown> | undefined) {
  void promise?.catch(() => undefined);
}

interface PdfSearchResult {
  pageNumber: number;
  count: number;
  excerpt: string;
}

export type PdfTextLayerRenderer = (
  page: PDFPageProxy,
  container: HTMLElement,
  viewport: ReturnType<PDFPageProxy['getViewport']>,
) => Promise<() => void>;

const defaultTextLayerRenderer: PdfTextLayerRenderer = async (page, container, viewport) => {
  const [{ TextLayer }, textContent] = await Promise.all([
    import('pdfjs-dist'),
    page.getTextContent(),
  ]);
  container.replaceChildren();
  const textLayer = new TextLayer({ textContentSource: textContent, container, viewport });
  await textLayer.render();
  return () => {
    textLayer.cancel();
    container.replaceChildren();
  };
};

export function PdfReaderPage() {
  const { id = '' } = useParams();
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('Читаем структуру PDF…');
  const [initialPage, setInitialPage] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    void (async () => {
      try {
        const [bytes, pdfjs, saved] = await Promise.all([
          desktopBridge.getPdfBytes(id),
          import('pdfjs-dist'),
          desktopBridge.getProgress(id).catch(() => null),
        ]);
        if (!active) return;
        setInitialPage(saved?.locator.kind === 'pdf' ? saved.locator.pageIndex : null);
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        loadingTask = pdfjs.getDocument({
          data: bytes,
          enableXfa: false,
          useSystemFonts: true,
          verbosity: 0,
        });
        loadingTask.onProgress = ({ loaded: current, total }: { loaded: number; total: number }) => {
          if (active && total > 0) setProgress(`Загрузка ${Math.round((current / total) * 100)}%`);
        };
        const loaded = await loadingTask.promise;
        if (active) setPdf(loaded);
      } catch (reason) {
        if (active) setError(pdfError(reason));
      }
    })();
    return () => {
      active = false;
      void loadingTask?.destroy();
    };
  }, [id]);

  if (error) {
    return (
      <div className="pdf-error">
        <Link className="pdf-back" to={`/work/${id}`}><ArrowLeft aria-hidden="true" /> К карточке</Link>
        <div><h1>PDF не открылся</h1><p>{error}</p></div>
      </div>
    );
  }
  if (!pdf) return <div aria-label="Открываем PDF" className="pdf-loading"><span className="spinner" /><p>{progress}</p></div>;
  return (
    <PdfReader
      document={pdf}
      createBookmark={desktopBridge.createBookmark}
      endReadingSession={desktopBridge.endReadingSession}
      initialPage={initialPage}
      saveProgress={desktopBridge.saveProgress}
      startReadingSession={desktopBridge.startReadingSession}
      workId={id}
    />
  );
}

interface PdfReaderProps {
  document: PDFDocumentProxy;
  workId: string;
  initialPage?: number | null;
  saveProgress?(update: ProgressUpdate): Promise<ReadingProgress>;
  createBookmark?(draft: BookmarkDraft): Promise<string>;
  renderTextLayer?: PdfTextLayerRenderer;
  startReadingSession?(workId: string, locator: ReaderLocator): Promise<string>;
  endReadingSession?(id: string, locator: ReaderLocator): Promise<void>;
}

export function PdfReader({
  document,
  workId,
  initialPage = null,
  saveProgress,
  createBookmark,
  renderTextLayer = defaultTextLayerRenderer,
  startReadingSession,
  endReadingSession,
}: PdfReaderProps) {
  const [pageNumber, setPageNumber] = useState(() =>
    Math.min(document.numPages, initialPage === null ? savedPage(workId) : initialPage + 1),
  );
  const [scale, setScale] = useState(1.15);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [thumbnailsOpen, setThumbnailsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PdfSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchComplete, setSearchComplete] = useState(false);
  const [bookmarkNotice, setBookmarkNotice] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageStageRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const renderTask = useRef<RenderTask | null>(null);
  const searchRequestRef = useRef(0);
  const pageRef = useRef(pageNumber);
  pageRef.current = pageNumber;

  useEffect(() => {
    let active = true;
    void document
      .getPage(pageNumber)
      .then((value) => active && setPage(value))
      .catch((reason: unknown) => active && setRenderError(pdfError(reason)));
    localStorage.setItem(`mochi-reader:pdf-position:${workId}`, String(pageNumber));
    ignorePersistenceFailure(saveProgress?.({
      workId,
      locator: { kind: 'pdf', pageIndex: pageNumber - 1 },
      percent: pageNumber / document.numPages,
    }));
    return () => {
      active = false;
      setPage(null);
    };
  }, [document, pageNumber, saveProgress, workId]);

  useEffect(() => {
    if (!startReadingSession) return;
    let active = true;
    let sessionId: string | null = null;
    ignorePersistenceFailure(
      startReadingSession(workId, { kind: 'pdf', pageIndex: pageRef.current - 1 }).then((id) => {
        if (active) sessionId = id;
        else ignorePersistenceFailure(endReadingSession?.(id, {
          kind: 'pdf',
          pageIndex: pageRef.current - 1,
        }));
      }),
    );
    return () => {
      active = false;
      if (sessionId) {
        ignorePersistenceFailure(endReadingSession?.(sessionId, {
          kind: 'pdf',
          pageIndex: pageRef.current - 1,
        }));
      }
    };
  }, [endReadingSession, startReadingSession, workId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = pageStageRef.current;
    const textLayer = textLayerRef.current;
    if (!canvas || !stage || !textLayer || !page) return;
    renderTask.current?.cancel();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale });
    const renderViewport = page.getViewport({ scale: scale * ratio });
    stage.style.width = `${Math.floor(viewport.width)}px`;
    stage.style.height = `${Math.floor(viewport.height)}px`;
    stage.style.setProperty('--total-scale-factor', String(scale));
    canvas.width = Math.floor(renderViewport.width);
    canvas.height = Math.floor(renderViewport.height);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    const task = page.render({ canvas, viewport: renderViewport, annotationMode: 0 });
    renderTask.current = task;
    let active = true;
    let disposeTextLayer: (() => void) | null = null;
    void renderTextLayer(page, textLayer, viewport)
      .then((dispose) => {
        if (active) disposeTextLayer = dispose;
        else dispose();
      })
      .catch((reason: unknown) => {
        if (active) setRenderError(pdfError(reason));
      });
    void task.promise.catch((reason: unknown) => {
      if (!(reason instanceof Error && reason.name === 'RenderingCancelledException')) {
        setRenderError(pdfError(reason));
      }
    });
    return () => {
      active = false;
      task.cancel();
      disposeTextLayer?.();
      textLayer.replaceChildren();
    };
  }, [page, renderTextLayer, scale]);

  const goTo = useCallback(
    (value: number) => {
      setRenderError(null);
      setPageNumber(Math.min(document.numPages, Math.max(1, Math.round(value))));
    },
    [document.numPages],
  );

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
        setThumbnailsOpen(false);
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
        return;
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setThumbnailsOpen(false);
      }
      if (target?.matches('input, textarea')) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') goTo(pageNumber + 1);
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') goTo(pageNumber - 1);
      if (event.key.toLowerCase() === 'f') void toggleFullscreen();
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [goTo, pageNumber]);

  useEffect(() => () => {
    searchRequestRef.current += 1;
  }, []);

  async function searchDocument() {
    const query = searchQuery.trim().slice(0, 200);
    if (!query) {
      setSearchResults([]);
      setSearchComplete(false);
      return;
    }
    const request = searchRequestRef.current + 1;
    searchRequestRef.current = request;
    setSearching(true);
    setSearchComplete(false);
    setSearchResults([]);
    const matches: PdfSearchResult[] = [];
    const needle = query.toLocaleLowerCase();
    try {
      for (let current = 1; current <= document.numPages; current += 1) {
        const searchPage = await document.getPage(current);
        const content = await searchPage.getTextContent();
        if (searchRequestRef.current !== request) return;
        const text = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        const lower = text.toLocaleLowerCase();
        const count = countMatches(lower, needle);
        if (count > 0) {
          matches.push({
            pageNumber: current,
            count,
            excerpt: searchExcerpt(text, lower.indexOf(needle), query.length),
          });
        }
      }
      if (searchRequestRef.current === request) {
        setSearchResults(matches);
        setSearchComplete(true);
      }
    } catch {
      if (searchRequestRef.current === request) setRenderError('Не удалось выполнить поиск в PDF.');
    } finally {
      if (searchRequestRef.current === request) setSearching(false);
    }
  }

  function savePdfBookmark() {
    ignorePersistenceFailure(createBookmark?.({
      workId,
      chapterId: null,
      pageIndex: pageNumber - 1,
      charOffset: null,
      percent: pageNumber / document.numPages,
      excerpt: null,
      note: null,
    }));
    setBookmarkNotice(true);
    window.setTimeout(() => setBookmarkNotice(false), 1800);
  }

  function fitWidth() {
    if (!page || !viewportRef.current) return;
    const natural = page.getViewport({ scale: 1 });
    setScale(Math.max(0.25, (viewportRef.current.clientWidth - 48) / natural.width));
  }

  function fitPage() {
    if (!page || !viewportRef.current) return;
    const natural = page.getViewport({ scale: 1 });
    const widthScale = (viewportRef.current.clientWidth - 48) / natural.width;
    const heightScale = (viewportRef.current.clientHeight - 48) / natural.height;
    setScale(Math.max(0.25, Math.min(widthScale, heightScale)));
  }

  async function toggleFullscreen() {
    if (globalThis.document.fullscreenElement) await globalThis.document.exitFullscreen();
    else await globalThis.document.documentElement.requestFullscreen();
  }

  return (
    <div className="pdf-reader">
      <header className="pdf-toolbar">
        <Link aria-label="Закрыть PDF" className="pdf-tool" to={`/work/${workId}`}><ArrowLeft aria-hidden="true" /></Link>
        <button aria-label="Миниатюры страниц" aria-pressed={thumbnailsOpen} className="pdf-tool" onClick={() => { setThumbnailsOpen((value) => !value); setSearchOpen(false); }} type="button"><PanelLeft aria-hidden="true" /></button>
        <div className="pdf-pagination">
          <button aria-label="Предыдущая страница" disabled={pageNumber === 1} onClick={() => goTo(pageNumber - 1)} type="button"><ChevronLeft aria-hidden="true" /></button>
          <input aria-label="Текущая страница PDF" max={document.numPages} min="1" onChange={(event) => goTo(Number(event.target.value))} type="number" value={pageNumber} />
          <span>/ {document.numPages}</span>
          <button aria-label="Следующая страница" disabled={pageNumber === document.numPages} onClick={() => goTo(pageNumber + 1)} type="button"><ChevronRight aria-hidden="true" /></button>
        </div>
        <div className="pdf-toolbar__spacer" />
        <button aria-label="Поиск в PDF" aria-pressed={searchOpen} className="pdf-tool" onClick={() => { setSearchOpen((value) => !value); setThumbnailsOpen(false); window.setTimeout(() => searchInputRef.current?.focus(), 0); }} type="button"><Search aria-hidden="true" /></button>
        {createBookmark ? <button aria-label="Добавить закладку PDF" className="pdf-tool" onClick={savePdfBookmark} type="button"><Bookmark aria-hidden="true" /></button> : null}
        <div className="pdf-zoom">
          <button aria-label="Уменьшить PDF" onClick={() => setScale((value) => Math.max(0.25, value - 0.1))} type="button"><Minus aria-hidden="true" /></button>
          <span>{Math.round(scale * 100)}%</span>
          <button aria-label="Увеличить PDF" onClick={() => setScale((value) => Math.min(4, value + 0.1))} type="button"><Plus aria-hidden="true" /></button>
        </div>
        <button aria-label="По ширине" className="pdf-tool" onClick={fitWidth} type="button"><Rows3 aria-hidden="true" /></button>
        <button aria-label="Вписать страницу" className="pdf-tool" onClick={fitPage} type="button"><Expand aria-hidden="true" /></button>
        <button aria-label="Полный экран" className="pdf-tool" onClick={() => void toggleFullscreen()} type="button"><Maximize2 aria-hidden="true" /></button>
      </header>

      {thumbnailsOpen ? (
        <aside aria-label="Миниатюры PDF" className="pdf-thumbnails">
          <div><strong>Страницы</strong><button aria-label="Закрыть миниатюры" onClick={() => setThumbnailsOpen(false)} type="button"><X aria-hidden="true" /></button></div>
          <div>
            {Array.from({ length: document.numPages }, (_, itemIndex) => {
              const itemPage = itemIndex + 1;
              return (
                <button aria-current={itemPage === pageNumber ? 'page' : undefined} aria-label={`Открыть страницу ${itemPage}`} key={itemPage} onClick={() => goTo(itemPage)} type="button">
                  <PdfThumbnail document={document} pageNumber={itemPage} />
                  <span>{itemPage}</span>
                </button>
              );
            })}
          </div>
        </aside>
      ) : null}

      {searchOpen ? (
        <aside aria-label="Поиск в PDF" className="pdf-search-panel">
          <div className="pdf-panel-heading"><strong>Поиск</strong><button aria-label="Закрыть поиск PDF" onClick={() => setSearchOpen(false)} type="button"><X aria-hidden="true" /></button></div>
          <form onSubmit={(event) => { event.preventDefault(); void searchDocument(); }}>
            <label><Search aria-hidden="true" /><input aria-label="Текст для поиска в PDF" maxLength={200} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Слово или фраза…" ref={searchInputRef} type="search" value={searchQuery} /></label>
            <button aria-label="Искать в PDF" disabled={!searchQuery.trim() || searching} type="submit">{searching ? 'Ищем…' : 'Искать'}</button>
          </form>
          {searchComplete ? <p className="pdf-search-summary">{pageCountLabel(searchResults.length)} с совпадениями</p> : null}
          <div className="pdf-search-results">
            {searchResults.map((result) => (
              <button aria-label={`Открыть результат на странице ${result.pageNumber}`} key={result.pageNumber} onClick={() => goTo(result.pageNumber)} type="button"><span>Страница {result.pageNumber} · {result.count}</span><p>{result.excerpt}</p></button>
            ))}
          </div>
        </aside>
      ) : null}

      <main className="pdf-viewport" ref={viewportRef}>
        {renderError ? <div className="pdf-render-error">{renderError}</div> : null}
        <div className="pdf-page" ref={pageStageRef}>
          <canvas aria-label={`Страница PDF ${pageNumber}`} ref={canvasRef} role="img" />
          <div aria-label={`Текстовый слой страницы ${pageNumber}`} className="pdf-text-layer textLayer" ref={textLayerRef} />
        </div>
      </main>
      {bookmarkNotice ? <div aria-live="polite" className="pdf-toast"><Bookmark aria-hidden="true" /> Закладка сохранена</div> : null}
    </div>
  );
}

function PdfThumbnail({ document, pageNumber }: { document: PDFDocumentProxy; pageNumber: number }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(() => !('IntersectionObserver' in globalThis));

  useEffect(() => {
    const root = rootRef.current;
    if (!root || visible || !('IntersectionObserver' in globalThis)) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '500px 0px' });
    observer.observe(root);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible) return;
    let active = true;
    let task: RenderTask | null = null;
    void document.getPage(pageNumber).then((thumbnailPage) => {
      if (!active || !canvasRef.current) return;
      const natural = thumbnailPage.getViewport({ scale: 1 });
      const scale = 112 / natural.width;
      const viewport = thumbnailPage.getViewport({ scale });
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      task = thumbnailPage.render({ canvas, viewport, annotationMode: 0 });
      return task.promise;
    }).catch(() => undefined);
    return () => {
      active = false;
      task?.cancel();
    };
  }, [document, pageNumber, visible]);

  return <div className="pdf-thumbnail" ref={rootRef}><canvas aria-hidden="true" ref={canvasRef} /></div>;
}

function countMatches(text: string, needle: string) {
  if (!needle) return 0;
  let count = 0;
  let cursor = 0;
  while (cursor <= text.length) {
    const index = text.indexOf(needle, cursor);
    if (index < 0) break;
    count += 1;
    cursor = index + Math.max(1, needle.length);
  }
  return count;
}

function searchExcerpt(text: string, index: number, length: number) {
  const start = Math.max(0, index - 54);
  const end = Math.min(text.length, index + length + 74);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

function pageCountLabel(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} страница`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${value} страницы`;
  return `${value} страниц`;
}
