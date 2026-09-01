import { FolderHeart, Library, Plus, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { desktopBridge, isDesktopRuntime, type DesktopBridge } from '../../app/bridge';
import { Button } from '../../components/Button';
import type { CollectionSummary } from '../../types/persistence';

interface CollectionsPageProps {
  bridge?: DesktopBridge;
}

export function CollectionsPage({ bridge }: CollectionsPageProps) {
  const api = bridge ?? desktopBridge;
  const shouldLoad = Boolean(bridge) || isDesktopRuntime();
  const [items, setItems] = useState<CollectionSummary[]>([]);
  const [loading, setLoading] = useState(shouldLoad);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldLoad) return;
    let active = true;
    void api
      .listCollections()
      .then((collections) => active && setItems(collections))
      .catch(() => active && setError('Не удалось загрузить коллекции.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [api, shouldLoad]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    setSaving(true);
    setError(null);
    try {
      await api.createCollection(value, null);
      setTitle('');
      setFormOpen(false);
      setItems(await api.listCollections());
    } catch {
      setError('Не удалось создать коллекцию. Проверьте название.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page simple-page persistent-page">
      <header className="page-heading">
        <div><p className="eyebrow">Организация библиотеки</p><h1>Коллекции</h1><p>Группируйте произведения по серии, автору или теме.</p></div>
        <Button aria-label="Новая коллекция" onClick={() => setFormOpen(true)}><Plus aria-hidden="true" /> Новая коллекция</Button>
      </header>
      {error ? <div className="notice notice--error" role="alert">{error}</div> : null}
      {formOpen ? (
        <form className="collection-form" onSubmit={(event) => void submit(event)}>
          <div><label htmlFor="collection-title">Название коллекции</label><input autoFocus id="collection-title" maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Например, научная фантастика" value={title} /></div>
          <Button disabled={saving || !title.trim()} type="submit">{saving ? <span className="spinner" /> : null} Создать</Button>
          <button aria-label="Закрыть форму" className="icon-button" onClick={() => setFormOpen(false)} type="button"><X aria-hidden="true" /></button>
        </form>
      ) : null}
      {loading ? <div className="persistent-loading"><span className="spinner" /><p>Загружаем коллекции…</p></div> : null}
      {!loading && items.length === 0 ? (
        <section className="section-empty section-empty--compact">
          <div className="section-empty__icon"><FolderHeart aria-hidden="true" /></div>
          <h2>Коллекций пока нет</h2>
          <p>Одно произведение можно добавить в несколько коллекций. Исходные файлы не изменяются.</p>
          <Button onClick={() => setFormOpen(true)} variant="secondary"><Plus aria-hidden="true" /> Создать коллекцию</Button>
        </section>
      ) : null}
      {!loading && items.length > 0 ? (
        <div className="collection-grid">
          {items.map((collection) => (
            <article className="collection-card" key={collection.id}>
              <div className="collection-card__icon"><FolderHeart aria-hidden="true" /></div>
              <div><span>{collection.itemCount} {bookWord(collection.itemCount)}</span><h2>{collection.title}</h2><p>{collection.description ?? 'Описание не указано'}</p></div>
              <Link className="button button--secondary" to={`/collections/${collection.id}`}><Library aria-hidden="true" /> Открыть коллекцию</Link>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function bookWord(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'книг';
  if (mod10 === 1) return 'книга';
  if (mod10 >= 2 && mod10 <= 4) return 'книги';
  return 'книг';
}
