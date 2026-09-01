import {
  ArrowLeft,
  ArrowLeftRight,
  Bookmark,
  Columns2,
  GalleryVerticalEnd,
  Maximize2,
  Minus,
  Plus,
  Rows3,
  Settings2,
  Square,
  X,
} from 'lucide-react';
import {
  type CSSProperties,
  type Ref,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useParams } from 'react-router-dom';

import { desktopBridge } from '../../app/bridge';
import type {
  BookmarkDraft,
  ProgressUpdate,
  ReaderLocator,
  ReadingProgress,
} from '../../types/persistence';
import type {
  MangaDirection,
  MangaManifest,
  MangaMode,
  MangaPageData,
  MangaPageDescriptor,
} from '../../types/manga';
import { doublePageSpread, resolveMangaAction } from '../../utils/mangaNavigation';

type MangaBackground = 'black' | 'graphite' | 'cream';

function safeIndex(value: number, total: number) {
  if (!Number.isFinite(value) || total <= 0) return 0;
  return Math.min(total - 1, Math.max(0, Math.round(value)));
}

function loadSavedIndex(workId: string, total: number) {
  return safeIndex(Number(localStorage.getItem(`mochi-reader:manga-position:${workId}`) ?? 0), total);
}

function mangaError(error: unknown) {
  if (typeof error === 'object' && error !== null && 'userMessage' in error) return String(error.userMessage);
  return 'Не удалось открыть страницы манги. Проверь архив или папку.';
}

function ignorePersistenceFailure(promise: Promise<unknown> | undefined) {
  void promise?.catch(() => undefined);
}

function isScrollMode(mode: MangaMode) {
  return mode === 'vertical' || mode === 'webtoon';
}

function retainedPageIndices(center: number, total: number) {
  const retained = new Set<number>();
  for (let pageIndex = center - 4; pageIndex <= center + 4; pageIndex += 1) {
    if (pageIndex >= 0 && pageIndex < total) retained.add(pageIndex);
  }
  return retained;
}

function releasePageUrl(url: string) {
  if (url.startsWith('blob:')) globalThis.URL.revokeObjectURL(url);
}

export function MangaReaderPage() {
  const { id = '' } = useParams();
  const [manifest, setManifest] = useState<MangaManifest | null>(null);
  const [initialProgress, setInitialProgress] = useState<ReadingProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      desktopBridge.getMangaManifest(id),
      desktopBridge.getProgress(id).catch(() => null),
    ])
      .then(([value, progress]) => {
        if (!active) return;
        setInitialProgress(progress);
        setManifest(value);
      })
      .catch((reason: unknown) => active && setError(mangaError(reason)));
    return () => {
      active = false;
    };
  }, [id]);

  if (error) {
    return (
      <div className="manga-error">
        <Link className="manga-back" to={`/work/${id}`}><ArrowLeft aria-hidden="true" /> К карточке</Link>
        <div><h1>Манга не открылась</h1><p>{error}</p></div>
      </div>
    );
  }
  if (!manifest) return <div aria-label="Открываем мангу" className="manga-loading"><span className="spinner" /><p>Собираем страницы…</p></div>;
  return (
    <MangaReader
      createBookmark={desktopBridge.createBookmark}
      endReadingSession={desktopBridge.endReadingSession}
      initialPageIndex={
        initialProgress?.locator.kind === 'manga' ? initialProgress.locator.pageIndex : null
      }
      loadPage={(index) => desktopBridge.getMangaPage(id, index)}
      manifest={manifest}
      saveProgress={desktopBridge.saveProgress}
      startReadingSession={desktopBridge.startReadingSession}
    />
  );
}

interface MangaReaderProps {
  manifest: MangaManifest;
  loadPage(index: number): Promise<MangaPageData>;
  backTo?: string;
  chapterId?: string | null;
  initialPageIndex?: number | null;
  saveProgress?(update: ProgressUpdate): Promise<ReadingProgress>;
  createBookmark?(draft: BookmarkDraft): Promise<string>;
  startReadingSession?(workId: string, locator: ReaderLocator): Promise<string>;
  endReadingSession?(id: string, locator: ReaderLocator): Promise<void>;
}

export function MangaReader({
  manifest,
  loadPage,
  backTo = `/work/${manifest.workId}`,
  chapterId = null,
  initialPageIndex = null,
  saveProgress,
  createBookmark,
  startReadingSession,
  endReadingSession,
}: MangaReaderProps) {
  const [mode, setMode] = useState<MangaMode>('single');
  const [direction, setDirection] = useState<MangaDirection>('ltr');
  const [background, setBackground] = useState<MangaBackground>('graphite');
  const [index, setIndex] = useState(() =>
    initialPageIndex === null
      ? loadSavedIndex(manifest.workId, manifest.pages.length)
      : safeIndex(initialPageIndex, manifest.pages.length),
  );
  const [zoom, setZoom] = useState(100);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [readerNotice, setReaderNotice] = useState<string | null>(null);
  const [pages, setPages] = useState<Record<number, string>>({});
  const [pageErrors, setPageErrors] = useState<Record<number, string>>({});
  const pending = useRef(new Set<number>());
  const pagesRef = useRef(pages);
  const modeRef = useRef(mode);
  const mountedRef = useRef(true);
  const verticalViewportRef = useRef<HTMLElement>(null);
  const scrollProgressFrameRef = useRef<number | null>(null);
  const bookmarkTimerRef = useRef<number | null>(null);
  const indexRef = useRef(index);
  indexRef.current = index;
  pagesRef.current = pages;
  modeRef.current = mode;

  const ensurePage = useCallback(
    async (pageIndex: number) => {
      if (pagesRef.current[pageIndex] || pending.current.has(pageIndex)) return;
      pending.current.add(pageIndex);
      try {
        const page = await loadPage(pageIndex);
        if (!mountedRef.current) {
          releasePageUrl(page.dataUrl);
          return;
        }
        if (!retainedPageIndices(indexRef.current, manifest.pages.length).has(page.index)) {
          releasePageUrl(page.dataUrl);
          return;
        }
        setPages((current) => {
          const next = { ...current, [page.index]: page.dataUrl };
          pagesRef.current = next;
          return next;
        });
        setPageErrors((current) => {
          if (!(page.index in current)) return current;
          const next = { ...current };
          delete next[page.index];
          return next;
        });
      } catch (error) {
        if (mountedRef.current) {
          setPageErrors((current) => ({ ...current, [pageIndex]: mangaError(error) }));
        }
      } finally {
        pending.current.delete(pageIndex);
      }
    },
    [loadPage, manifest.pages.length],
  );

  const visibleIndices = useMemo(
    () => (mode === 'double' ? doublePageSpread(index, manifest.pages.length, direction) : [index]),
    [direction, index, manifest.pages.length, mode],
  );

  useEffect(() => {
    mountedRef.current = true;
    const cachedPages = pagesRef;
    const scrollProgressFrame = scrollProgressFrameRef;
    const bookmarkTimer = bookmarkTimerRef;
    return () => {
      mountedRef.current = false;
      if (scrollProgressFrame.current !== null) {
        window.cancelAnimationFrame(scrollProgressFrame.current);
      }
      if (bookmarkTimer.current !== null) window.clearTimeout(bookmarkTimer.current);
      Object.values(cachedPages.current).forEach(releasePageUrl);
      cachedPages.current = {};
    };
  }, []);

  function prunePageCache(center: number) {
    const retained = retainedPageIndices(center, manifest.pages.length);
    setPages((current) => {
      let changed = false;
      const next: Record<number, string> = {};
      for (const [rawIndex, url] of Object.entries(current)) {
        const pageIndex = Number(rawIndex);
        if (retained.has(pageIndex)) next[pageIndex] = url;
        else {
          changed = true;
          releasePageUrl(url);
        }
      }
      pagesRef.current = changed ? next : current;
      return changed ? next : current;
    });
    setPageErrors((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([rawIndex]) => retained.has(Number(rawIndex))),
      );
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }

  function goTo(next: number) {
    const value = safeIndex(next, manifest.pages.length);
    if (value === indexRef.current) return;
    indexRef.current = value;
    setIndex(value);
    prunePageCache(value);
    localStorage.setItem(`mochi-reader:manga-position:${manifest.workId}`, String(value));
    ignorePersistenceFailure(saveProgress?.({
      workId: manifest.workId,
      locator: { kind: 'manga', chapterId, pageIndex: value },
      percent: manifest.pages.length > 0 ? (value + 1) / manifest.pages.length : 0,
    }));
  }

  function scrollToMangaPage(pageIndex: number) {
    goTo(pageIndex);
    window.requestAnimationFrame(() => {
      verticalViewportRef.current
        ?.querySelector<HTMLElement>(`[data-manga-page-index='${safeIndex(pageIndex, manifest.pages.length)}']`)
        ?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    });
  }

  function changeMode(nextMode: MangaMode) {
    setMode(nextMode);
    modeRef.current = nextMode;
    if (isScrollMode(nextMode)) {
      window.requestAnimationFrame(() => {
        verticalViewportRef.current
          ?.querySelector<HTMLElement>(`[data-manga-page-index='${indexRef.current}']`)
          ?.scrollIntoView?.({ block: 'center' });
      });
    }
  }

  function trackVerticalProgress() {
    if (scrollProgressFrameRef.current !== null) return;
    scrollProgressFrameRef.current = window.requestAnimationFrame(() => {
      scrollProgressFrameRef.current = null;
      const viewport = verticalViewportRef.current;
      if (!viewport) return;
      const viewportRect = viewport.getBoundingClientRect();
      const center = viewportRect.top + viewport.clientHeight / 2;
      let closestIndex = indexRef.current;
      let closestDistance = Number.POSITIVE_INFINITY;
      viewport.querySelectorAll<HTMLElement>('[data-manga-page-index]').forEach((element) => {
        const rect = element.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - center);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = Number(element.dataset.mangaPageIndex);
        }
      });
      if (Number.isFinite(closestIndex)) goTo(closestIndex);
    });
  }

  useEffect(() => {
    if (!startReadingSession) return;
    let active = true;
    let sessionId: string | null = null;
    ignorePersistenceFailure(
      startReadingSession(manifest.workId, {
        kind: 'manga',
        chapterId,
        pageIndex: indexRef.current,
      }).then((id) => {
        if (active) sessionId = id;
        else ignorePersistenceFailure(endReadingSession?.(id, {
          kind: 'manga',
          chapterId,
          pageIndex: indexRef.current,
        }));
      }),
    );
    return () => {
      active = false;
      if (sessionId) {
        ignorePersistenceFailure(endReadingSession?.(sessionId, {
          kind: 'manga',
          chapterId,
          pageIndex: indexRef.current,
        }));
      }
    };
  }, [chapterId, endReadingSession, manifest.workId, startReadingSession]);

  useEffect(() => {
    if (isScrollMode(mode)) return;
    for (const pageIndex of [...visibleIndices, index + 1, index + 2, index + 3]) {
      if (pageIndex >= 0 && pageIndex < manifest.pages.length) void ensurePage(pageIndex);
    }
  }, [ensurePage, index, manifest.pages.length, mode, visibleIndices]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, select, textarea')) return;
      const action = resolveMangaAction({ key: event.key, direction });
      if (action) {
        event.preventDefault();
        const next = index + (action === 'next' ? (mode === 'double' ? 2 : 1) : mode === 'double' ? -2 : -1);
        if (isScrollMode(mode)) scrollToMangaPage(next);
        else goTo(next);
      }
      if (event.key === 'Escape') setSettingsOpen(false);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b' && createBookmark) {
        event.preventDefault();
        void saveMangaBookmark();
      }
      if (event.key.toLowerCase() === 'f') void toggleFullscreen();
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  async function toggleFullscreen() {
    if (globalThis.document.fullscreenElement) await globalThis.document.exitFullscreen();
    else await globalThis.document.documentElement.requestFullscreen();
  }

  function showReaderNotice(message: string) {
    setReaderNotice(message);
    if (bookmarkTimerRef.current !== null) window.clearTimeout(bookmarkTimerRef.current);
    bookmarkTimerRef.current = window.setTimeout(() => {
      setReaderNotice(null);
      bookmarkTimerRef.current = null;
    }, 1800);
  }

  async function saveMangaBookmark() {
    if (!createBookmark) return;
    try {
      await createBookmark({
        workId: manifest.workId,
        chapterId,
        pageIndex: index,
        charOffset: null,
        percent: manifest.pages.length > 0 ? (index + 1) / manifest.pages.length : 0,
        excerpt: null,
        note: null,
      });
      showReaderNotice('Закладка сохранена');
    } catch {
      showReaderNotice('Не удалось сохранить закладку');
    }
  }

  return (
    <div className="manga-reader" data-background={background} data-mode={mode}>
      <header className="manga-toolbar">
        <Link aria-label="Закрыть мангу" className="manga-tool" to={backTo}><ArrowLeft aria-hidden="true" /></Link>
        <div className="manga-title"><strong>{manifest.title}</strong><span>{index + 1} из {manifest.pages.length}</span></div>
        <div aria-label="Режим отображения" className="manga-modes" role="group">
          <button aria-label="Вертикальная лента" aria-pressed={mode === 'vertical'} onClick={() => changeMode('vertical')} type="button"><Rows3 aria-hidden="true" /></button>
          <button aria-label="Вебтун" aria-pressed={mode === 'webtoon'} onClick={() => changeMode('webtoon')} type="button"><GalleryVerticalEnd aria-hidden="true" /></button>
          <button aria-label="Одна страница" aria-pressed={mode === 'single'} onClick={() => changeMode('single')} type="button"><Square aria-hidden="true" /></button>
          <button aria-label="Две страницы" aria-pressed={mode === 'double'} onClick={() => changeMode('double')} type="button"><Columns2 aria-hidden="true" /></button>
        </div>
        <div className="manga-zoom">
          <button aria-label="Уменьшить" onClick={() => setZoom((value) => Math.max(50, value - 10))} type="button"><Minus aria-hidden="true" /></button>
          <span>{zoom}%</span>
          <button aria-label="Увеличить" onClick={() => setZoom((value) => Math.min(200, value + 10))} type="button"><Plus aria-hidden="true" /></button>
        </div>
        {createBookmark ? <button aria-label="Добавить закладку" className="manga-tool" onClick={() => void saveMangaBookmark()} type="button"><Bookmark aria-hidden="true" /></button> : null}
        <button aria-label="Полный экран" className="manga-tool" onClick={() => void toggleFullscreen()} type="button"><Maximize2 aria-hidden="true" /></button>
        <button aria-label="Настройки манги" className="manga-tool" onClick={() => setSettingsOpen((value) => !value)} type="button"><Settings2 aria-hidden="true" /></button>
      </header>

      {isScrollMode(mode) ? (
        <main
          className={`manga-vertical manga-vertical--${mode}`}
          onScroll={trackVerticalProgress}
          ref={verticalViewportRef}
          style={{ '--manga-page-width': `${zoom * 10}px` } as CSSProperties}
        >
          {manifest.pages.map((page) => (
            <LazyMangaPage
              dataUrl={pages[page.index]}
              descriptor={page}
              ensurePage={ensurePage}
              error={pageErrors[page.index]}
              key={page.index}
            />
          ))}
        </main>
      ) : (
        <main className={`manga-paged manga-paged--${mode}`} style={{ '--manga-scale': zoom / 100 } as CSSProperties}>
          {visibleIndices.map((pageIndex) => {
            const descriptor = manifest.pages[pageIndex];
            return descriptor ? (
              <MangaPageFrame dataUrl={pages[pageIndex]} descriptor={descriptor} error={pageErrors[pageIndex]} key={pageIndex} />
            ) : null;
          })}
          <button aria-label="Предыдущая страница" className="manga-hit manga-hit--previous" disabled={index === 0} onClick={() => goTo(index - (mode === 'double' ? 2 : 1))} type="button" />
          <button aria-label="Следующая страница" className="manga-hit manga-hit--next" disabled={index >= manifest.pages.length - 1} onClick={() => goTo(index + (mode === 'double' ? 2 : 1))} type="button" />
        </main>
      )}

      {!isScrollMode(mode) ? (
        <footer className="manga-footer">
          <span>{index + 1}</span>
          <input aria-label="Страница" max={manifest.pages.length} min="1" onChange={(event) => goTo(Number(event.target.value) - 1)} type="range" value={index + 1} />
          <span>{manifest.pages.length}</span>
        </footer>
      ) : null}

      {settingsOpen ? (
        <aside aria-label="Настройки манги" className="manga-settings">
          <div><strong>Настройки манги</strong><button aria-label="Закрыть настройки" onClick={() => setSettingsOpen(false)} type="button"><X aria-hidden="true" /></button></div>
          <section><span><ArrowLeftRight aria-hidden="true" /> Направление</span><div><button aria-pressed={direction === 'ltr'} onClick={() => setDirection('ltr')} type="button">LTR</button><button aria-pressed={direction === 'rtl'} onClick={() => setDirection('rtl')} type="button">RTL</button></div></section>
          <section><span>Фон</span><div className="manga-backgrounds">{(['black', 'graphite', 'cream'] as MangaBackground[]).map((value) => <button aria-label={value} aria-pressed={background === value} data-manga-bg={value} key={value} onClick={() => setBackground(value)} type="button" />)}</div></section>
        </aside>
      ) : null}

      {readerNotice ? <div aria-live="polite" className="manga-toast"><Bookmark aria-hidden="true" /> {readerNotice}</div> : null}
    </div>
  );
}

function MangaPageFrame({
  descriptor,
  dataUrl,
  error,
  rootRef,
}: {
  descriptor: MangaPageDescriptor;
  dataUrl?: string;
  error?: string;
  rootRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div className="manga-page" data-manga-page-index={descriptor.index} ref={rootRef}>
      {dataUrl ? <img alt={`Страница ${descriptor.index + 1}`} src={dataUrl} /> : null}
      {!dataUrl && !error ? <span className="manga-page__loading"><i className="spinner" /> {descriptor.label}</span> : null}
      {error ? <span className="manga-page__error">{error}</span> : null}
    </div>
  );
}

function LazyMangaPage({
  descriptor,
  dataUrl,
  error,
  ensurePage,
}: {
  descriptor: MangaPageDescriptor;
  dataUrl?: string;
  error?: string;
  ensurePage(index: number): Promise<void>;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (dataUrl || error) return;
    if (!('IntersectionObserver' in window)) {
      void ensurePage(descriptor.index);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void ensurePage(descriptor.index);
          observer.disconnect();
        }
      },
      { rootMargin: '1200px 0px' },
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, [dataUrl, descriptor.index, ensurePage, error]);
  return <MangaPageFrame dataUrl={dataUrl} descriptor={descriptor} error={error} rootRef={root} />;
}
