import { FolderPlus, Library, Plus, Search, X } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useStore } from 'zustand';

import { BookCard } from '../../components/BookCard';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import {
  libraryStore,
  type LibraryFilter,
  type LibraryStore,
} from '../../stores/libraryStore';
import type { LibrarySort } from '../../types/library';

interface LibraryPageProps {
  store?: LibraryStore;
  initialFilter?: LibraryFilter;
}

const pageCopy: Record<LibraryFilter, { eyebrow: string; title: string; empty: string }> = {
  all: { eyebrow: 'Все файлы', title: 'Библиотека', empty: 'Добавьте книги или мангу' },
  reading: { eyebrow: 'Продолжить', title: 'Сейчас читаю', empty: 'Активных чтений пока нет' },
  completed: { eyebrow: 'Прочитано', title: 'Завершено', empty: 'Завершённых произведений нет' },
  book: { eyebrow: 'Форматы книг', title: 'Книги', empty: 'Добавьте книгу' },
  manga: { eyebrow: 'Графические форматы', title: 'Манга', empty: 'Добавьте мангу' },
  favorite: { eyebrow: 'Отмеченные', title: 'Избранное', empty: 'В избранном пока ничего нет' },
};

export function LibraryPage({ store = libraryStore, initialFilter = 'all' }: LibraryPageProps) {
  const location = useLocation();
  const [parameters, setParameters] = useSearchParams();
  const items = useStore(store, (state) => state.items);
  const total = useStore(store, (state) => state.total);
  const status = useStore(store, (state) => state.status);
  const error = useStore(store, (state) => state.error);
  const lastImport = useStore(store, (state) => state.lastImport);
  const routeQuery = parameters.get('q') ?? '';
  const deferredQuery = useDeferredValue(routeQuery);
  const filter = parseFilter(parameters.get('filter'), initialFilter);
  const sort = parseSort(parameters.get('sort'));
  const searchRef = useRef<HTMLInputElement>(null);
  const copy = pageCopy[filter];

  const updateRoute = useCallback(
    (patch: { q?: string; filter?: LibraryFilter; sort?: LibrarySort }) => {
      const next = new URLSearchParams(parameters);
      if (patch.q !== undefined) setOrDelete(next, 'q', patch.q);
      if (patch.filter !== undefined) setOrDelete(next, 'filter', patch.filter, 'all');
      if (patch.sort !== undefined) setOrDelete(next, 'sort', patch.sort, 'added_desc');
      setParameters(next, { replace: true });
    },
    [parameters, setParameters],
  );

  useEffect(() => {
    const current = store.getState();
    const changed =
      current.query !== deferredQuery || current.filter !== filter || current.sort !== sort;
    if (changed) store.getState().setView({ query: deferredQuery, filter, sort });
    if (changed || status === 'idle') void store.getState().load();
  }, [deferredQuery, filter, sort, status, store]);

  useEffect(() => {
    if (new URLSearchParams(location.search).get('focus') === 'search') {
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [location.search]);

  const failedItems = useMemo(
    () => lastImport?.items.filter((item) => item.error !== null) ?? [],
    [lastImport],
  );
  const visibleItems = items;

  return (
    <div className="page library-page">
      <header className="page-heading library-heading">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{total > 0 ? `Произведений: ${total}` : copy.empty}</p>
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
            onChange={(event) => updateRoute({ q: event.target.value })}
            placeholder="Название, автор или серия…"
            ref={searchRef}
            type="search"
            value={routeQuery}
          />
          {routeQuery ? (
            <button aria-label="Очистить поиск" onClick={() => updateRoute({ q: '' })} type="button">
              <X aria-hidden="true" />
            </button>
          ) : null}
        </label>
        <div aria-label="Фильтр библиотеки" className="filter-pills" role="group">
          <button aria-pressed={filter === 'all'} onClick={() => updateRoute({ filter: 'all' })} type="button">Все</button>
          <button aria-pressed={filter === 'reading'} onClick={() => updateRoute({ filter: 'reading' })} type="button">Читаю</button>
          <button aria-pressed={filter === 'completed'} onClick={() => updateRoute({ filter: 'completed' })} type="button">Завершено</button>
          <button aria-pressed={filter === 'book'} onClick={() => updateRoute({ filter: 'book' })} type="button">Книги</button>
          <button aria-pressed={filter === 'manga'} onClick={() => updateRoute({ filter: 'manga' })} type="button">Манга</button>
          <button aria-pressed={filter === 'favorite'} onClick={() => updateRoute({ filter: 'favorite' })} type="button">Избранное</button>
        </div>
        <label className="library-sort">
          <span className="sr-only">Сортировка библиотеки</span>
          <select aria-label="Сортировка библиотеки" onChange={(event) => updateRoute({ sort: event.target.value as LibrarySort })} value={sort}>
            <option value="added_desc">Сначала добавленные недавно</option>
            <option value="last_opened_desc">Сначала открытые недавно</option>
            <option value="title_asc">По названию</option>
            <option value="progress_desc">По прогрессу</option>
          </select>
        </label>
      </div>

      {status === 'importing' ? (
        <div aria-live="polite" className="notice notice--progress">
          <span className="spinner" />
          Импортируем файлы…
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
          description={routeQuery ? 'Измените запрос или очистите поиск.' : 'Добавьте отдельные файлы или папку. Исходные файлы не перемещаются.'}
          pose="empty-library"
          title={routeQuery ? 'Ничего не найдено' : 'Библиотека пуста'}
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
          <h2>Нет произведений</h2>
          <p>Измените фильтр или добавьте произведение в избранное.</p>
          <Button onClick={() => updateRoute({ filter: 'all' })} variant="secondary">Показать всё</Button>
        </section>
      ) : null}

      {items.length === 0 && status === 'ready' && routeQuery ? (
        <div className="empty-search-mark"><Library aria-hidden="true" /></div>
      ) : null}
    </div>
  );
}

function parseFilter(value: string | null, fallback: LibraryFilter): LibraryFilter {
  return value === 'reading' ||
    value === 'completed' ||
    value === 'book' ||
    value === 'manga' ||
    value === 'favorite'
    ? value
    : fallback;
}

function parseSort(value: string | null): LibrarySort {
  return value === 'title_asc' || value === 'last_opened_desc' || value === 'progress_desc'
    ? value
    : 'added_desc';
}

function setOrDelete(parameters: URLSearchParams, key: string, value: string, defaultValue = '') {
  const normalized = value.trim();
  if (!normalized || normalized === defaultValue) parameters.delete(key);
  else parameters.set(key, normalized);
}
