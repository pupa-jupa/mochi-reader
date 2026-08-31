import { ArrowLeft } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { desktopBridge, isDesktopRuntime, type DesktopBridge } from '../../app/bridge';
import { MangaReader } from '../manga-reader/MangaReaderPage';
import type { MangaManifest } from '../../types/manga';
import type { RemotePage } from '../../types/sources';

interface RemoteMangaReaderPageProps {
  bridge?: DesktopBridge;
}

export function RemoteMangaReaderPage({ bridge }: RemoteMangaReaderPageProps) {
  const api = bridge ?? desktopBridge;
  const shouldLoad = Boolean(bridge) || isDesktopRuntime();
  const { sourceId = '' } = useParams();
  const [parameters] = useSearchParams();
  const chapterId = parameters.get('chapterId') ?? '';
  const chapterUrl = parameters.get('chapterUrl') ?? '';
  const chapterTitle = parameters.get('chapterTitle') ?? 'Глава';
  const mangaTitle = parameters.get('mangaTitle') ?? 'Онлайн-манга';
  const mangaRemoteId = parameters.get('mangaRemoteId') ?? '';
  const mangaUrl = parameters.get('mangaUrl') ?? '';
  const invalidLink = !sourceId || !chapterId || !chapterUrl;
  const [pages, setPages] = useState<RemotePage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldLoad || invalidLink) return;
    let active = true;
    void api
      .getSourcePages(sourceId, chapterId, chapterUrl)
      .then((items) => {
        if (!active) return;
        if (items.length === 0) {
          setError('Источник не вернул ни одной страницы для этой главы.');
          return;
        }
        setPages(items);
      })
      .catch((reason) => active && setError(sourceError(reason)));
    return () => {
      active = false;
    };
  }, [api, chapterId, chapterUrl, invalidLink, shouldLoad, sourceId]);

  const manifest = useMemo<MangaManifest | null>(() => {
    if (!pages) return null;
    return {
      workId: `remote:${sourceId}:${stableHash(chapterId)}`,
      title: `${mangaTitle} · ${chapterTitle}`,
      pages: pages.map((page) => ({
        index: page.index,
        label: page.label,
        mediaType: imageMediaType(page.url),
      })),
    };
  }, [chapterId, chapterTitle, mangaTitle, pages, sourceId]);

  const backTo = mangaDetailsUrl(sourceId, mangaRemoteId, mangaUrl, mangaTitle);
  const visibleError = invalidLink
    ? 'Ссылка на главу неполная. Вернись в каталог и открой её снова.'
    : error;

  if (visibleError) {
    return (
      <div className="manga-error">
        <Link className="manga-back" to={backTo}><ArrowLeft aria-hidden="true" /> К главам</Link>
        <div><h1>Глава не открылась</h1><p>{visibleError}</p></div>
      </div>
    );
  }
  if (!manifest || !pages) {
    return <div aria-label="Открываем онлайн-главу" className="manga-loading"><span className="spinner" /><p>Загружаем список страниц…</p></div>;
  }
  return (
    <MangaReader
      backTo={backTo}
      loadPage={(index) => {
        const page = pages[index];
        if (!page) return Promise.reject(new Error('Страница вне диапазона главы.'));
        return api.getSourcePage(sourceId, page.url, index);
      }}
      manifest={manifest}
    />
  );
}

function mangaDetailsUrl(sourceId: string, remoteId: string, mangaUrl: string, title: string) {
  if (!remoteId || !mangaUrl) return `/sources/${sourceId}`;
  const parameters = new URLSearchParams({ remoteId, url: mangaUrl, title });
  return `/sources/${encodeURIComponent(sourceId)}/manga?${parameters.toString()}`;
}

function stableHash(value: string) {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function imageMediaType(url: string) {
  const path = url.split(/[?#]/, 1)[0]?.toLowerCase() ?? '';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.avif')) return 'image/avif';
  if (path.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function sourceError(reason: unknown) {
  if (typeof reason === 'object' && reason !== null && 'userMessage' in reason) {
    return String(reason.userMessage);
  }
  return 'Не удалось получить страницы главы. Проверь подключение и источник.';
}
