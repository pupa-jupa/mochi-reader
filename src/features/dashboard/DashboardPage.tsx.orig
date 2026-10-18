import { ArrowRight, BookOpen, Database, Feather, Plus, Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from 'zustand';

import { BookCard } from '../../components/BookCard';
import { Button } from '../../components/Button';
import { Mascot } from '../../components/Mascot';
import { libraryStore } from '../../stores/libraryStore';
import { useSettingsStore } from '../../stores/settingsStore';

export function DashboardPage() {
  const items = useStore(libraryStore, (state) => state.items);
  const status = useStore(libraryStore, (state) => state.status);
  const total = useStore(libraryStore, (state) => state.total);
  const showMascot = useSettingsStore((state) => state.showMascot);
  const reading = items.find((item) => item.status === 'reading' || item.progressPercent > 0);
  const readingProgress = Math.round(reading?.progressPercent ?? 0);
  const today = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'long' }).format(new Date());

  useEffect(() => {
    if (status === 'idle') void libraryStore.getState().load();
  }, [status]);

  return (
    <div className="page dashboard-page">
      <section aria-label="Текущая книга" className="journal-hero">
        <div aria-hidden="true" className="journal-hero__folio">01</div>
        <div aria-hidden="true" className="journal-hero__ribbon">сегодня</div>
        <div className="journal-hero__copy">
          <p className="journal-date"><Feather aria-hidden="true" /> {today}</p>
          <p className="eyebrow"><Sparkles aria-hidden="true" /> Текущая книга</p>
          <h1>{reading ? reading.title : 'Библиотека пуста'}</h1>
          <p className="journal-hero__subtitle">
            {reading
              ? `${reading.author || 'Автор не указан'} · прогресс сохранён автоматически.`
              : 'Добавьте книгу, мангу или папку с файлами, чтобы начать чтение.'}
          </p>
          {reading ? (
            <div className="journal-progress">
              <div
                aria-label={`Прочитано ${readingProgress}%`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={readingProgress}
                role="progressbar"
              >
                <span style={{ width: `${Math.min(100, Math.max(0, readingProgress))}%` }} />
              </div>
              <small>Прочитано: {readingProgress}%</small>
            </div>
          ) : null}
          <div className="journal-hero__actions">
            {reading ? (
              <Link className="button button--primary" to={`/read/${reading.id}`}>
                <BookOpen aria-hidden="true" /> Продолжить чтение
              </Link>
            ) : (
              <Button onClick={() => void libraryStore.getState().importFiles()}>
                <Plus aria-hidden="true" /> Добавить книги
              </Button>
            )}
            <Link className="text-link" to="/library">Открыть библиотеку <ArrowRight aria-hidden="true" /></Link>
          </div>
        </div>
        <div aria-hidden="true" className="journal-hero__botanical"><i /><i /><i /></div>
        <Mascot className="journal-hero__mascot" hidden={!showMascot} pose="welcome" />
      </section>

      <section aria-label="Сводка библиотеки" className="journal-marginalia">
        <div className="journal-marginalia__heading"><span>Статистика</span><strong>Библиотека</strong></div>
        <dl>
          <div><dt>всего</dt><dd>{total}</dd></div>
          <div><dt>читаю</dt><dd>{items.filter((item) => item.status === 'reading').length}</dd></div>
          <div><dt>избранное</dt><dd>{items.filter((item) => item.favorite).length}</dd></div>
        </dl>
        <div className="journal-marginalia__note"><Database aria-hidden="true" /><span>Данные хранятся локально.</span></div>
      </section>

      {items.length > 0 ? (
        <section className="dashboard-section journal-shelf">
          <div className="section-heading">
            <div><p className="eyebrow">Недавние</p><h2>Последние добавленные</h2></div>
            <Link className="text-link" to="/library">Смотреть все <ArrowRight aria-hidden="true" /></Link>
          </div>
          <div className="library-grid library-grid--compact">
            {items.slice(0, 4).map((work) => <BookCard key={work.id} onToggleFavorite={() => void libraryStore.getState().toggleFavorite(work.id)} work={work} />)}
          </div>
          <div aria-hidden="true" className="journal-shelf__edge" />
        </section>
      ) : (
        <section className="reading-note">
          <div className="reading-note__mark">i</div>
          <blockquote>Недавние книги появятся после первого импорта.</blockquote>
          <p>Поддерживаются локальные файлы, папки и подключённые каталоги.</p>
        </section>
      )}
    </div>
  );
}
