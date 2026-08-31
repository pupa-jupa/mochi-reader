import { Bookmark, BookOpen, Quote, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { desktopBridge, isDesktopRuntime, type DesktopBridge } from '../../app/bridge';
import { SectionEmpty } from '../../components/SectionEmpty';
import type { BookmarkRecord } from '../../types/persistence';

interface BookmarksPageProps {
  bridge?: DesktopBridge;
}

export function BookmarksPage({ bridge }: BookmarksPageProps) {
  const api = bridge ?? desktopBridge;
  const shouldLoad = Boolean(bridge) || isDesktopRuntime();
  const [items, setItems] = useState<BookmarkRecord[]>([]);
  const [loading, setLoading] = useState(shouldLoad);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldLoad) return;
    let active = true;
    void api
      .listBookmarks()
      .then((bookmarks) => active && setItems(bookmarks))
      .catch(() => active && setError('Не удалось загрузить закладки.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [api, shouldLoad]);

  async function remove(id: string) {
    try {
      await api.deleteBookmark(id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch {
      setError('Не удалось удалить закладку. Попробуй ещё раз.');
    }
  }

  if (!loading && items.length === 0 && !error) {
    return (
      <SectionEmpty
        action={{ label: 'Открыть библиотеку', to: '/library' }}
        description="Во время чтения нажми Ctrl+B, чтобы сохранить страницу, цитату или заметку."
        eyebrow="Важные места"
        icon={Bookmark}
        title="Закладки"
      />
    );
  }

  return (
    <div className="page simple-page persistent-page">
      <header className="page-heading">
        <div><p className="eyebrow">Важные места</p><h1>Закладки</h1><p>Цитаты и позиции остаются на этом устройстве.</p></div>
      </header>
      {error ? <div className="notice notice--error" role="alert">{error}</div> : null}
      {loading ? <LoadingState label="Загружаем закладки…" /> : null}
      {!loading ? (
        <div className="bookmark-list">
          {items.map((bookmark) => (
            <BookmarkCard bookmark={bookmark} key={bookmark.id} onDelete={() => void remove(bookmark.id)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BookmarkCard({ bookmark, onDelete }: { bookmark: BookmarkRecord; onDelete(): void }) {
  const location = useMemo(() => {
    if (bookmark.pageIndex !== null) return `Страница ${bookmark.pageIndex + 1}`;
    if (bookmark.chapterId) return `Глава · ${Math.round(bookmark.percent * 100)}%`;
    return `${Math.round(bookmark.percent * 100)}%`;
  }, [bookmark.chapterId, bookmark.pageIndex, bookmark.percent]);

  return (
    <article className="bookmark-card">
      <div className="bookmark-card__mark"><Bookmark aria-hidden="true" /></div>
      <div className="bookmark-card__copy">
        <div className="bookmark-card__meta"><span>{location}</span><time>{formatDate(bookmark.createdAt)}</time></div>
        <h2><Link to={`/read/${bookmark.workId}`}>{bookmark.workTitle}</Link></h2>
        {bookmark.excerpt ? <blockquote><Quote aria-hidden="true" />{bookmark.excerpt}</blockquote> : null}
        {bookmark.note ? <p>{bookmark.note}</p> : null}
      </div>
      <div className="bookmark-card__actions">
        <Link aria-label={`Открыть ${bookmark.workTitle}`} className="icon-button" to={`/read/${bookmark.workId}`}><BookOpen aria-hidden="true" /></Link>
        <button aria-label="Удалить закладку" className="icon-button" onClick={onDelete} type="button"><Trash2 aria-hidden="true" /></button>
      </div>
    </article>
  );
}

function LoadingState({ label }: { label: string }) {
  return <div className="persistent-loading"><span className="spinner" /><p>{label}</p></div>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}
