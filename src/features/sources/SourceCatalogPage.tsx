import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Download, Search, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { desktopBridge, isDesktopRuntime, type DesktopBridge } from '../../app/bridge';
import { Button } from '../../components/Button';
import type { RemoteMangaSummary, SourceConfig } from '../../types/sources';

interface SourceCatalogPageProps {
  bridge?: DesktopBridge;
}

export function SourceCatalogPage({ bridge }: SourceCatalogPageProps) {
  const api = bridge ?? desktopBridge;
  const shouldLoad = Boolean(bridge) || isDesktopRuntime();
  const { sourceId = '' } = useParams();
  const [source, setSource] = useState<SourceConfig | null>(null);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<RemoteMangaSummary[]>([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loadingSource, setLoadingSource] = useState(shouldLoad);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importedWorkIds, setImportedWorkIds] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!shouldLoad || !sourceId) return;
    let active = true;
    void api
      .listSources()
      .then((sources) => {
        if (!active) return;
        setSource(sources.find((item) => item.id === sourceId) ?? null);
      })
      .catch(() => active && setError('Не удалось открыть источник.'))
      .finally(() => active && setLoadingSource(false));
    return () => {
      active = false;
    };
  }, [api, shouldLoad, sourceId]);

  async function runSearch(nextQuery: string, nextPage: number) {
    const cleanQuery = nextQuery.trim();
    if (!cleanQuery || !sourceId) return;
    setSearching(true);
    setError(null);
    try {
      const result = await api.searchSource(sourceId, cleanQuery, nextPage);
      setItems(result.items);
      setHasNextPage(result.hasNextPage);
      setSubmittedQuery(cleanQuery);
      setPage(nextPage);
    } catch (reason) {
      setError(sourceError(reason));
      setItems([]);
      setHasNextPage(false);
    } finally {
      setSearching(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void runSearch(query, 1);
  }

  async function importBook(item: RemoteMangaSummary) {
    if (!item.acquisitionUrl || !sourceId) return;
    setImportingId(item.remoteId);
    setError(null);
    try {
      const workId = await api.importOpdsBook(sourceId, item.acquisitionUrl, item.title);
      setImportedWorkIds((current) => ({ ...current, [item.remoteId]: workId }));
    } catch (reason) {
      setError(sourceError(reason));
    } finally {
      setImportingId(null);
    }
  }

  const title = source?.name ?? (loadingSource ? 'Открываем каталог…' : 'Источник не найден');
  const sourceHost = useMemo(() => safeHost(source?.baseUrl), [source?.baseUrl]);

  return (
    <div className="page source-catalog-page">
      <header className="source-catalog-heading">
        <Link aria-label="Вернуться к источникам" className="icon-button" to="/sources">
          <ArrowLeft aria-hidden="true" />
        </Link>
        <div>
          <p className="eyebrow">Онлайн-каталог {sourceHost ? `· ${sourceHost}` : ''}</p>
          <h1>{title}</h1>
          <p>Поиск идёт через проверенный адаптер; сайт не запускает код внутри приложения.</p>
          {source?.adapterKind === 'mangadex' ? (
            <p className="source-attribution">Данные и изображения: MangaDex</p>
          ) : null}
        </div>
      </header>

      {source && !source.enabled ? (
        <div className="notice notice--error" role="alert">
          Источник выключен. Включи его на странице источников, чтобы искать каталог.
        </div>
      ) : null}

      <form className="source-search" onSubmit={submit} role="search">
        <Search aria-hidden="true" />
        <input
          aria-label="Поиск по каталогу"
          disabled={!source?.enabled || searching}
          maxLength={200}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Название манги, автора или серии"
          type="search"
          value={query}
        />
        <Button disabled={!source?.enabled || !query.trim() || searching} type="submit">
          {searching ? <span className="spinner" /> : <Search aria-hidden="true" />} Найти
        </Button>
      </form>

      {error ? <div className="notice notice--error" role="alert">{error}</div> : null}

      {!submittedQuery && !searching ? (
        <section className="source-catalog-empty">
          <Sparkles aria-hidden="true" />
          <h2>Поиск по каталогу</h2>
          <p>Введите название, автора или серию.</p>
        </section>
      ) : null}

      {submittedQuery && !searching && items.length === 0 && !error ? (
        <section className="source-catalog-empty">
          <BookOpen aria-hidden="true" />
          <h2>Ничего не найдено</h2>
          <p>Измените название или сократите запрос.</p>
        </section>
      ) : null}

      {items.length > 0 ? (
        <>
          <div className="source-result-heading">
            <div><p className="eyebrow">Результаты</p><h2>«{submittedQuery}»</h2></div>
            <span>Страница {page}</span>
          </div>
          <section aria-label="Результаты поиска" className="source-result-grid">
            {items.map((item) => {
              const workId = importedWorkIds[item.remoteId];
              if (item.contentKind === 'book' || source?.adapterKind === 'opds') {
                return (
                  <article className="source-result-card" key={`${item.remoteId}:${item.url}`}>
                    <div aria-hidden="true" className="source-result-card__cover">
                      <span>{initials(item.title)}</span>
                      <Sparkles />
                    </div>
                    <div className="source-result-card__body">
                      <h3>{item.title}</h3>
                      {item.author ? <strong>{item.author}</strong> : null}
                      <p>{item.summary || 'Описание в каталоге не указано.'}</p>
                      {workId ? (
                        <Link aria-label={`Открыть ${item.title}`} className="button button--secondary" to={`/work/${encodeURIComponent(workId)}`}>
                          <BookOpen aria-hidden="true" /> Открыть книгу
                        </Link>
                      ) : item.acquisitionUrl ? (
                        <Button
                          aria-label={`Добавить ${item.title} в библиотеку`}
                          disabled={importingId === item.remoteId}
                          onClick={() => void importBook(item)}
                          variant="secondary"
                        >
                          {importingId === item.remoteId ? <span className="spinner" /> : <Download aria-hidden="true" />}
                          Добавить {item.format?.toUpperCase() || 'книгу'}
                        </Button>
                      ) : <span>Нет open-access файла</span>}
                    </div>
                  </article>
                );
              }
              return (
                <Link
                  aria-label={`Открыть ${item.title}`}
                  className="source-result-card"
                  key={`${item.remoteId}:${item.url}`}
                  to={mangaDetailsUrl(sourceId, item)}
                >
                  <div aria-hidden="true" className="source-result-card__cover">
                    <span>{initials(item.title)}</span>
                    <Sparkles />
                  </div>
                  <div className="source-result-card__body">
                    <h3>{item.title}</h3>
                    <p>{item.summary || 'Описание появится на странице произведения.'}</p>
                    <span><BookOpen aria-hidden="true" /> Открыть главы</span>
                  </div>
                </Link>
              );
            })}
          </section>
          <nav aria-label="Страницы каталога" className="source-pagination">
            <Button disabled={page <= 1 || searching} onClick={() => void runSearch(submittedQuery, page - 1)} variant="secondary">
              <ChevronLeft aria-hidden="true" /> Назад
            </Button>
            <span>{page}</span>
            <Button disabled={!hasNextPage || searching} onClick={() => void runSearch(submittedQuery, page + 1)} variant="secondary">
              Далее <ChevronRight aria-hidden="true" />
            </Button>
          </nav>
        </>
      ) : null}
    </div>
  );
}

function mangaDetailsUrl(sourceId: string, manga: RemoteMangaSummary) {
  const parameters = new URLSearchParams({
    remoteId: manga.remoteId,
    url: manga.url,
    title: manga.title,
  });
  if (manga.summary) parameters.set('summary', manga.summary);
  if (manga.coverUrl) parameters.set('coverUrl', manga.coverUrl);
  return `/sources/${encodeURIComponent(sourceId)}/manga?${parameters.toString()}`;
}

function initials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function safeHost(value?: string) {
  if (!value) return '';
  try {
    return new URL(value).host;
  } catch {
    return '';
  }
}

function sourceError(reason: unknown) {
  if (typeof reason === 'object' && reason !== null && 'userMessage' in reason) {
    return String(reason.userMessage);
  }
  return 'Не удалось выполнить поиск. Проверьте источник и повторите попытку.';
}
