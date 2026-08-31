import { ArrowLeft, BookOpen } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

export function ReaderPlaceholderPage() {
  const { id = '' } = useParams();
  return (
    <div className="reader-placeholder">
      <Link className="back-link" to={`/work/${id}`}><ArrowLeft aria-hidden="true" /> К карточке</Link>
      <div><BookOpen aria-hidden="true" /><h1>Открываем произведение…</h1><p>Reader подключается к локальному файлу.</p></div>
    </div>
  );
}
