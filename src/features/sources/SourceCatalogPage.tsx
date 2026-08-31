import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Search, Sparkles } from 'lucide-react';
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
          <h2>Что хочется почитать сегодня?</h2>
          <p>Введи название — результаты появятся здесь уютной полкой.</p>
        </section>
      ) : null}

      {submittedQuery && !searching && items.length === 0 && !error ? (
        <section className="source-catalog-empty">
          <BookOpen aria-hidden="true" />
          <h2>Ничего не нашлось</h2>
          <p>Попробуй другое название или более короткий запрос.</p>
        </section>
      ) : null}

      {items.length > 0 ? (
        <>
          <div className="source-result-heading">
            <div><p className="eyebrow">Результаты</p><h2>«{submittedQuery}»</h2></div>
            <span>Страница {page}</span>
          </div>
          <section aria-label="Результаты поиска" className="source-result-grid">
            {items.map((item) => (
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
            ))}
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
  return 'Не удалось выполнить поиск. Проверь источник и попробуй снова.';
}
