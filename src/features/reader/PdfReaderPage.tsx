import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Expand,
  Maximize2,
  Minus,
  Plus,
  Rows3,
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
import type { ProgressUpdate, ReadingProgress } from '../../types/persistence';

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
        setInitialPage(saved?.readerMode === 'pdf' ? saved.pageIndex : null);
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
  startReadingSession?(workId: string, chapterId?: string | null, pageIndex?: number | null): Promise<string>;
  endReadingSession?(id: string, chapterId?: string | null, pageIndex?: number | null): Promise<void>;
}

export function PdfReader({
  document,
  workId,
  initialPage = null,
  saveProgress,
  startReadingSession,
  endReadingSession,
}: PdfReaderProps) {
  const [pageNumber, setPageNumber] = useState(() =>
    Math.min(document.numPages, initialPage === null ? savedPage(workId) : initialPage + 1),
  );
  const [scale, setScale] = useState(1.15);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const renderTask = useRef<RenderTask | null>(null);
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
      chapterId: null,
      pageIndex: pageNumber - 1,
      charOffset: null,
      percent: pageNumber / document.numPages,
      readerMode: 'pdf',
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
      startReadingSession(workId, null, pageRef.current - 1).then((id) => {
        if (active) sessionId = id;
        else ignorePersistenceFailure(endReadingSession?.(id, null, pageRef.current - 1));
      }),
    );
    return () => {
      active = false;
      if (sessionId) {
        ignorePersistenceFailure(endReadingSession?.(sessionId, null, pageRef.current - 1));
      }
    };
  }, [endReadingSession, startReadingSession, workId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !page) return;
    renderTask.current?.cancel();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: scale * ratio });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
    canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
    const task = page.render({ canvas, viewport, annotationMode: 0 });
    renderTask.current = task;
    void task.promise.catch((reason: unknown) => {
      if (!(reason instanceof Error && reason.name === 'RenderingCancelledException')) {
        setRenderError(pdfError(reason));
      }
    });
    return () => task.cancel();
  }, [page, scale]);

  const goTo = useCallback(
    (value: number) => setPageNumber(Math.min(document.numPages, Math.max(1, Math.round(value)))),
    [document.numPages],
  );

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea')) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') goTo(pageNumber + 1);
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') goTo(pageNumber - 1);
      if (event.key.toLowerCase() === 'f') void toggleFullscreen();
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [goTo, pageNumber]);

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
        <div className="pdf-pagination">
          <button aria-label="Предыдущая страница" disabled={pageNumber === 1} onClick={() => goTo(pageNumber - 1)} type="button"><ChevronLeft aria-hidden="true" /></button>
          <input aria-label="Текущая страница PDF" max={document.numPages} min="1" onChange={(event) => goTo(Number(event.target.value))} type="number" value={pageNumber} />
          <span>/ {document.numPages}</span>
          <button aria-label="Следующая страница" disabled={pageNumber === document.numPages} onClick={() => goTo(pageNumber + 1)} type="button"><ChevronRight aria-hidden="true" /></button>
        </div>
        <div className="pdf-toolbar__spacer" />
        <div className="pdf-zoom">
          <button aria-label="Уменьшить PDF" onClick={() => setScale((value) => Math.max(0.25, value - 0.1))} type="button"><Minus aria-hidden="true" /></button>
          <span>{Math.round(scale * 100)}%</span>
          <button aria-label="Увеличить PDF" onClick={() => setScale((value) => Math.min(4, value + 0.1))} type="button"><Plus aria-hidden="true" /></button>
        </div>
        <button aria-label="По ширине" className="pdf-tool" onClick={fitWidth} type="button"><Rows3 aria-hidden="true" /></button>
        <button aria-label="Вписать страницу" className="pdf-tool" onClick={fitPage} type="button"><Expand aria-hidden="true" /></button>
        <button aria-label="Полный экран" className="pdf-tool" onClick={() => void toggleFullscreen()} type="button"><Maximize2 aria-hidden="true" /></button>
      </header>
      <main className="pdf-viewport" ref={viewportRef}>
        {renderError ? <div className="pdf-render-error">{renderError}</div> : null}
        <canvas aria-label={`Страница PDF ${pageNumber}`} ref={canvasRef} role="img" />
      </main>
    </div>
  );
}
