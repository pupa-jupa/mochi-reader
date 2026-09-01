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
  StickyNote,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import { desktopBridge } from '../../app/bridge';
import type {
  AnnotationKind,
  AnnotationQuery,
  HighlightColor,
  ReaderAnnotation,
  ReaderAnnotationDraft,
} from '../../types/annotations';
import type {
  BookmarkDraft,
  ProgressUpdate,
  ReaderLocator,
  ReadingProgress,
} from '../../types/persistence';
import {
  createPdfAnnotationLocator,
  type PdfAnnotationLocator,
} from '../../utils/pdfAnnotationLocator';

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

interface PdfSelectionSnapshot {
  locator: PdfAnnotationLocator;
  quote: string;
  left: number;
  top: number;
}

function annotationKindLabel(kind: AnnotationKind) {
  if (kind === 'highlight') return 'Подсветка';
  if (kind === 'note') return 'Заметка';
  return 'Цитата';
}

function annotationDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date);
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
  const [searchParams] = useSearchParams();
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
      copyText={desktopBridge.copyText}
      createAnnotation={desktopBridge.createAnnotation}
      createBookmark={desktopBridge.createBookmark}
      deleteAnnotation={desktopBridge.deleteAnnotation}
      endReadingSession={desktopBridge.endReadingSession}
      focusAnnotationId={searchParams.get('annotation')}
      initialPage={initialPage}
      listAnnotations={desktopBridge.listAnnotations}
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
  listAnnotations?(query?: AnnotationQuery): Promise<ReaderAnnotation[]>;
  createAnnotation?(draft: ReaderAnnotationDraft): Promise<ReaderAnnotation>;
  deleteAnnotation?(id: string): Promise<void>;
  copyText?(text: string): Promise<void>;
  focusAnnotationId?: string | null;
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
  listAnnotations,
  createAnnotation,
  deleteAnnotation,
  copyText,
  focusAnnotationId = null,
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
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [annotations, setAnnotations] = useState<ReaderAnnotation[]>([]);
  const [selectionSnapshot, setSelectionSnapshot] = useState<PdfSelectionSnapshot | null>(null);
  const [selectionNoteOpen, setSelectionNoteOpen] = useState(false);
  const [selectionNoteDraft, setSelectionNoteDraft] = useState('');
  const [annotationBusy, setAnnotationBusy] = useState(false);
  const [annotationNotice, setAnnotationNotice] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageStageRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const renderTask = useRef<RenderTask | null>(null);
  const searchRequestRef = useRef(0);
  const annotationNoticeTimerRef = useRef<number | null>(null);
  const focusedAnnotationRef = useRef<string | null>(null);
  const pageRef = useRef(pageNumber);
  pageRef.current = pageNumber;
  const pdfAnnotations = annotations.filter(
    (annotation) => annotation.locator.kind === 'pdf',
  );
  const currentPageAnnotations = pdfAnnotations.filter(
    (annotation) => annotation.locator.kind === 'pdf'
      && annotation.locator.pageIndex === pageNumber - 1,
  );

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
    if (!listAnnotations) return;
    let active = true;
    void listAnnotations({ workId })
      .then((records) => {
        if (active) setAnnotations(records);
      })
      .catch(() => {
        if (active) setAnnotationNotice('Не удалось загрузить заметки');
      });
    return () => {
      active = false;
    };
  }, [listAnnotations, workId]);

  useEffect(() => () => {
    if (annotationNoticeTimerRef.current !== null) {
      window.clearTimeout(annotationNoticeTimerRef.current);
    }
  }, []);

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
      setSelectionSnapshot(null);
      setSelectionNoteOpen(false);
      setPageNumber(Math.min(document.numPages, Math.max(1, Math.round(value))));
    },
    [document.numPages],
  );

  useEffect(() => {
    if (!focusAnnotationId || focusedAnnotationRef.current === focusAnnotationId) return;
    const annotation = annotations.find((record) => record.id === focusAnnotationId);
    if (!annotation || annotation.locator.kind !== 'pdf') return;
    const locator = annotation.locator;
    const frame = window.requestAnimationFrame(() => {
      focusedAnnotationRef.current = focusAnnotationId;
      setAnnotationsOpen(true);
      setSearchOpen(false);
      setThumbnailsOpen(false);
      goTo(locator.pageIndex + 1);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [annotations, focusAnnotationId, goTo]);

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
        setAnnotationsOpen(false);
        setSelectionSnapshot(null);
        setSelectionNoteOpen(false);
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

  function showAnnotationNotice(message: string) {
    setAnnotationNotice(message);
    if (annotationNoticeTimerRef.current !== null) {
      window.clearTimeout(annotationNoticeTimerRef.current);
    }
    annotationNoticeTimerRef.current = window.setTimeout(() => {
      setAnnotationNotice(null);
      annotationNoticeTimerRef.current = null;
    }, 1800);
  }

  function capturePdfSelection() {
    const selection = globalThis.getSelection?.();
    const textLayer = textLayerRef.current;
    const stage = pageStageRef.current;
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !textLayer || !stage) {
      if (!selectionNoteOpen) setSelectionSnapshot(null);
      return;
    }
    const range = selection.getRangeAt(0);
    try {
      const locator = createPdfAnnotationLocator(textLayer, stage, range, pageNumber - 1);
      const rect = typeof range.getBoundingClientRect === 'function'
        ? range.getBoundingClientRect()
        : stage.getBoundingClientRect();
      const horizontalInset = Math.min(210, globalThis.innerWidth / 2);
      const center = rect.width > 0 ? rect.left + rect.width / 2 : globalThis.innerWidth / 2;
      setSelectionSnapshot({
        locator,
        quote: locator.quote?.exact ?? range.toString(),
        left: Math.max(horizontalInset, Math.min(globalThis.innerWidth - horizontalInset, center)),
        top: rect.height > 0 ? Math.max(76, rect.top - 10) : 132,
      });
      setSelectionNoteOpen(false);
      setSelectionNoteDraft('');
    } catch {
      setSelectionSnapshot(null);
    }
  }

  function dismissPdfSelection() {
    setSelectionSnapshot(null);
    setSelectionNoteOpen(false);
    setSelectionNoteDraft('');
    globalThis.getSelection?.()?.removeAllRanges();
  }

  async function saveSelectionAnnotation(
    kind: AnnotationKind,
    note: string | null,
    color: HighlightColor | null,
  ) {
    if (!selectionSnapshot || !createAnnotation || annotationBusy) return;
    setAnnotationBusy(true);
    try {
      const annotation = await createAnnotation({
        workId,
        kind,
        quote: selectionSnapshot.quote,
        note,
        locator: selectionSnapshot.locator,
        color,
      });
      setAnnotations((current) => [annotation, ...current.filter((item) => item.id !== annotation.id)]);
      dismissPdfSelection();
      showAnnotationNotice(
        kind === 'highlight' ? 'Подсветка сохранена' : kind === 'note' ? 'Заметка сохранена' : 'Цитата сохранена',
      );
    } catch {
      showAnnotationNotice('Не удалось сохранить фрагмент');
    } finally {
      setAnnotationBusy(false);
    }
  }

  async function copySelection() {
    if (!selectionSnapshot) return;
    try {
      if (copyText) await copyText(selectionSnapshot.quote);
      else if (globalThis.navigator.clipboard) {
        await globalThis.navigator.clipboard.writeText(selectionSnapshot.quote);
      } else {
        throw new Error('Clipboard is unavailable.');
      }
      dismissPdfSelection();
      showAnnotationNotice('Фрагмент скопирован');
    } catch {
      showAnnotationNotice('Не удалось скопировать фрагмент');
    }
  }

  function jumpToAnnotation(annotation: ReaderAnnotation) {
    if (annotation.locator.kind !== 'pdf') return;
    setAnnotationsOpen(true);
    setSearchOpen(false);
    setThumbnailsOpen(false);
    goTo(annotation.locator.pageIndex + 1);
  }

  async function removeAnnotation(id: string) {
    if (!deleteAnnotation) return;
    try {
      await deleteAnnotation(id);
      setAnnotations((current) => current.filter((annotation) => annotation.id !== id));
      showAnnotationNotice('Заметка удалена');
    } catch {
      showAnnotationNotice('Не удалось удалить заметку');
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
        <button aria-label="Миниатюры страниц" aria-pressed={thumbnailsOpen} className="pdf-tool" onClick={() => { setThumbnailsOpen((value) => !value); setSearchOpen(false); setAnnotationsOpen(false); }} type="button"><PanelLeft aria-hidden="true" /></button>
        <div className="pdf-pagination">
          <button aria-label="Предыдущая страница" disabled={pageNumber === 1} onClick={() => goTo(pageNumber - 1)} type="button"><ChevronLeft aria-hidden="true" /></button>
          <input aria-label="Текущая страница PDF" max={document.numPages} min="1" onChange={(event) => goTo(Number(event.target.value))} type="number" value={pageNumber} />
          <span>/ {document.numPages}</span>
          <button aria-label="Следующая страница" disabled={pageNumber === document.numPages} onClick={() => goTo(pageNumber + 1)} type="button"><ChevronRight aria-hidden="true" /></button>
        </div>
        <div className="pdf-toolbar__spacer" />
        <button aria-label="Поиск в PDF" aria-pressed={searchOpen} className="pdf-tool" onClick={() => { setSearchOpen((value) => !value); setThumbnailsOpen(false); setAnnotationsOpen(false); window.setTimeout(() => searchInputRef.current?.focus(), 0); }} type="button"><Search aria-hidden="true" /></button>
        {createBookmark ? <button aria-label="Добавить закладку PDF" className="pdf-tool" onClick={savePdfBookmark} type="button"><Bookmark aria-hidden="true" /></button> : null}
        {listAnnotations || createAnnotation ? <button aria-label="Заметки PDF" aria-pressed={annotationsOpen} className="pdf-tool" onClick={() => { setAnnotationsOpen((value) => !value); setSearchOpen(false); setThumbnailsOpen(false); }} type="button"><StickyNote aria-hidden="true" /></button> : null}
        <div className="pdf-zoom">
          <button aria-label="Уменьшить PDF" onClick={() => setScale((value) => Math.max(0.25, value - 0.1))} type="button"><Minus aria-hidden="true" /></button>
          <span>{Math.round(scale * 100)}%</span>
          <button aria-label="Увеличить PDF" onClick={() => setScale((value) => Math.min(4, value + 0.1))} type="button"><Plus aria-hidden="true" /></button>
        </div>
        <button aria-label="По ширине" className="pdf-tool" onClick={fitWidth} type="button"><Rows3 aria-hidden="true" /></button>
        <button aria-label="Вписать страницу" className="pdf-tool" onClick={fitPage} type="button"><Expand aria-hidden="true" /></button>
        <button aria-label="Полный экран" className="pdf-tool" onClick={() => void toggleFullscreen()} type="button"><Maximize2 aria-hidden="true" /></button>
      </header>

      {selectionSnapshot && !selectionNoteOpen ? (
        <div
          aria-label="Действия с выделением PDF"
          className="reader-selection-toolbar"
          onMouseDown={(event) => event.preventDefault()}
          role="toolbar"
          style={{ left: selectionSnapshot.left, top: selectionSnapshot.top }}
        >
          <button disabled={annotationBusy || !createAnnotation} onClick={() => void saveSelectionAnnotation('highlight', null, 'sakura')} type="button">Подсветить</button>
          <button disabled={annotationBusy || !createAnnotation} onClick={() => setSelectionNoteOpen(true)} type="button">Заметка к выделению</button>
          <button disabled={annotationBusy || !createAnnotation} onClick={() => void saveSelectionAnnotation('quote', null, null)} type="button">Сохранить цитату</button>
          <button disabled={annotationBusy} onClick={() => void copySelection()} type="button">Копировать выделение</button>
        </div>
      ) : null}

      {selectionSnapshot && selectionNoteOpen ? (
        <form
          className="reader-selection-note"
          onSubmit={(event) => {
            event.preventDefault();
            const note = selectionNoteDraft.trim();
            if (note) void saveSelectionAnnotation('note', note, 'lavender');
          }}
          style={{
            left: selectionSnapshot.left,
            top: Math.max(76, Math.min(globalThis.innerHeight - 250, selectionSnapshot.top + 22)),
          }}
        >
          <blockquote>{selectionSnapshot.quote}</blockquote>
          <label>
            <span>Комментарий к выделению</span>
            <textarea
              autoFocus
              maxLength={2000}
              onChange={(event) => setSelectionNoteDraft(event.target.value)}
              placeholder="Что хочется запомнить?"
              rows={3}
              value={selectionNoteDraft}
            />
          </label>
          <div>
            <span>{selectionNoteDraft.length} / 2000</span>
            <button onClick={dismissPdfSelection} type="button">Отмена</button>
            <button disabled={!selectionNoteDraft.trim() || annotationBusy} type="submit">Сохранить заметку к выделению</button>
          </div>
        </form>
      ) : null}

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

      {annotationsOpen ? (
        <aside aria-label="Заметки к PDF" className="reader-annotations pdf-annotations">
          <div className="reader-annotations__heading">
            <div><strong>Заметки</strong><span>{pdfAnnotations.length}</span></div>
            <button aria-label="Закрыть заметки PDF" onClick={() => setAnnotationsOpen(false)} type="button"><X aria-hidden="true" /></button>
          </div>
          {pdfAnnotations.length > 0 ? (
            <div className="reader-annotations__list">
              {pdfAnnotations.map((annotation) => {
                const locator = annotation.locator;
                if (locator.kind !== 'pdf') return null;
                return (
                  <article key={annotation.id}>
                    <button aria-label={`Открыть заметку на странице ${locator.pageIndex + 1}`} className="reader-annotation__jump" onClick={() => jumpToAnnotation(annotation)} type="button">
                      <span className="reader-annotation__meta">
                        <span>{annotationKindLabel(annotation.kind)}</span>
                        <span>Страница {locator.pageIndex + 1} · {annotationDate(annotation.createdAt)}</span>
                      </span>
                      <blockquote>{annotation.quote || 'Фрагмент страницы'}</blockquote>
                      {annotation.note ? <p>{annotation.note}</p> : null}
                    </button>
                    {deleteAnnotation ? (
                      <button aria-label={`Удалить: ${annotation.quote.slice(0, 60)}`} className="reader-annotation__delete" onClick={() => void removeAnnotation(annotation.id)} type="button"><X aria-hidden="true" /></button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="reader-annotations__empty"><StickyNote aria-hidden="true" /><p>Выдели текст PDF, чтобы сохранить первую мысль.</p></div>
          )}
        </aside>
      ) : null}

      <main className="pdf-viewport" onScroll={() => { if (selectionSnapshot && !selectionNoteOpen) dismissPdfSelection(); }} ref={viewportRef}>
        {renderError ? <div className="pdf-render-error">{renderError}</div> : null}
        <div className="pdf-page" ref={pageStageRef}>
          <canvas aria-label={`Страница PDF ${pageNumber}`} ref={canvasRef} role="img" />
          <div aria-label={`Текстовый слой страницы ${pageNumber}`} className="pdf-text-layer textLayer" onMouseUp={capturePdfSelection} ref={textLayerRef} />
          <div aria-label={`Аннотации страницы ${pageNumber}`} className="pdf-annotation-layer">
            {currentPageAnnotations.flatMap((annotation) => {
              const locator = annotation.locator;
              if (locator.kind !== 'pdf') return [];
              return locator.rects.map((rect, rectIndex) => (
                <button
                  aria-label={rectIndex === 0 ? `Открыть ${annotationKindLabel(annotation.kind).toLocaleLowerCase()}: ${annotation.quote}` : undefined}
                  className="pdf-annotation-marker"
                  data-annotation-color={annotation.color ?? 'none'}
                  data-annotation-kind={annotation.kind}
                  data-reader-annotation={annotation.id}
                  key={`${annotation.id}:${rectIndex}`}
                  onClick={() => setAnnotationsOpen(true)}
                  style={{
                    left: `${rect.x * 100}%`,
                    top: `${rect.y * 100}%`,
                    width: `${rect.width * 100}%`,
                    height: `${rect.height * 100}%`,
                  }}
                  tabIndex={rectIndex === 0 ? 0 : -1}
                  type="button"
                />
              ));
            })}
          </div>
        </div>
      </main>
      {bookmarkNotice ? <div aria-live="polite" className="pdf-toast"><Bookmark aria-hidden="true" /> Закладка сохранена</div> : null}
      {annotationNotice ? <div aria-live="polite" className="pdf-toast"><StickyNote aria-hidden="true" /> {annotationNotice}</div> : null}
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
