import { FolderPlus, Library, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from 'zustand';

import { BookCard } from '../../components/BookCard';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { libraryStore, type LibraryStore } from '../../stores/libraryStore';

interface LibraryPageProps {
  store?: LibraryStore;
  initialFilter?: LibraryFilter;
}

export type LibraryFilter = 'all' | 'reading' | 'book' | 'manga' | 'favorite';

const pageCopy: Record<LibraryFilter, { eyebrow: string; title: string; empty: string }> = {
  all: { eyebrow: 'Твоя полка', title: 'Библиотека', empty: 'Книги и манга живут вместе' },
  reading: { eyebrow: 'Продолжить', title: 'Сейчас читаю', empty: 'Активных чтений пока нет' },
  book: { eyebrow: 'Твоя полка', title: 'Книги', empty: 'Добавь первую книгу' },
  manga: { eyebrow: 'Твоя полка', title: 'Манга', empty: 'Добавь первую мангу' },
  favorite: { eyebrow: 'Особая полка', title: 'Избранное', empty: 'Отметь любимые произведения сердцем' },
};

export function LibraryPage({ store = libraryStore, initialFilter = 'all' }: LibraryPageProps) {
  const location = useLocation();
  const items = useStore(store, (state) => state.items);
  const total = useStore(store, (state) => state.total);
  const query = useStore(store, (state) => state.query);
  const status = useStore(store, (state) => state.status);
  const error = useStore(store, (state) => state.error);
  const lastImport = useStore(store, (state) => state.lastImport);
  const [draftQuery, setDraftQuery] = useState(query);
  const [filter, setFilter] = useState<LibraryFilter>(initialFilter);
  const searchRef = useRef<HTMLInputElement>(null);
  const copy = pageCopy[initialFilter];

  useEffect(() => {
    if (status === 'idle') void store.getState().load();
  }, [status, store]);

  useEffect(() => {
    if (new URLSearchParams(location.search).get('focus') === 'search') {
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [location.search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (draftQuery !== store.getState().query) {
        store.getState().setQuery(draftQuery);
        void store.getState().load();
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [draftQuery, store]);

  const failedItems = useMemo(
    () => lastImport?.items.filter((item) => item.error !== null) ?? [],
    [lastImport],
  );
  const visibleItems = useMemo(
    () =>
      items.filter((work) => {
        if (filter === 'reading') return work.status === 'reading';
        if (filter === 'book' || filter === 'manga') return work.kind === filter;
        if (filter === 'favorite') return work.favorite;
        return true;
      }),
    [filter, items],
  );

  return (
    <div className="page library-page">
      <header className="page-heading library-heading">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{total > 0 ? `${total} произведений ждут своего вечера` : copy.empty}</p>
        </div>
        {total > 0 ? (
          <div className="heading-actions">
            <Button onClick={() => void store.getState().importFiles()}>
              <Plus aria-hidden="true" />
              Добавить книги
            </Button>
            <Button onClick={() => void store.getState().importFolder()} variant="secondary">
              <FolderPlus aria-hidden="true" />
              Добавить папку
            </Button>
          </div>
        ) : null}
      </header>

      <div className="library-toolbar">
        <label className="search-field">
          <Search aria-hidden="true" />
          <span className="sr-only">Поиск по библиотеке</span>
          <input
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="Название, автор или серия…"
            ref={searchRef}
            type="search"
            value={draftQuery}
          />
          {draftQuery ? (
            <button aria-label="Очистить поиск" onClick={() => setDraftQuery('')} type="button">
              <X aria-hidden="true" />
            </button>
          ) : null}
        </label>
        <div aria-label="Фильтр библиотеки" className="filter-pills" role="group">
          <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')} type="button">Все</button>
          <button aria-pressed={filter === 'reading'} onClick={() => setFilter('reading')} type="button">Читаю</button>
          <button aria-pressed={filter === 'book'} onClick={() => setFilter('book')} type="button">Книги</button>
          <button aria-pressed={filter === 'manga'} onClick={() => setFilter('manga')} type="button">Манга</button>
          <button aria-pressed={filter === 'favorite'} onClick={() => setFilter('favorite')} type="button">Избранное</button>
        </div>
      </div>

      {status === 'importing' ? (
        <div aria-live="polite" className="notice notice--progress">
          <span className="spinner" />
          Бережно раскладываем файлы по полкам…
        </div>
      ) : null}
      {error ? (
        <div aria-live="assertive" className="notice notice--error">
          <span>{error}</span>
          <Button onClick={() => void store.getState().load()} variant="ghost">Повторить</Button>
        </div>
      ) : null}
      {lastImport ? (
        <div aria-live="polite" className="notice notice--success">
          <span>
            Добавлено: {lastImport.imported}
            {lastImport.failed ? ` · с ошибкой: ${lastImport.failed}` : ''}
          </span>
          {failedItems.length > 0 ? <small>{failedItems[0]?.error}</small> : null}
          <button aria-label="Закрыть результат импорта" onClick={() => store.getState().clearImportResult()} type="button">
            <X aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {status === 'loading' && items.length === 0 ? (
        <div aria-label="Загрузка библиотеки" className="skeleton-grid">
          {Array.from({ length: 6 }, (_, index) => <div className="skeleton-card" key={index} />)}
        </div>
      ) : null}

      {status !== 'loading' && items.length === 0 && !error ? (
        <EmptyState
          actions={
            <>
              <Button onClick={() => void store.getState().importFiles()}>
                <Plus aria-hidden="true" />
                Добавить книги
              </Button>
              <Button onClick={() => void store.getState().importFolder()} variant="secondary">
                <FolderPlus aria-hidden="true" />
                Добавить папку
              </Button>
            </>
          }
          description={draftQuery ? 'Попробуй другое название или очисти поиск.' : 'Добавь первую книгу, мангу или целую папку — исходные файлы останутся на месте.'}
          pose="empty-library"
          title={draftQuery ? 'Ничего не нашлось' : 'Здесь пока тихо'}
        />
      ) : null}

      {visibleItems.length > 0 ? (
        <>
          <section aria-label="Произведения" className="library-grid">
            {visibleItems.map((work) => (
              <BookCard
                key={work.id}
                onRemove={() => {
                  if (window.confirm(`Убрать «${work.title}» из библиотеки? Исходный файл останется на месте.`)) {
                    void store.getState().remove(work.id);
                  }
                }}
                onRevealSource={() => void store.getState().revealSource(work.id)}
                onToggleFavorite={() => void store.getState().toggleFavorite(work.id)}
                work={work}
              />
            ))}
          </section>
          {items.length < total ? (
            <div className="library-load-more">
              <Button disabled={status === 'loading'} onClick={() => void store.getState().loadMore()} variant="secondary">
                {status === 'loading' ? <span className="spinner" /> : <Library aria-hidden="true" />} Показать ещё
              </Button>
              <span>Показано {items.length} из {total}</span>
            </div>
          ) : null}
        </>
      ) : null}

      {items.length > 0 && visibleItems.length === 0 ? (
        <section className="filtered-empty">
          <Library aria-hidden="true" />
          <h2>На этой полке пока пусто</h2>
          <p>Выбери другой фильтр или добавь произведение в избранное.</p>
          <Button onClick={() => setFilter('all')} variant="secondary">Показать всё</Button>
        </section>
      ) : null}

      {items.length === 0 && status === 'ready' && draftQuery ? (
        <div className="empty-search-mark"><Library aria-hidden="true" /></div>
      ) : null}
    </div>
  );
}
