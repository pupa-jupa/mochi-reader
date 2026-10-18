import { ArrowLeft, FolderHeart, Library, Pencil, Save, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { desktopBridge, isDesktopRuntime, type DesktopBridge } from '../../app/bridge';
import { BookCard } from '../../components/BookCard';
import type { CollectionDetails } from '../../types/persistence';

interface CollectionDetailsPageProps {
  bridge?: DesktopBridge;
}

type CollectionSort = 'added' | 'title' | 'progress';

export function CollectionDetailsPage({ bridge }: CollectionDetailsPageProps) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const api = bridge ?? desktopBridge;
  const shouldLoad = Boolean(bridge) || isDesktopRuntime();
  const [collection, setCollection] = useState<CollectionDetails | null>(null);
  const [loading, setLoading] = useState(shouldLoad);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<CollectionSort>('added');
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!shouldLoad || !id) return;
    let active = true;
    void api
      .getCollection(id)
      .then((value) => active && setCollection(value))
      .catch(() => active && setError('Не удалось открыть коллекцию.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [api, id, shouldLoad]);

  const items = useMemo(() => {
    const values = [...(collection?.items ?? [])];
    if (sort === 'title') return values.sort((left, right) => left.title.localeCompare(right.title));
    if (sort === 'progress') return values.sort((left, right) => right.progressPercent - left.progressPercent);
    return values;
  }, [collection?.items, sort]);

  async function remove(workId: string) {
    if (!collection) return;
    setError(null);
    try {
      await api.removeFromCollection(collection.id, workId);
      setCollection((current) =>
        current
          ? {
              ...current,
              itemCount: Math.max(0, current.itemCount - 1),
              items: current.items.filter((item) => item.id !== workId),
            }
          : current,
      );
    } catch {
      setError('Не удалось убрать произведение из коллекции.');
    }
  }

  async function toggleFavorite(workId: string) {
    const work = collection?.items.find((item) => item.id === workId);
    if (!work) return;
    const favorite = !work.favorite;
    setCollection((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === workId ? { ...item, favorite } : item,
            ),
          }
        : current,
    );
    try {
      await api.setFavorite(workId, favorite);
    } catch {
      setCollection((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === workId ? { ...item, favorite: work.favorite } : item,
              ),
            }
          : current,
      );
      setError('Не удалось изменить избранное.');
    }
  }

  function startEditing() {
    if (!collection) return;
    setTitleDraft(collection.title);
    setDescriptionDraft(collection.description ?? '');
    setEditing(true);
    setConfirmingDelete(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!collection || !titleDraft.trim()) return;
    setBusy(true);
    setError(null);
    const title = titleDraft.trim();
    const description = descriptionDraft.trim() || null;
    try {
      await api.updateCollection(collection.id, title, description);
      setCollection({ ...collection, title, description });
      setEditing(false);
    } catch {
      setError('Не удалось сохранить коллекцию.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteShelf() {
    if (!collection) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.deleteCollection(collection.id);
      navigate('/collections', { replace: true });
    } catch {
      setError('Не удалось удалить коллекцию.');
      setBusy(false);
    }
  }

  if (loading) {
    return <div aria-label="Открываем коллекцию" className="persistent-loading"><span className="spinner" /></div>;
  }
  if (!collection) {
    return (
      <div className="page simple-page">
        <Link className="back-link" to="/collections"><ArrowLeft aria-hidden="true" /> К коллекциям</Link>
        <div className="notice notice--error" role="alert">{error ?? 'Коллекция не найдена.'}</div>
      </div>
    );
  }

  return (
    <div className="page collection-details-page">
      <Link className="back-link" to="/collections"><ArrowLeft aria-hidden="true" /> К коллекциям</Link>
      <header className="page-heading">
        <div>
          <p className="eyebrow">{collection.itemCount} произведений</p>
          <h1>{collection.title}</h1>
          <p>{collection.description ?? 'Описание не указано'}</p>
        </div>
        <div className="collection-details-actions">
          <label>
            <span className="sr-only">Сортировка коллекции</span>
            <select aria-label="Сортировка коллекции" onChange={(event) => setSort(event.target.value as CollectionSort)} value={sort}>
              <option value="added">По времени добавления</option>
              <option value="title">По названию</option>
              <option value="progress">По прогрессу</option>
            </select>
          </label>
          <button aria-label="Редактировать коллекцию" className="button button--secondary" disabled={busy} onClick={startEditing} type="button"><Pencil aria-hidden="true" /> Изменить</button>
          <button aria-label={confirmingDelete ? 'Подтвердить удаление коллекции' : 'Удалить коллекцию'} className="button button--ghost" disabled={busy} onClick={() => void deleteShelf()} type="button"><Trash2 aria-hidden="true" /> {confirmingDelete ? 'Точно удалить?' : 'Удалить'}</button>
        </div>
      </header>
      {editing ? (
        <form className="collection-form collection-edit-form" onSubmit={(event) => void save(event)}>
          <div>
            <label htmlFor="collection-details-title">Название коллекции</label>
            <input autoFocus id="collection-details-title" maxLength={120} onChange={(event) => setTitleDraft(event.target.value)} value={titleDraft} />
          </div>
          <div>
            <label htmlFor="collection-details-description">Описание коллекции</label>
            <textarea id="collection-details-description" maxLength={2_000} onChange={(event) => setDescriptionDraft(event.target.value)} rows={3} value={descriptionDraft} />
          </div>
          <button aria-label="Сохранить коллекцию" className="button button--primary" disabled={busy || !titleDraft.trim()} type="submit"><Save aria-hidden="true" /> Сохранить</button>
          <button aria-label="Отменить редактирование" className="icon-button" onClick={() => setEditing(false)} type="button"><X aria-hidden="true" /></button>
        </form>
      ) : null}
      {confirmingDelete ? <div className="notice notice--error"><span>Удалится только коллекция. Книги, прогресс и заметки останутся.</span><button onClick={() => setConfirmingDelete(false)} type="button">Отмена</button></div> : null}
      {error ? <div className="notice notice--error" role="alert">{error}</div> : null}
      {items.length === 0 ? (
        <section className="section-empty section-empty--compact">
          <div className="section-empty__icon"><FolderHeart aria-hidden="true" /></div>
          <h2>Коллекция пуста</h2>
          <p>Откройте произведение в библиотеке и добавьте его в коллекцию.</p>
          <Link className="button button--secondary" to="/library"><Library aria-hidden="true" /> Открыть библиотеку</Link>
        </section>
      ) : (
        <div className="collection-work-grid">
          {items.map((work) => (
            <div className="collection-work" key={work.id}>
              <BookCard onToggleFavorite={() => void toggleFavorite(work.id)} work={work} />
              <button aria-label={`Убрать «${work.title}» из коллекции`} className="button button--ghost" onClick={() => void remove(work.id)} type="button"><Trash2 aria-hidden="true" /> Убрать</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
