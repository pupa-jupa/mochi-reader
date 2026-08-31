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
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useParams } from 'react-router-dom';

import { desktopBridge } from '../../app/bridge';
import type {
  BookmarkDraft,
  ProgressUpdate,
  ReadingProgress,
} from '../../types/persistence';
import type { ReaderDocument } from '../../types/reader';
import {
  loadReaderPosition,
  normalizeReaderProgress,
  saveReaderPosition,
} from '../../utils/readerPosition';

type ReaderTheme = 'paper' | 'sakura' | 'night';
type FontFamily = 'serif' | 'sans';

interface ReaderPreferences {
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
  fontFamily: FontFamily;
  justified: boolean;
  theme: ReaderTheme;
}

const defaultPreferences: ReaderPreferences = {
  fontSize: 19,
  lineHeight: 1.85,
  contentWidth: 760,
  fontFamily: 'serif',
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
      fontFamily: value.fontFamily === 'sans' ? 'sans' : 'serif',
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
  return 'Не удалось открыть произведение. Проверь исходный файл и попробуй снова.';
}

export function BookReaderPage() {
  const { id = '' } = useParams();
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
        <p>Готовим страницы…</p>
      </div>
    );
  }
  return (
    <BookReader
      createBookmark={desktopBridge.createBookmark}
      document={document}
      endReadingSession={desktopBridge.endReadingSession}
      initialProgress={initialProgress}
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
  startReadingSession?(workId: string, chapterId?: string | null, pageIndex?: number | null): Promise<string>;
  endReadingSession?(id: string, chapterId?: string | null, pageIndex?: number | null): Promise<void>;
}

export function BookReader({
  document,
  initialProgress = null,
  saveProgress,
  createBookmark,
  startReadingSession,
  endReadingSession,
}: BookReaderProps) {
  const saved = useMemo(() => {
    if (initialProgress?.readerMode === 'book' && initialProgress.chapterId) {
      const savedChapter = document.chapters.find(
        (chapter) => chapter.id === initialProgress.chapterId,
      );
      const chapterProgress =
        savedChapter && initialProgress.charOffset !== null && savedChapter.plainTextLength > 0
          ? initialProgress.charOffset / savedChapter.plainTextLength
          : initialProgress.percent;
      return {
        chapterId: initialProgress.chapterId,
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
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [query, setQuery] = useState('');
  const [readerNotice, setReaderNotice] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  const chapter = document.chapters[chapterIndex] ?? document.chapters[0];
  const locationRef = useRef({ chapterId: chapter?.id ?? null, pageIndex: null as number | null });
  locationRef.current = { chapterId: chapter?.id ?? null, pageIndex: null };

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
    ignorePersistenceFailure(saveProgress?.({
      workId: document.workId,
      chapterId: chapter.id,
      pageIndex: null,
      charOffset: Math.round(chapter.plainTextLength * progress),
      percent: normalizeReaderProgress((chapterIndex + progress) / document.chapters.length),
      readerMode: 'book',
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
    if (!startReadingSession) return;
    let active = true;
    let sessionId: string | null = null;
    ignorePersistenceFailure(
      startReadingSession(document.workId, locationRef.current.chapterId, null).then((id) => {
        if (active) sessionId = id;
        else ignorePersistenceFailure(endReadingSession?.(id, locationRef.current.chapterId, null));
      }),
    );
    return () => {
      active = false;
      if (sessionId) {
        ignorePersistenceFailure(endReadingSession?.(
          sessionId,
          locationRef.current.chapterId,
          locationRef.current.pageIndex,
        ));
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
        setNoteOpen(false);
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

  function saveBookmark(note: string | null = null) {
    if (!chapter) return;
    const key = `mochi-reader:bookmarks:${document.workId}`;
    const bookmark = { chapterId: chapter.id, chapterTitle: chapter.title, progress: currentProgress(), createdAt: new Date().toISOString() };
    const excerpt = globalThis.getSelection?.()?.toString().trim().slice(0, 500) || null;
    const cleanNote = note?.trim() || null;
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
      excerpt,
      note: cleanNote,
    }));
    if (cleanNote) {
      setNoteDraft('');
      setNoteOpen(false);
    }
    setReaderNotice(cleanNote ? 'Заметка сохранена' : 'Закладка сохранена');
    window.setTimeout(() => setReaderNotice(null), 1800);
  }

  const readerStyle = {
    '--reader-font-size': `${preferences.fontSize}px`,
    '--reader-line-height': String(preferences.lineHeight),
    '--reader-content-width': `${preferences.contentWidth}px`,
  } as CSSProperties;

  return (
    <div className="book-reader" data-reader-theme={preferences.theme} style={readerStyle}>
      <header className="reader-toolbar">
        <Link aria-label="Закрыть книгу" className="reader-tool" onClick={flushPosition} to={`/work/${document.workId}`}>
          <ArrowLeft aria-hidden="true" />
        </Link>
        <button aria-label="Оглавление" className="reader-tool" onClick={() => setTocOpen((value) => !value)} type="button">
          <Menu aria-hidden="true" />
        </button>
        <div className="reader-title"><strong>{document.title}</strong><span>{chapter?.title}</span></div>
        <select aria-label="Текущая глава" onChange={(event) => goToChapter(document.chapters.findIndex((item) => item.id === event.target.value))} value={chapter?.id}>
          {document.chapters.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.title}</option>)}
        </select>
        <div className="reader-toolbar__actions">
          <button aria-label="Поиск в книге" className="reader-tool" onClick={() => { setSearchOpen((value) => !value); setNoteOpen(false); }} type="button"><Search aria-hidden="true" /></button>
          <button aria-label="Добавить закладку" className="reader-tool" onClick={() => saveBookmark()} type="button"><Bookmark aria-hidden="true" /></button>
          <button aria-label="Добавить заметку" className="reader-tool" onClick={() => { setNoteOpen((value) => !value); setSearchOpen(false); }} type="button"><StickyNote aria-hidden="true" /></button>
          <button aria-label="Полный экран" className="reader-tool" onClick={() => void toggleFullscreen()} type="button"><Maximize2 aria-hidden="true" /></button>
          <button aria-label="Настройки чтения" className="reader-tool" onClick={() => setSettingsOpen((value) => !value)} type="button"><Settings2 aria-hidden="true" /></button>
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

      {noteOpen ? (
        <form
          className="reader-note"
          onSubmit={(event) => {
            event.preventDefault();
            if (noteDraft.trim()) saveBookmark(noteDraft);
          }}
        >
          <label>
            <span>Текст заметки</span>
            <textarea
              autoFocus
              maxLength={2000}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="Что хочется запомнить? Выделенный фрагмент сохранится рядом."
              rows={3}
              value={noteDraft}
            />
          </label>
          <div>
            <span>{noteDraft.length} / 2000</span>
            <button onClick={() => setNoteOpen(false)} type="button">Отмена</button>
            <button aria-label="Сохранить заметку" disabled={!noteDraft.trim()} type="submit">Сохранить</button>
          </div>
        </form>
      ) : null}

      {tocOpen ? (
        <aside aria-label="Оглавление" className="reader-toc">
          <div><strong>Оглавление</strong><button aria-label="Закрыть оглавление" onClick={() => setTocOpen(false)} type="button"><X aria-hidden="true" /></button></div>
          <nav>{document.chapters.map((item, index) => <button aria-current={index === chapterIndex ? 'page' : undefined} key={item.id} onClick={() => goToChapter(index)} type="button"><span>{String(index + 1).padStart(2, '0')}</span>{item.title}</button>)}</nav>
        </aside>
      ) : null}

      <div className="reader-viewport" onScroll={queuePositionSave} ref={viewportRef}>
        <article
          className={`reader-content reader-content--${preferences.fontFamily}${preferences.justified ? ' reader-content--justified' : ''}`}
          dangerouslySetInnerHTML={{ __html: cleanHtml }}
        />
        <footer className="chapter-footer">
          <button disabled={chapterIndex === 0} onClick={() => goToChapter(chapterIndex - 1)} type="button"><ChevronLeft aria-hidden="true" /> Предыдущая</button>
          <span>{chapterIndex + 1} / {document.chapters.length}</span>
          <button disabled={chapterIndex === document.chapters.length - 1} onClick={() => goToChapter(chapterIndex + 1)} type="button">Следующая <ChevronRight aria-hidden="true" /></button>
        </footer>
      </div>

      {settingsOpen ? (
        <aside aria-label="Настройки чтения" className="reader-settings">
          <div className="reader-settings__heading"><strong>Настройки чтения</strong><button aria-label="Закрыть настройки" onClick={() => setSettingsOpen(false)} type="button"><X aria-hidden="true" /></button></div>
          <section><span>Размер текста</span><div className="reader-stepper"><button aria-label="Уменьшить текст" onClick={() => updatePreferences({ fontSize: Math.max(14, preferences.fontSize - 1) })} type="button"><Minus aria-hidden="true" /></button><output>{preferences.fontSize}</output><button aria-label="Увеличить текст" onClick={() => updatePreferences({ fontSize: Math.min(34, preferences.fontSize + 1) })} type="button"><Plus aria-hidden="true" /></button></div></section>
          <label><span>Межстрочный интервал</span><input max="2.3" min="1.3" onChange={(event) => updatePreferences({ lineHeight: Number(event.target.value) })} step="0.05" type="range" value={preferences.lineHeight} /></label>
          <label><span>Ширина страницы</span><input max="1100" min="520" onChange={(event) => updatePreferences({ contentWidth: Number(event.target.value) })} step="20" type="range" value={preferences.contentWidth} /></label>
          <section><span>Шрифт</span><div className="reader-segments"><button aria-pressed={preferences.fontFamily === 'serif'} onClick={() => updatePreferences({ fontFamily: 'serif' })} type="button">С засечками</button><button aria-pressed={preferences.fontFamily === 'sans'} onClick={() => updatePreferences({ fontFamily: 'sans' })} type="button">Без засечек</button></div></section>
          <section><span>Фон</span><div className="reader-themes">{(['paper', 'sakura', 'night'] as ReaderTheme[]).map((theme) => <button aria-label={theme} aria-pressed={preferences.theme === theme} data-reader-theme-preview={theme} key={theme} onClick={() => updatePreferences({ theme })} type="button" />)}</div></section>
          <label className="reader-toggle"><span><Columns3 aria-hidden="true" /> Выравнивать по ширине</span><input checked={preferences.justified} onChange={(event) => updatePreferences({ justified: event.target.checked })} type="checkbox" /></label>
        </aside>
      ) : null}

      {readerNotice ? <div aria-live="polite" className="reader-toast"><Bookmark aria-hidden="true" /> {readerNotice}</div> : null}
    </div>
  );
}
