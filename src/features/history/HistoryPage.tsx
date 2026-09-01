import { BookOpen, Clock3, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { desktopBridge, isDesktopRuntime, type DesktopBridge } from '../../app/bridge';
import { Button } from '../../components/Button';
import { SectionEmpty } from '../../components/SectionEmpty';
import type { HistoryEntry, ReaderLocator } from '../../types/persistence';

interface HistoryPageProps {
  bridge?: DesktopBridge;
}

const groupOrder = ['Сегодня', 'Вчера', 'На этой неделе', 'Раньше'] as const;
type HistoryGroupName = (typeof groupOrder)[number];

export function HistoryPage({ bridge }: HistoryPageProps) {
  const api = bridge ?? desktopBridge;
  const shouldLoad = Boolean(bridge) || isDesktopRuntime();
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(shouldLoad);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups = useMemo(() => groupHistory(items), [items]);

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

  async function remove(entry: HistoryEntry) {
    setError(null);
    try {
      await api.deleteHistoryEntry(entry.id);
      setItems((current) => current.filter((item) => item.id !== entry.id));
    } catch {
      setError('Не удалось удалить запись из истории.');
    }
  }

  if (!loading && items.length === 0 && !error) {
    return (
      <SectionEmpty
        action={{ label: 'Открыть библиотеку', to: '/library' }}
        description="Открытые главы и страницы появятся здесь. История хранится только на этом устройстве."
        eyebrow="Последние сеансы"
        icon={Clock3}
        title="История пока пуста"
      />
    );
  }

  return (
    <div className="page simple-page persistent-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Последние сеансы</p>
          <h1>История</h1>
          <p>Последние позиции и время чтения. Всё хранится только на этом устройстве.</p>
        </div>
        {items.length > 0 ? (
          <Button
            aria-label={confirming ? 'Подтвердить очистку' : 'Очистить историю'}
            onClick={() => void clear()}
            variant={confirming ? 'danger' : 'ghost'}
          >
            <Trash2 aria-hidden="true" /> {confirming ? 'Точно очистить?' : 'Очистить'}
          </Button>
        ) : null}
      </header>
      {confirming ? (
        <div className="notice notice--error">
          <span>История будет удалена без затрагивания книг и прогресса.</span>
          <button aria-label="Отменить очистку" onClick={() => setConfirming(false)} type="button">
            Отмена
          </button>
        </div>
      ) : null}
      {error ? <div className="notice notice--error" role="alert">{error}</div> : null}
      {loading ? (
        <div className="persistent-loading"><span className="spinner" /><p>Загружаем историю…</p></div>
      ) : null}
      {!loading ? (
        <div className="history-groups">
          {groups.map((group) => (
            <section className="history-group" key={group.name}>
              <h2>{group.name}</h2>
              <div className="history-list">
                {group.items.map((entry) => (
                  <article className="history-row" key={entry.id}>
                    <div className="history-row__icon"><Clock3 aria-hidden="true" /></div>
                    <div className="history-row__copy">
                      <p className="history-row__kind">{entry.workKind === 'manga' ? 'Манга' : 'Книга'}</p>
                      <h3><Link to={`/read/${entry.workId}`}>{entry.workTitle}</Link></h3>
                      <p>
                        {locationLabel(entry.endLocator ?? entry.startLocator)}
                        {' · '}{formatDateTime(entry.startedAt)}
                        {' · '}{formatDuration(entry.durationSeconds)}
                      </p>
                    </div>
                    <div className="history-row__actions">
                      <Link
                        aria-label={`Продолжить ${entry.workTitle}`}
                        className="button button--secondary"
                        to={`/read/${entry.workId}`}
                      >
                        <BookOpen aria-hidden="true" /> Продолжить
                      </Link>
                      <button
                        aria-label={`Удалить ${entry.workTitle} из истории`}
                        className="icon-button"
                        onClick={() => void remove(entry)}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function groupHistory(items: HistoryEntry[]) {
  const grouped = new Map<HistoryGroupName, HistoryEntry[]>(
    groupOrder.map((name) => [name, []]),
  );
  for (const entry of items) grouped.get(historyGroup(entry.startedAt))?.push(entry);
  return groupOrder
    .map((name) => ({ name, items: grouped.get(name) ?? [] }))
    .filter((group) => group.items.length > 0);
}

function historyGroup(value: string): HistoryGroupName {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Раньше';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const week = new Date(today);
  const day = week.getDay() || 7;
  week.setDate(week.getDate() - day + 1);
  if (date >= today) return 'Сегодня';
  if (date >= yesterday) return 'Вчера';
  if (date >= week) return 'На этой неделе';
  return 'Раньше';
}

function locationLabel(locator: ReaderLocator) {
  if (locator.kind === 'pdf') return `Страница ${locator.pageIndex + 1}`;
  if (locator.kind === 'manga') {
    const chapter = locator.chapterId ? 'Глава · ' : '';
    return `${chapter}Страница ${locator.pageIndex + 1}`;
  }
  if (locator.charOffset !== null) return `Глава книги · позиция ${locator.charOffset}`;
  return locator.chapterId ? 'Глава книги' : 'Произведение открыто';
}

function formatDuration(value: number | null) {
  if (value === null) return 'Сессия не завершена';
  const minutes = Math.max(1, Math.round(value / 60));
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours} ч ${remainder} мин` : `${hours} ч`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('ru', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}
