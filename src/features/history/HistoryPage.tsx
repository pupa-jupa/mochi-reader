import { BookOpen, Clock3, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { desktopBridge, isDesktopRuntime, type DesktopBridge } from '../../app/bridge';
import { Button } from '../../components/Button';
import { SectionEmpty } from '../../components/SectionEmpty';
import type { HistoryEntry } from '../../types/persistence';

interface HistoryPageProps {
  bridge?: DesktopBridge;
}

export function HistoryPage({ bridge }: HistoryPageProps) {
  const api = bridge ?? desktopBridge;
  const shouldLoad = Boolean(bridge) || isDesktopRuntime();
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(shouldLoad);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldLoad) return;
    let active = true;
    void api
      .listHistory(200)
      .then((history) => active && setItems(history))
      .catch(() => active && setError('Не удалось загрузить историю чтения.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [api, shouldLoad]);

  async function clear() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    try {
      await api.clearHistory();
      setItems([]);
      setConfirming(false);
    } catch {
      setError('Не удалось очистить историю.');
    }
  }

  if (!loading && items.length === 0 && !error) {
    return (
      <SectionEmpty
        action={{ label: 'Найти, что почитать', to: '/library' }}
        description="Здесь появятся главы и страницы, которые ты открывал. История хранится только на этом устройстве."
        eyebrow="Недавнее чтение"
        icon={Clock3}
        title="История пока пуста"
      />
    );
  }

  return (
    <div className="page simple-page persistent-page">
      <header className="page-heading">
        <div><p className="eyebrow">Недавнее чтение</p><h1>История</h1><p>Последние открытые книги, главы и страницы.</p></div>
        {items.length > 0 ? (
          <Button aria-label={confirming ? 'Подтвердить очистку' : 'Очистить историю'} onClick={() => void clear()} variant={confirming ? 'danger' : 'ghost'}>
            <Trash2 aria-hidden="true" /> {confirming ? 'Точно очистить?' : 'Очистить'}
          </Button>
        ) : null}
      </header>
      {confirming ? <div className="notice notice--error"><span>История будет удалена без затрагивания книг и прогресса.</span><button aria-label="Отменить очистку" onClick={() => setConfirming(false)} type="button">Отмена</button></div> : null}
      {error ? <div className="notice notice--error" role="alert">{error}</div> : null}
      {loading ? <div className="persistent-loading"><span className="spinner" /><p>Собираем недавнее…</p></div> : null}
      {!loading ? (
        <div className="history-list">
          {items.map((entry) => (
            <article className="history-row" key={entry.id}>
              <div className="history-row__icon"><Clock3 aria-hidden="true" /></div>
              <div><h2><Link to={`/read/${entry.workId}`}>{entry.workTitle}</Link></h2><p>{locationLabel(entry)} · {formatDateTime(entry.openedAt)}</p></div>
              <Link aria-label={`Продолжить ${entry.workTitle}`} className="button button--secondary" to={`/read/${entry.workId}`}><BookOpen aria-hidden="true" /> Продолжить</Link>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function locationLabel(entry: HistoryEntry) {
  if (entry.pageIndex !== null) return `Страница ${entry.pageIndex + 1}`;
  if (entry.chapterId) return 'Глава книги';
  return 'Произведение открыто';
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}
