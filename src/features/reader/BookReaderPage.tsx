import DOMPurify from 'dompurify';
import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Maximize2,
  Menu,
  Minus,
  Plus,
  Search,
  Settings2,
  StickyNote,
  X,
} from 'lucide-react';
import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

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
import type { ReaderDocument } from '../../types/reader';
import {
  loadReaderPosition,
  normalizeReaderProgress,
  saveReaderPosition,
} from '../../utils/readerPosition';
import {
  applyAnnotationHighlights,
  type BookAnnotationLocator,
  createBookAnnotationLocator,
  resolveBookAnnotationRange,
} from '../../utils/annotationLocator';

type ReaderTheme = 'paper' | 'sakura' | 'night';
type FontFamily = 'serif' | 'sans' | 'mono';

interface ReaderPreferences {
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
  fontFamily: FontFamily;
  letterSpacing: number;
  paragraphIndent: number;
  paragraphSpacing: number;
  justified: boolean;
  theme: ReaderTheme;
}

const defaultPreferences: ReaderPreferences = {
  fontSize: 19,
  lineHeight: 1.85,
  contentWidth: 760,
  fontFamily: 'serif',
  letterSpacing: 0,
  paragraphIndent: 0,
  paragraphSpacing: 0.7,
  justified: false,
  theme: 'paper',
};

function ignorePersistenceFailure(promise: Promise<unknown> | undefined) {
  void promise?.catch(() => undefined);
}

function loadPreferences(): ReaderPreferences {
  try {
    const value = JSON.parse(localStorage.getItem('mochi-reader:reader-preferences') ?? '{}') as Partial<ReaderPreferences>;
    return {
      fontSize: Math.min(34, Math.max(14, value.fontSize ?? defaultPreferences.fontSize)),
      lineHeight: Math.min(2.3, Math.max(1.3, value.lineHeight ?? defaultPreferences.lineHeight)),
      contentWidth: Math.min(1100, Math.max(520, value.contentWidth ?? defaultPreferences.contentWidth)),
      fontFamily: value.fontFamily === 'sans' || value.fontFamily === 'mono' ? value.fontFamily : 'serif',
      letterSpacing: Math.min(0.08, Math.max(-0.02, value.letterSpacing ?? defaultPreferences.letterSpacing)),
      paragraphIndent: Math.min(3, Math.max(0, value.paragraphIndent ?? defaultPreferences.paragraphIndent)),
      paragraphSpacing: Math.min(2, Math.max(0, value.paragraphSpacing ?? defaultPreferences.paragraphSpacing)),
      justified: Boolean(value.justified),
      theme: value.theme === 'night' || value.theme === 'sakura' ? value.theme : 'paper',
    };
  } catch {
    return defaultPreferences;
  }
}

function errorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null && 'userMessage' in error) {
    return String(error.userMessage);
  }
  return 'Не удалось открыть произведение. Проверьте исходный файл и повторите попытку.';
}

export function BookReaderPage() {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const [document, setDocument] = useState<ReaderDocument | null>(null);
  const [initialProgress, setInitialProgress] = useState<ReadingProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      desktopBridge.getReaderDocument(id),
      desktopBridge.getProgress(id).catch(() => null),
    ])
      .then(([value, progress]) => {
        if (!active) return;
        setInitialProgress(progress);
        setDocument(value);
      })
      .catch((reason: unknown) => active && setError(errorMessage(reason)));
    return () => {
      active = false;
    };
  }, [id]);

  if (error) {
    return (
      <div className="reader-error">
        <Link className="back-link" to={`/work/${id}`}><ArrowLeft aria-hidden="true" /> К карточке</Link>
        <div><h1>Книга не открылась</h1><p>{error}</p></div>
      </div>
    );
  }
  if (!document) {
    return (
      <div aria-label="Открываем книгу" className="reader-loading">
        <span className="spinner" />
        <p>Загружаем книгу…</p>
      </div>
    );
  }
  return (
    <BookReader
      createBookmark={desktopBridge.createBookmark}
      copyText={desktopBridge.copyText}
      createAnnotation={desktopBridge.createAnnotation}
      deleteAnnotation={desktopBridge.deleteAnnotation}
      document={document}
      endReadingSession={desktopBridge.endReadingSession}
      focusAnnotationId={searchParams.get('annotation')}
      initialProgress={initialProgress}
      listAnnotations={desktopBridge.listAnnotations}
      saveProgress={desktopBridge.saveProgress}
      startReadingSession={desktopBridge.startReadingSession}
    />
  );
}

interface BookReaderProps {
  document: ReaderDocument;
  initialProgress?: ReadingProgress | null;
  saveProgress?(update: ProgressUpdate): Promise<ReadingProgress>;
  createBookmark?(draft: BookmarkDraft): Promise<string>;
  listAnnotations?(query?: AnnotationQuery): Promise<ReaderAnnotation[]>;
  createAnnotation?(draft: ReaderAnnotationDraft): Promise<ReaderAnnotation>;
  deleteAnnotation?(id: string): Promise<void>;
  copyText?(text: string): Promise<void>;
  focusAnnotationId?: string | null;
  startReadingSession?(workId: string, locator: ReaderLocator): Promise<string>;
  endReadingSession?(id: string, locator: ReaderLocator): Promise<void>;
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

function scrollToRenderedAnnotation(root: HTMLElement, annotation: ReaderAnnotation) {
  const mark = [...root.querySelectorAll<HTMLElement>('[data-reader-annotation]')].find(
    (element) => element.dataset.readerAnnotation === annotation.id,
  );
  if (mark) {
    mark.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (annotation.locator.kind !== 'book') return;
  const range = resolveBookAnnotationRange(root, annotation.locator);
  const target = range?.startContainer.parentElement;
  target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
}

interface TextSelectionSnapshot {
  locator: BookAnnotationLocator;
  quote: string;
  left: number;
  top: number;
}

export function BookReader({
  document,
  initialProgress = null,
  saveProgress,
  createBookmark,
  listAnnotations,
  createAnnotation,
  deleteAnnotation,
  copyText,
  focusAnnotationId = null,
  startReadingSession,
  endReadingSession,
}: BookReaderProps) {
  const saved = useMemo(() => {
    if (initialProgress?.locator.kind === 'book' && initialProgress.locator.chapterId) {
      const locator = initialProgress.locator;
      const savedChapter = document.chapters.find(
        (chapter) => chapter.id === locator.chapterId,
      );
      const chapterProgress =
        savedChapter && locator.charOffset !== null && savedChapter.plainTextLength > 0
          ? locator.charOffset / savedChapter.plainTextLength
          : initialProgress.percent;
      return {
        chapterId: locator.chapterId,
        progress: normalizeReaderProgress(chapterProgress),
        updatedAt: initialProgress.updatedAt,
      };
    }
    return loadReaderPosition(document.workId);
  }, [document.chapters, document.workId, initialProgress]);
  const initialChapter = Math.max(
    0,
    saved ? document.chapters.findIndex((chapter) => chapter.id === saved.chapterId) : 0,
  );
  const [chapterIndex, setChapterIndex] = useState(initialChapter);
  const [preferences, setPreferences] = useState(loadPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [annotations, setAnnotations] = useState<ReaderAnnotation[]>([]);
  const [selectionSnapshot, setSelectionSnapshot] = useState<TextSelectionSnapshot | null>(null);
  const [selectionNoteOpen, setSelectionNoteOpen] = useState(false);
  const [selectionNoteDraft, setSelectionNoteDraft] = useState('');
  const [annotationBusy, setAnnotationBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [readerNotice, setReaderNotice] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  const focusedAnnotationRef = useRef<string | null>(null);
  const chapter = document.chapters[chapterIndex] ?? document.chapters[0];
  const locationRef = useRef<ReaderLocator>(
    initialProgress?.locator.kind === 'book'
      ? initialProgress.locator
      : {
          kind: 'book',
          chapterId: chapter?.id ?? null,
          charOffset: null,
        },
  );
  locationRef.current = {
    kind: 'book',
    chapterId: chapter?.id ?? null,
    charOffset:
      locationRef.current.kind === 'book' && locationRef.current.chapterId === chapter?.id
        ? locationRef.current.charOffset
        : null,
  };

  const cleanHtml = useMemo(
    () =>
      DOMPurify.sanitize(chapter?.html ?? '', {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'object', 'embed'],
        FORBID_ATTR: ['style'],
      }),
    [chapter?.html],
  );

  const matchCount = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return 0;
    const haystack = cleanHtml.replace(/<[^>]+>/g, ' ').toLocaleLowerCase();
    return haystack.split(needle).length - 1;
  }, [cleanHtml, query]);

  const chapterAnnotations = useMemo(
    () =>
      annotations.filter(
        (annotation) =>
          annotation.locator.kind === 'book' && annotation.locator.chapterId === chapter?.id,
      ),
    [annotations, chapter?.id],
  );

  function currentProgress() {
    const viewport = viewportRef.current;
    if (!viewport) return 0;
    const available = viewport.scrollHeight - viewport.clientHeight;
    return available <= 0 ? 1 : normalizeReaderProgress(viewport.scrollTop / available);
  }

  function flushPosition() {
    if (!chapter) return;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    const progress = currentProgress();
    saveReaderPosition(document.workId, { chapterId: chapter.id, progress });
    const locator: ReaderLocator = {
      kind: 'book',
      chapterId: chapter.id,
      charOffset: Math.round(chapter.plainTextLength * progress),
    };
    locationRef.current = locator;
    ignorePersistenceFailure(saveProgress?.({
      workId: document.workId,
      locator,
      percent: normalizeReaderProgress((chapterIndex + progress) / document.chapters.length),
    }));
  }

  function queuePositionSave() {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(flushPosition, 500);
  }

  function goToChapter(nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= document.chapters.length) return;
    flushPosition();
    setChapterIndex(nextIndex);
    setTocOpen(false);
  }

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !chapter) return;
    const progress = chapter.id === saved?.chapterId ? saved.progress : 0;
    const frame = window.requestAnimationFrame(() => {
      viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) * progress;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [chapter, saved]);

  useEffect(() => {
    localStorage.setItem('mochi-reader:reader-preferences', JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    if (!listAnnotations) return;
    let active = true;
    void listAnnotations({ workId: document.workId })
      .then((records) => {
        if (active) setAnnotations(records);
      })
      .catch(() => {
        if (active) setReaderNotice('Не удалось загрузить заметки');
      });
    return () => {
      active = false;
    };
  }, [document.workId, listAnnotations]);

  useLayoutEffect(() => {
    const root = articleRef.current;
    if (root) applyAnnotationHighlights(root, chapterAnnotations);
  }, [chapterAnnotations, cleanHtml]);

  useEffect(() => {
    if (!focusAnnotationId || focusedAnnotationRef.current === focusAnnotationId) return;
    const annotation = annotations.find((record) => record.id === focusAnnotationId);
    if (!annotation || annotation.locator.kind !== 'book') return;
    const locator = annotation.locator;
    const nextIndex = document.chapters.findIndex(
      (item) => item.id === locator.chapterId,
    );
    if (nextIndex < 0) return;
    let scrollFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      if (focusedAnnotationRef.current === focusAnnotationId) return;
      focusedAnnotationRef.current = focusAnnotationId;
      setAnnotationsOpen(true);
      setChapterIndex(nextIndex);
      scrollFrame = window.requestAnimationFrame(() => {
        const root = articleRef.current;
        if (root) scrollToRenderedAnnotation(root, annotation);
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(scrollFrame);
    };
  }, [annotations, document.chapters, focusAnnotationId]);

  useEffect(() => {
    if (!startReadingSession) return;
    let active = true;
    let sessionId: string | null = null;
    ignorePersistenceFailure(
      startReadingSession(document.workId, locationRef.current).then((id) => {
        if (active) sessionId = id;
        else ignorePersistenceFailure(endReadingSession?.(id, locationRef.current));
      }),
    );
    return () => {
      active = false;
      if (sessionId) {
        ignorePersistenceFailure(endReadingSession?.(sessionId, locationRef.current));
      }
    };
  }, [document.workId, endReadingSession, startReadingSession]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches('input, textarea, select, [contenteditable="true"]');
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => searchRef.current?.focus(), 0);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        saveBookmark();
        return;
      }
      if (event.key === 'Escape') {
        setSettingsOpen(false);
        setTocOpen(false);
        setSearchOpen(false);
        setAnnotationsOpen(false);
        setSelectionSnapshot(null);
        setSelectionNoteOpen(false);
      }
      if (!typing && event.key === 'ArrowRight') goToChapter(chapterIndex + 1);
      if (!typing && event.key === 'ArrowLeft') goToChapter(chapterIndex - 1);
      if (!typing && event.key.toLowerCase() === 'f') void toggleFullscreen();
    }
    window.addEventListener('keydown', handleKeydown);
    return () => {
      flushPosition();
      window.removeEventListener('keydown', handleKeydown);
    };
  });

  function updatePreferences(patch: Partial<ReaderPreferences>) {
    setPreferences((current) => ({ ...current, ...patch }));
  }

  async function toggleFullscreen() {
    if (globalThis.document.fullscreenElement) await globalThis.document.exitFullscreen();
    else await globalThis.document.documentElement.requestFullscreen();
  }

  function saveBookmark() {
    if (!chapter) return;
    const key = `mochi-reader:bookmarks:${document.workId}`;
    const bookmark = { chapterId: chapter.id, chapterTitle: chapter.title, progress: currentProgress(), createdAt: new Date().toISOString() };
    const values = (() => {
      try {
        return JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[];
      } catch {
        return [];
      }
    })();
    localStorage.setItem(key, JSON.stringify([...values, bookmark]));
    ignorePersistenceFailure(createBookmark?.({
      workId: document.workId,
      chapterId: chapter.id,
      pageIndex: null,
      charOffset: Math.round(chapter.plainTextLength * bookmark.progress),
      percent: normalizeReaderProgress(
        (chapterIndex + bookmark.progress) / document.chapters.length,
      ),
      excerpt: null,
      note: null,
    }));
    setReaderNotice('Закладка сохранена');
    window.setTimeout(() => setReaderNotice(null), 1800);
  }

  function dismissSelection() {
    globalThis.getSelection?.()?.removeAllRanges();
    setSelectionSnapshot(null);
    setSelectionNoteOpen(false);
    setSelectionNoteDraft('');
  }

  function captureSelection() {
    const root = articleRef.current;
    const selection = globalThis.getSelection?.();
    if (!root || !chapter || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      if (!selectionNoteOpen) setSelectionSnapshot(null);
      return;
    }
    const range = selection.getRangeAt(0);
    try {
      const locator = createBookAnnotationLocator(root, range, chapter.id);
      const rect =
        typeof range.getBoundingClientRect === 'function'
          ? range.getBoundingClientRect()
          : root.getBoundingClientRect();
      const horizontalInset = Math.min(210, globalThis.innerWidth / 2);
      const center = rect.width > 0 ? rect.left + rect.width / 2 : globalThis.innerWidth / 2;
      setSelectionSnapshot({
        locator,
        quote: locator.quote.exact,
        left: Math.max(horizontalInset, Math.min(globalThis.innerWidth - horizontalInset, center)),
        top: rect.height > 0 ? Math.max(76, rect.top - 10) : 132,
      });
      setSelectionNoteOpen(false);
      setSelectionNoteDraft('');
    } catch {
      setSelectionSnapshot(null);
    }
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
        workId: document.workId,
        kind,
        quote: selectionSnapshot.quote,
        note,
        locator: selectionSnapshot.locator,
        color,
      });
      setAnnotations((current) => [annotation, ...current.filter((item) => item.id !== annotation.id)]);
      dismissSelection();
      setReaderNotice(
        kind === 'highlight' ? 'Подсветка сохранена' : kind === 'note' ? 'Заметка сохранена' : 'Цитата сохранена',
      );
      window.setTimeout(() => setReaderNotice(null), 1800);
    } catch {
      setReaderNotice('Не удалось сохранить фрагмент');
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
      dismissSelection();
      setReaderNotice('Фрагмент скопирован');
      window.setTimeout(() => setReaderNotice(null), 1800);
    } catch {
      setReaderNotice('Не удалось скопировать фрагмент');
    }
  }

  function jumpToAnnotation(annotation: ReaderAnnotation) {
    if (annotation.locator.kind !== 'book') return;
    const locator = annotation.locator;
    const nextIndex = document.chapters.findIndex(
      (item) => item.id === locator.chapterId,
    );
    if (nextIndex < 0) return;
    if (nextIndex !== chapterIndex) flushPosition();
    setChapterIndex(nextIndex);
    const frame = window.requestAnimationFrame(() => {
      const root = articleRef.current;
      if (root) scrollToRenderedAnnotation(root, annotation);
    });
    window.setTimeout(() => window.cancelAnimationFrame(frame), 1000);
  }

  async function removeAnnotation(id: string) {
    if (!deleteAnnotation) return;
    try {
      await deleteAnnotation(id);
      setAnnotations((current) => current.filter((annotation) => annotation.id !== id));
      setReaderNotice('Заметка удалена');
      window.setTimeout(() => setReaderNotice(null), 1800);
    } catch {
      setReaderNotice('Не удалось удалить заметку');
    }
  }

  const readerStyle = {
    '--reader-font-size': `${preferences.fontSize}px`,
    '--reader-line-height': String(preferences.lineHeight),
    '--reader-content-width': `${preferences.contentWidth}px`,
    '--reader-letter-spacing': `${preferences.letterSpacing}em`,
    '--reader-paragraph-indent': `${preferences.paragraphIndent}em`,
    '--reader-paragraph-spacing': `${preferences.paragraphSpacing}em`,
  } as CSSProperties;

  return (
    <div className="book-reader" data-reader-theme={preferences.theme} style={readerStyle}>
      <header className="reader-toolbar">
        <Link aria-label="Закрыть книгу" className="reader-tool" onClick={flushPosition} to={`/work/${document.workId}`}>
          <ArrowLeft aria-hidden="true" />
        </Link>
        <button aria-label="Оглавление" className="reader-tool" onClick={() => { setTocOpen((value) => !value); setAnnotationsOpen(false); setSettingsOpen(false); }} type="button">
          <Menu aria-hidden="true" />
        </button>
        <div className="reader-title"><strong>{document.title}</strong><span>{chapter?.title}</span></div>
        <select aria-label="Текущая глава" onChange={(event) => goToChapter(document.chapters.findIndex((item) => item.id === event.target.value))} value={chapter?.id}>
          {document.chapters.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.title}</option>)}
        </select>
        <div className="reader-toolbar__actions">
          <button aria-label="Поиск в книге" className="reader-tool" onClick={() => setSearchOpen((value) => !value)} type="button"><Search aria-hidden="true" /></button>
          <button aria-label="Добавить закладку" className="reader-tool" onClick={() => saveBookmark()} type="button"><Bookmark aria-hidden="true" /></button>
          <button aria-label="Заметки" aria-pressed={annotationsOpen} className="reader-tool" onClick={() => { setAnnotationsOpen((value) => !value); setTocOpen(false); setSettingsOpen(false); }} type="button"><StickyNote aria-hidden="true" /></button>
          <button aria-label="Полный экран" className="reader-tool" onClick={() => void toggleFullscreen()} type="button"><Maximize2 aria-hidden="true" /></button>
          <button aria-label="Настройки текста" className="reader-tool" onClick={() => { setSettingsOpen((value) => !value); setAnnotationsOpen(false); setTocOpen(false); }} type="button"><Settings2 aria-hidden="true" /></button>
        </div>
      </header>

      {searchOpen ? (
        <div className="reader-search">
          <Search aria-hidden="true" />
          <input aria-label="Текст для поиска" onChange={(event) => setQuery(event.target.value)} placeholder="Найти в этой главе…" ref={searchRef} value={query} />
          <span>{query ? `${matchCount} совп.` : ''}</span>
          <button aria-label="Закрыть поиск" onClick={() => setSearchOpen(false)} type="button"><X aria-hidden="true" /></button>
        </div>
      ) : null}

      {selectionSnapshot && !selectionNoteOpen ? (
        <div
          aria-label="Действия с выделением"
          className="reader-selection-toolbar"
          onMouseDown={(event) => event.preventDefault()}
          role="toolbar"
          style={{ left: selectionSnapshot.left, top: selectionSnapshot.top }}
        >
          <button disabled={annotationBusy} onClick={() => void saveSelectionAnnotation('highlight', null, 'sakura')} type="button">Подсветить</button>
          <button disabled={annotationBusy} onClick={() => setSelectionNoteOpen(true)} type="button">Заметка к выделению</button>
          <button disabled={annotationBusy} onClick={() => void saveSelectionAnnotation('quote', null, null)} type="button">Сохранить цитату</button>
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
              placeholder="Комментарий к фрагменту"
              rows={3}
              value={selectionNoteDraft}
            />
          </label>
          <div>
            <span>{selectionNoteDraft.length} / 2000</span>
            <button onClick={dismissSelection} type="button">Отмена</button>
            <button disabled={!selectionNoteDraft.trim() || annotationBusy} type="submit">Сохранить заметку к выделению</button>
          </div>
        </form>
      ) : null}

      {tocOpen ? (
        <aside aria-label="Оглавление" className="reader-toc">
          <div><strong>Оглавление</strong><button aria-label="Закрыть оглавление" onClick={() => setTocOpen(false)} type="button"><X aria-hidden="true" /></button></div>
          <nav>{document.chapters.map((item, index) => <button aria-current={index === chapterIndex ? 'page' : undefined} key={item.id} onClick={() => goToChapter(index)} type="button"><span>{String(index + 1).padStart(2, '0')}</span>{item.title}</button>)}</nav>
        </aside>
      ) : null}

      {annotationsOpen ? (
        <aside aria-label="Заметки к книге" className="reader-annotations">
          <div className="reader-annotations__heading">
            <div><strong>Заметки</strong><span>{annotations.length}</span></div>
            <button aria-label="Закрыть заметки" onClick={() => setAnnotationsOpen(false)} type="button"><X aria-hidden="true" /></button>
          </div>
          {annotations.length > 0 ? (
            <div className="reader-annotations__list">
              {annotations.map((annotation) => {
                const locator = annotation.locator;
                const annotationChapter = locator.kind === 'book'
                  ? document.chapters.find((item) => item.id === locator.chapterId)
                  : null;
                return (
                  <article key={annotation.id}>
                    <button className="reader-annotation__jump" onClick={() => jumpToAnnotation(annotation)} type="button">
                      <span className="reader-annotation__meta">
                        <span>{annotationKindLabel(annotation.kind)}</span>
                        <span>{annotationChapter?.title ?? 'Фрагмент'} · {annotationDate(annotation.createdAt)}</span>
                      </span>
                      <blockquote>{annotation.quote}</blockquote>
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
            <div className="reader-annotations__empty"><StickyNote aria-hidden="true" /><p>Выделите текст, чтобы создать заметку или цитату.</p></div>
          )}
        </aside>
      ) : null}

      <div
        className="reader-viewport"
        onScroll={() => {
          queuePositionSave();
          if (selectionSnapshot && !selectionNoteOpen) dismissSelection();
        }}
        ref={viewportRef}
      >
        <article
          className={`reader-content reader-content--${preferences.fontFamily}${preferences.justified ? ' reader-content--justified' : ''}`}
          dangerouslySetInnerHTML={{ __html: cleanHtml }}
          onKeyUp={captureSelection}
          onMouseUp={captureSelection}
          ref={articleRef}
        />
        <footer className="chapter-footer">
          <button disabled={chapterIndex === 0} onClick={() => goToChapter(chapterIndex - 1)} type="button"><ChevronLeft aria-hidden="true" /> Предыдущая</button>
          <span>{chapterIndex + 1} / {document.chapters.length}</span>
          <button disabled={chapterIndex === document.chapters.length - 1} onClick={() => goToChapter(chapterIndex + 1)} type="button">Следующая <ChevronRight aria-hidden="true" /></button>
        </footer>
      </div>

      {settingsOpen ? (
        <aside aria-label="Настройки текста" className="reader-settings">
          <div className="reader-settings__heading"><strong>Настройки текста</strong><button aria-label="Закрыть настройки" onClick={() => setSettingsOpen(false)} type="button"><X aria-hidden="true" /></button></div>
          <section><span>Размер текста</span><div className="reader-stepper"><button aria-label="Уменьшить текст" onClick={() => updatePreferences({ fontSize: Math.max(14, preferences.fontSize - 1) })} type="button"><Minus aria-hidden="true" /></button><output>{preferences.fontSize}</output><button aria-label="Увеличить текст" onClick={() => updatePreferences({ fontSize: Math.min(34, preferences.fontSize + 1) })} type="button"><Plus aria-hidden="true" /></button></div></section>
          <label><span>Межстрочный интервал</span><input max="2.3" min="1.3" onChange={(event) => updatePreferences({ lineHeight: Number(event.target.value) })} step="0.05" type="range" value={preferences.lineHeight} /></label>
          <label><span>Ширина страницы</span><input max="1100" min="520" onChange={(event) => updatePreferences({ contentWidth: Number(event.target.value) })} step="20" type="range" value={preferences.contentWidth} /></label>
          <label><span>Интервал между абзацами</span><input aria-label="Интервал между абзацами" max="2" min="0" onChange={(event) => updatePreferences({ paragraphSpacing: Number(event.target.value) })} step="0.1" type="range" value={preferences.paragraphSpacing} /><output>{preferences.paragraphSpacing.toFixed(1)} em</output></label>
          <label><span>Отступ первой строки</span><input aria-label="Отступ первой строки" max="3" min="0" onChange={(event) => updatePreferences({ paragraphIndent: Number(event.target.value) })} step="0.1" type="range" value={preferences.paragraphIndent} /><output>{preferences.paragraphIndent.toFixed(1)} em</output></label>
          <label><span>Межбуквенный интервал</span><input aria-label="Межбуквенный интервал" max="0.08" min="-0.02" onChange={(event) => updatePreferences({ letterSpacing: Number(event.target.value) })} step="0.01" type="range" value={preferences.letterSpacing} /><output>{preferences.letterSpacing.toFixed(2)} em</output></label>
          <section><span>Шрифт</span><div className="reader-segments reader-segments--fonts"><button aria-pressed={preferences.fontFamily === 'serif'} onClick={() => updatePreferences({ fontFamily: 'serif' })} type="button">Книжный</button><button aria-pressed={preferences.fontFamily === 'sans'} onClick={() => updatePreferences({ fontFamily: 'sans' })} type="button">Без засечек</button><button aria-pressed={preferences.fontFamily === 'mono'} onClick={() => updatePreferences({ fontFamily: 'mono' })} type="button">Моноширинный</button></div></section>
          <section><span>Фон</span><div className="reader-themes">{(['paper', 'sakura', 'night'] as ReaderTheme[]).map((theme) => <button aria-label={theme} aria-pressed={preferences.theme === theme} data-reader-theme-preview={theme} key={theme} onClick={() => updatePreferences({ theme })} type="button" />)}</div></section>
          <label className="reader-toggle"><span><Columns3 aria-hidden="true" /> Выравнивать по ширине</span><input checked={preferences.justified} onChange={(event) => updatePreferences({ justified: event.target.checked })} type="checkbox" /></label>
          <button aria-label="Сбросить настройки текста" className="reader-settings__reset" onClick={() => setPreferences(defaultPreferences)} type="button">Сбросить настройки</button>
        </aside>
      ) : null}

      {readerNotice ? <div aria-live="polite" className="reader-toast"><Bookmark aria-hidden="true" /> {readerNotice}</div> : null}
    </div>
  );
}
