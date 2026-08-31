import { ArrowLeft, BookOpen, CheckCircle2, ChevronRight, Download, Globe2, Library, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { desktopBridge, isDesktopRuntime, type DesktopBridge } from '../../app/bridge';
import type { RemoteChapter } from '../../types/sources';

interface RemoteMangaDetailsPageProps {
  bridge?: DesktopBridge;
}

export function RemoteMangaDetailsPage({ bridge }: RemoteMangaDetailsPageProps) {
  const api = bridge ?? desktopBridge;
  const shouldLoad = Boolean(bridge) || isDesktopRuntime();
  const { sourceId = '' } = useParams();
  const [parameters] = useSearchParams();
  const remoteId = parameters.get('remoteId') ?? '';
  const mangaUrl = parameters.get('url') ?? '';
  const title = parameters.get('title') ?? 'Онлайн-манга';
  const summary = parameters.get('summary');
  const coverUrl = parameters.get('coverUrl');
  const invalidLink = !sourceId || !remoteId || !mangaUrl;
  const [chapters, setChapters] = useState<RemoteChapter[]>([]);
  const [downloadAllowed, setDownloadAllowed] = useState(false);
  const [isMangaDex, setIsMangaDex] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [libraryWorkId, setLibraryWorkId] = useState<string | null>(null);
  const [addingToLibrary, setAddingToLibrary] = useState(false);
  const [loading, setLoading] = useState(shouldLoad && !invalidLink);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldLoad || invalidLink) return;
    let active = true;
    const existingWork = typeof api.findRemoteWork === 'function'
      ? api.findRemoteWork(sourceId, remoteId).catch(() => null)
      : Promise.resolve(null);
    void Promise.all([
      api.getSourceChapters(sourceId, remoteId, mangaUrl),
      api.listSources().catch(() => []),
      existingWork,
    ])
      .then(([items, sources, workId]) => {
        if (!active) return;
        setChapters(items);
        setLibraryWorkId(workId);
        const selectedSource = sources.find((source) => source.id === sourceId);
        setDownloadAllowed(Boolean(selectedSource?.capabilities.download));
        setIsMangaDex(selectedSource?.adapterKind === 'mangadex');
      })
      .catch((reason) => active && setError(sourceError(reason)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [api, invalidLink, mangaUrl, remoteId, shouldLoad, sourceId]);

  const visibleError = invalidLink
    ? 'Ссылка на произведение неполная. Вернись в каталог и открой его снова.'
    : error;

  async function downloadChapter(chapter: RemoteChapter) {
    setDownloadingId(chapter.remoteId);
    setDownloadMessage(null);
    try {
      const result = await api.downloadSourceChapter(sourceId, chapter.remoteId, chapter.url);
      setDownloadMessage(`${result.cachedPages} страниц сохранено для офлайн-чтения.`);
    } catch (reason) {
      setDownloadMessage(sourceDownloadError(reason));
    } finally {
      setDownloadingId(null);
    }
  }

  async function addToLibrary() {
    setAddingToLibrary(true);
    setError(null);
    try {
      const workId = await api.addRemoteWorkToLibrary({
        sourceId,
        remoteId,
        title,
        description: summary,
        remoteUrl: mangaUrl,
        coverUrl,
        chapterCount: chapters.length,
      });
      setLibraryWorkId(workId);
    } catch (reason) {
      setError(sourceLibraryError(reason));
    } finally {
      setAddingToLibrary(false);
    }
  }

  return (
    <div className="page remote-manga-page">
      <Link className="back-link" to={`/sources/${sourceId}`}>
        <ArrowLeft aria-hidden="true" /> К каталогу
      </Link>
      <section className="remote-manga-hero">
        <div aria-hidden="true" className="remote-manga-cover">
          {coverUrl ? <img alt="" src={coverUrl} /> : (
            <>
              <Sparkles />
              <strong>{initials(title)}</strong>
              <span>Mochi online</span>
            </>
          )}
        </div>
        <div className="remote-manga-copy">
          <p className="eyebrow"><Globe2 aria-hidden="true" /> Онлайн-произведение</p>
          <h1>{title}</h1>
          {isMangaDex ? (
            <p className="source-attribution">Данные и изображения: MangaDex</p>
          ) : null}
          <div className="remote-manga-badges">
            <span><ShieldCheck aria-hidden="true" /> Проверенный адаптер</span>
            <span>{chapters.length || '—'} глав</span>
          </div>
          <p className="remote-manga-summary">
            {summary || 'Описание не предоставлено источником. Можно сразу выбрать главу и начать чтение.'}
          </p>
          <button
            aria-label={libraryWorkId ? 'В библиотеке' : 'Добавить в библиотеку'}
            className="button button--primary remote-manga-library"
            disabled={loading || addingToLibrary || libraryWorkId !== null}
            onClick={() => void addToLibrary()}
            type="button"
          >
            {libraryWorkId ? <CheckCircle2 aria-hidden="true" /> : <Library aria-hidden="true" />}
            {addingToLibrary ? 'Добавляем…' : libraryWorkId ? 'В библиотеке' : 'Добавить в библиотеку'}
          </button>
        </div>
      </section>

      <section className="remote-chapters">
        <div className="remote-chapters__heading">
          <div><p className="eyebrow">Список глав</p><h2>Читать онлайн</h2></div>
          {!loading ? <span>{chapters.length} {chapterWord(chapters.length)}</span> : null}
        </div>
        {loading ? <div className="persistent-loading"><span className="spinner" /><p>Собираем главы…</p></div> : null}
        {visibleError ? <div className="notice notice--error" role="alert">{visibleError}</div> : null}
        {downloadMessage ? <div className="notice notice--success" role="status"><CheckCircle2 aria-hidden="true" /> {downloadMessage}</div> : null}
        {!loading && !visibleError && chapters.length === 0 ? (
          <div className="section-empty"><BookOpen aria-hidden="true" /><h3>Глав пока нет</h3><p>Источник не вернул доступных глав.</p></div>
        ) : null}
        {chapters.length > 0 ? (
          <ol className="remote-chapter-list">
            {chapters.map((chapter, index) => (
              <li key={`${chapter.remoteId}:${chapter.url}`}>
                <Link
                  aria-label={`Читать ${chapter.title}`}
                  to={readerUrl(sourceId, chapter, title, remoteId, mangaUrl, summary, coverUrl, libraryWorkId)}
                >
                  <span className="remote-chapter-list__index">{String(index + 1).padStart(2, '0')}</span>
                  <span>
                    <strong>{chapter.title}</strong>
                    <small>
                      {chapter.attribution
                        ? `Перевод: ${chapter.attribution}`
                        : 'Открыть в Manga Reader'}
                    </small>
                  </span>
                  <ChevronRight aria-hidden="true" />
                </Link>
                {downloadAllowed ? (
                  <button
                    aria-label={`Скачать ${chapter.title}`}
                    className="remote-chapter-download"
                    disabled={downloadingId !== null}
                    onClick={() => void downloadChapter(chapter)}
                    type="button"
                  >
                    {downloadingId === chapter.remoteId ? <span className="spinner" /> : <Download aria-hidden="true" />}
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    </div>
  );
}

function readerUrl(
  sourceId: string,
  chapter: RemoteChapter,
  mangaTitle: string,
  mangaRemoteId: string,
  mangaUrl: string,
  summary: string | null,
  coverUrl: string | null,
  workId: string | null,
) {
  const parameters = new URLSearchParams({
    chapterId: chapter.remoteId,
    chapterUrl: chapter.url,
    chapterTitle: chapter.title,
    mangaTitle,
    mangaRemoteId,
    mangaUrl,
  });
  if (summary) parameters.set('summary', summary);
  if (coverUrl) parameters.set('coverUrl', coverUrl);
  if (workId) parameters.set('workId', workId);
  return `/sources/${encodeURIComponent(sourceId)}/read?${parameters.toString()}`;
}

function initials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function sourceError(reason: unknown) {
  if (typeof reason === 'object' && reason !== null && 'userMessage' in reason) {
    return String(reason.userMessage);
  }
  return 'Не удалось загрузить главы. Источник мог изменить структуру страницы.';
}

function sourceDownloadError(reason: unknown) {
  if (typeof reason === 'object' && reason !== null && 'userMessage' in reason) {
    return String(reason.userMessage);
  }
  return 'Не удалось сохранить главу для офлайн-чтения.';
}

function sourceLibraryError(reason: unknown) {
  if (typeof reason === 'object' && reason !== null && 'userMessage' in reason) {
    return String(reason.userMessage);
  }
  return 'Не удалось добавить мангу в библиотеку.';
}

function chapterWord(value: number) {
  const tens = value % 100;
  const ones = value % 10;
  if (tens >= 11 && tens <= 14) return 'глав';
  if (ones === 1) return 'глава';
  if (ones >= 2 && ones <= 4) return 'главы';
  return 'глав';
}
