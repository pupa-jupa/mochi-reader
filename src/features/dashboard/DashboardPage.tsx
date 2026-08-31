import { ArrowRight, BookOpen, Clock3, FolderHeart, Plus, Sparkles } from 'lucide-react';
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

  useEffect(() => {
    if (status === 'idle') void libraryStore.getState().load();
  }, [status]);

  return (
    <div className="page dashboard-page">
      <section className="welcome-card">
        <div className="welcome-card__copy">
          <p className="eyebrow"><Sparkles aria-hidden="true" /> Тихий уголок для чтения</p>
          <h1>{reading ? 'Продолжим с того места?' : 'Какая история будет первой?'}</h1>
          <p>
            {reading
              ? `«${reading.title}» уже ждёт. Прогресс сохранён автоматически.`
              : 'Добавь книгу или мангу — всё останется локально на этом компьютере.'}
          </p>
          <div className="welcome-card__actions">
            {reading ? (
              <Link className="button button--primary" to={`/read/${reading.id}`}>
                <BookOpen aria-hidden="true" /> Продолжить чтение
              </Link>
            ) : (
              <Button onClick={() => void libraryStore.getState().importFiles()}>
                <Plus aria-hidden="true" /> Добавить первую книгу
              </Button>
            )}
            <Link className="text-link" to="/library">Открыть библиотеку <ArrowRight aria-hidden="true" /></Link>
          </div>
        </div>
        <Mascot className="welcome-card__mascot" hidden={!showMascot} pose="welcome" />
      </section>

      <section aria-label="Сводка библиотеки" className="stats-row">
        <article className="stat-card stat-card--accent">
          <BookOpen aria-hidden="true" />
          <div><strong>{total}</strong><span>на полке</span></div>
        </article>
        <article className="stat-card">
          <Clock3 aria-hidden="true" />
          <div><strong>{items.filter((item) => item.status === 'reading').length}</strong><span>читаю сейчас</span></div>
        </article>
        <article className="stat-card">
          <FolderHeart aria-hidden="true" />
          <div><strong>{items.filter((item) => item.favorite).length}</strong><span>любимых</span></div>
        </article>
      </section>

      {items.length > 0 ? (
        <section className="dashboard-section">
          <div className="section-heading">
            <div><p className="eyebrow">Недавно добавлено</p><h2>На твоей полке</h2></div>
            <Link className="text-link" to="/library">Смотреть все <ArrowRight aria-hidden="true" /></Link>
          </div>
          <div className="library-grid library-grid--compact">
            {items.slice(0, 4).map((work) => <BookCard key={work.id} onToggleFavorite={() => void libraryStore.getState().toggleFavorite(work.id)} work={work} />)}
          </div>
        </section>
      ) : (
        <section className="reading-note">
          <div className="reading-note__mark">“</div>
          <blockquote>Книга — это тихий разговор, который можно продолжить в любой вечер.</blockquote>
          <p>Пока библиотека пуста, здесь будет немного воздуха.</p>
        </section>
      )}
    </div>
  );
}
