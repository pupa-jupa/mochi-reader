import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';

import { desktopBridge, type DesktopBridge } from '../../app/bridge';
import type { WorkDetails } from '../../types/library';
import type { RemoteChapter } from '../../types/sources';
import { MangaReaderPage } from '../manga-reader/MangaReaderPage';
import { BookReaderPage } from './BookReaderPage';
import { PdfReaderPage } from './PdfReaderPage';

interface UniversalReaderPageProps {
  bridge?: DesktopBridge;
}

export function UniversalReaderPage({ bridge = desktopBridge }: UniversalReaderPageProps) {
  const { id = '' } = useParams();
  const [work, setWork] = useState<WorkDetails | null>(null);
  const [redirect, setRedirect] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void bridge.getWork(id)
      .then(async (value) => {
        if (value.originKind !== 'remote') {
          if (active) setWork(value);
          return;
        }
        const detailsUrl = remoteDetailsUrl(value);
        if (!value.sourceId || !value.remoteId || !value.remoteUrl) {
          if (active) setRedirect(detailsUrl);
          return;
        }
        const progress = await bridge.getProgress(id).catch(() => null);
        const chapterId = progress?.locator.kind === 'manga'
          ? progress.locator.chapterId
          : null;
        if (!chapterId) {
          if (active) setRedirect(detailsUrl);
          return;
        }
        const chapters = await bridge.getSourceChapters(
          value.sourceId,
          value.remoteId,
          value.remoteUrl,
        );
        const chapter = chapters.find((item) => item.remoteId === chapterId);
        if (active) setRedirect(chapter ? remoteReaderUrl(value, chapter) : detailsUrl);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [bridge, id]);

  if (failed) {
    return (
      <div className="reader-error">
        <Link className="back-link" to="/library"><ArrowLeft aria-hidden="true" /> В библиотеку</Link>
        <div><h1>Произведение не найдено</h1><p>Возможно, оно было удалено из библиотеки.</p></div>
      </div>
    );
  }
  if (redirect) return <Navigate replace to={redirect} />;
  if (!work) return <div aria-label="Выбираем режим чтения" className="reader-loading"><span className="spinner" /></div>;
  if (work.kind === 'manga') return <MangaReaderPage />;
  if (work.format === 'pdf') return <PdfReaderPage />;
  return <BookReaderPage />;
}

function remoteDetailsUrl(work: WorkDetails) {
  if (!work.sourceId || !work.remoteId || !work.remoteUrl) return `/work/${work.id}`;
  const parameters = new URLSearchParams({
    remoteId: work.remoteId,
    url: work.remoteUrl,
    title: work.title,
  });
  if (work.description) parameters.set('summary', work.description);
  if (work.remoteCoverUrl) parameters.set('coverUrl', work.remoteCoverUrl);
  return `/sources/${encodeURIComponent(work.sourceId)}/manga?${parameters.toString()}`;
}

function remoteReaderUrl(work: WorkDetails, chapter: RemoteChapter) {
  if (!work.sourceId || !work.remoteId || !work.remoteUrl) return remoteDetailsUrl(work);
  const parameters = new URLSearchParams({
    chapterId: chapter.remoteId,
    chapterUrl: chapter.url,
    chapterTitle: chapter.title,
    mangaTitle: work.title,
    mangaRemoteId: work.remoteId,
    mangaUrl: work.remoteUrl,
    workId: work.id,
  });
  if (work.description) parameters.set('summary', work.description);
  if (work.remoteCoverUrl) parameters.set('coverUrl', work.remoteCoverUrl);
  return `/sources/${encodeURIComponent(work.sourceId)}/read?${parameters.toString()}`;
}
