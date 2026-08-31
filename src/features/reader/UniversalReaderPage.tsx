import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { desktopBridge } from '../../app/bridge';
import type { WorkDetails } from '../../types/library';
import { MangaReaderPage } from '../manga-reader/MangaReaderPage';
import { BookReaderPage } from './BookReaderPage';
import { PdfReaderPage } from './PdfReaderPage';

export function UniversalReaderPage() {
  const { id = '' } = useParams();
  const [work, setWork] = useState<WorkDetails | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void desktopBridge
      .getWork(id)
      .then((value) => active && setWork(value))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [id]);

  if (failed) {
    return (
      <div className="reader-error">
        <Link className="back-link" to="/library"><ArrowLeft aria-hidden="true" /> В библиотеку</Link>
        <div><h1>Произведение не найдено</h1><p>Возможно, оно было удалено из библиотеки.</p></div>
      </div>
    );
  }
  if (!work) return <div aria-label="Выбираем режим чтения" className="reader-loading"><span className="spinner" /></div>;
  if (work.kind === 'manga') return <MangaReaderPage />;
  if (work.format === 'pdf') return <PdfReaderPage />;
  return <BookReaderPage />;
}
