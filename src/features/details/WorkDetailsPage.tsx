import {
  ArrowLeft,
  BookOpen,
  FileText,
  FolderHeart,
  Globe2,
  HardDrive,
  Heart,
  Image as ImageIcon,
  Link2,
  Pencil,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { desktopBridge, type DesktopBridge } from '../../app/bridge';
import { Button } from '../../components/Button';
import type { WorkDetails, WorkMetadataUpdate, WorkStatus } from '../../types/library';
import type { CollectionSummary } from '../../types/persistence';

function readableSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatLabel(format: WorkDetails['format']) {
  return format === 'remote_manga' ? 'ONLINE' : format.toUpperCase();
}

interface WorkDetailsPageProps {
  bridge?: DesktopBridge;
}

const emptyMetadata: WorkMetadataUpdate = {
  title: '',
  author: null,
  originalTitle: null,
  description: null,
};

function metadataFromWork(work: WorkDetails): WorkMetadataUpdate {
  return {
    title: work.title,
    author: work.author,
    originalTitle: work.originalTitle,
    description: work.description,
  };
}

export function WorkDetailsPage({ bridge = desktopBridge }: WorkDetailsPageProps) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [work, setWork] = useState<WorkDetails | null>(null);
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [collectionId, setCollectionId] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [relinking, setRelinking] = useState(false);
  const [metadata, setMetadata] = useState<WorkMetadataUpdate>(emptyMetadata);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([bridge.getWork(id), bridge.listCollections().catch(() => [])])
      .then(([value, availableCollections]) => {
        if (!active) return;
        setWork(value);
        setMetadata(metadataFromWork(value));
        setCollections(availableCollections);
        setCollectionId(availableCollections[0]?.id ?? '');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          typeof reason === 'object' && reason !== null && 'userMessage' in reason
            ? String(reason.userMessage)
            : 'Не удалось открыть карточку произведения.',
        );
      });
    return () => {
      active = false;
    };
  }, [bridge, id]);

  async function remove() {
    if (!work) return;
    const explanation = work.originKind === 'remote'
      ? 'Онлайн-источник и его данные не изменятся.'
      : 'Исходный файл останется на месте.';
    if (!window.confirm(`Убрать «${work.title}» из библиотеки? ${explanation}`)) return;
    await bridge.removeFromLibrary(work.id);
    navigate('/library');
  }

  async function toggleFavorite() {
    if (!work) return;
    const favorite = !work.favorite;
    try {
      await bridge.setFavorite(work.id, favorite);
      setWork({ ...work, favorite });
    } catch {
      setError('Не удалось изменить избранное.');
    }
  }

  async function updateStatus(status: WorkStatus) {
    if (!work) return;
    try {
      await bridge.setWorkStatus(work.id, status);
      setWork({ ...work, status });
    } catch {
      setError('Не удалось изменить статус чтения.');
    }
  }

  async function addToCollection() {
    if (!work || !collectionId) return;
    try {
      await bridge.addToCollection(collectionId, work.id);
      const collection = collections.find((item) => item.id === collectionId);
      setNotice(`Добавлено в коллекцию «${collection?.title ?? 'Коллекция'}».`);
    } catch {
      setError('Не удалось добавить произведение в коллекцию.');
    }
  }

  function cancelEditing() {
    if (work) setMetadata(metadataFromWork(work));
    setEditing(false);
  }

  function setMetadataField<Key extends keyof WorkMetadataUpdate>(
    key: Key,
    value: WorkMetadataUpdate[Key],
  ) {
    setMetadata((current) => ({ ...current, [key]: value }));
  }

  async function saveMetadata() {
    if (!work || !metadata.title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await bridge.updateWorkMetadata(work.id, {
        title: metadata.title.trim(),
        author: metadata.author?.trim() || null,
        originalTitle: metadata.originalTitle?.trim() || null,
        description: metadata.description?.trim() || null,
      });
      setWork(updated);
      setMetadata(metadataFromWork(updated));
      setEditing(false);
      setNotice('Информация о произведении сохранена.');
    } catch {
      setError('Не удалось сохранить информацию о произведении.');
    } finally {
      setSaving(false);
    }
  }

  async function relinkSource() {
    if (!work || work.originKind === 'remote' || relinking) return;
    setRelinking(true);
    setError(null);
    try {
      const selectedPath = work.format === 'image_folder'
        ? await bridge.pickFolder()
        : (await bridge.pickBookFiles())[0] ?? null;
      if (!selectedPath) return;
      const updated = await bridge.relinkWorkSource(work.id, selectedPath);
      setWork(updated);
      setNotice('Расположение исходного файла обновлено.');
    } catch {
      setError('Не удалось привязать выбранный файл. Проверьте, что его формат совпадает.');
    } finally {
      setRelinking(false);
    }
  }

  if (error) {
    return <div className="page"><div className="notice notice--error">{error}</div></div>;
  }
  if (!work) {
    return <div aria-label="Загрузка карточки" className="page detail-skeleton" />;
  }

  const isRemote = work.originKind === 'remote';
  const visibleFormat = formatLabel(work.format);

  return (
    <div className="page details-page">
      <Link className="back-link" to="/library"><ArrowLeft aria-hidden="true" /> Назад в библиотеку</Link>
      <div className="details-layout">
        <div className={`details-cover details-cover--${work.kind}${isRemote ? ' details-cover--remote' : ''}`}>
          {isRemote && work.remoteCoverUrl ? <img alt="" src={work.remoteCoverUrl} /> : null}
          <span>{visibleFormat}</span>
          {work.kind === 'manga' ? <ImageIcon aria-hidden="true" /> : <BookOpen aria-hidden="true" />}
          <strong>{work.title}</strong>
        </div>
        <section className="details-copy">
          <p className="eyebrow">{work.kind === 'manga' ? 'Манга' : 'Книга'} · {visibleFormat}</p>
          <h1>{work.title}</h1>
          <p className="details-author">{work.author || 'Автор не указан'}</p>
          <p className="details-description">{work.description || 'Описание пока не добавлено. Можно сразу открыть произведение и начать чтение.'}</p>
          {!isRemote && work.missingFile ? (
            <div className="missing-source" role="alert">
              <div>
                <strong>Исходный файл не найден</strong>
                <span>Запись и прогресс сохранены. Укажите новое расположение файла, чтобы продолжить чтение.</span>
              </div>
              <Button disabled={relinking} onClick={() => void relinkSource()} variant="secondary">
                <Link2 aria-hidden="true" /> {relinking ? 'Ищу…' : 'Найти исходный файл'}
              </Button>
            </div>
          ) : null}
          <div className="details-actions">
            {!isRemote && work.missingFile ? null : <Link className="button button--primary" to={`/read/${work.id}`}><BookOpen aria-hidden="true" /> Читать</Link>}
            <Button aria-label={work.favorite ? 'Убрать из избранного' : 'Добавить в избранное'} onClick={() => void toggleFavorite()} variant="secondary"><Heart aria-hidden="true" fill={work.favorite ? 'currentColor' : 'none'} /> {work.favorite ? 'В избранном' : 'В избранное'}</Button>
            <Button aria-label="Редактировать информацию" onClick={() => setEditing(true)} variant="ghost"><Pencil aria-hidden="true" /> Изменить</Button>
            <Button onClick={() => void remove()} variant="ghost"><Trash2 aria-hidden="true" /> Убрать</Button>
          </div>
          {editing ? (
            <form className="metadata-form" onSubmit={(event) => { event.preventDefault(); void saveMetadata(); }}>
              <div className="metadata-form__heading">
                <div><strong>Информация о произведении</strong><small>Поля используются в карточке и поиске по библиотеке.</small></div>
                <Button aria-label="Закрыть редактирование" onClick={cancelEditing} variant="ghost"><X aria-hidden="true" /></Button>
              </div>
              <label>
                <span>Название произведения</span>
                <input autoFocus maxLength={500} onChange={(event) => setMetadataField('title', event.target.value)} required value={metadata.title} />
              </label>
              <div className="metadata-form__columns">
                <label>
                  <span>Автор</span>
                  <input maxLength={500} onChange={(event) => setMetadataField('author', event.target.value)} value={metadata.author ?? ''} />
                </label>
                <label>
                  <span>Оригинальное название</span>
                  <input maxLength={500} onChange={(event) => setMetadataField('originalTitle', event.target.value)} value={metadata.originalTitle ?? ''} />
                </label>
              </div>
              <label>
                <span>Описание</span>
                <textarea maxLength={10_000} onChange={(event) => setMetadataField('description', event.target.value)} rows={5} value={metadata.description ?? ''} />
              </label>
              <div className="metadata-form__actions">
                <Button onClick={cancelEditing} variant="ghost">Отмена</Button>
                <Button aria-label="Сохранить информацию" disabled={saving || !metadata.title.trim()} type="submit"><Save aria-hidden="true" /> {saving ? 'Сохраняю…' : 'Сохранить'}</Button>
              </div>
            </form>
          ) : null}
          <dl className="details-facts">
            <div><dt><FileText aria-hidden="true" /> Формат</dt><dd>{visibleFormat}</dd></div>
            {isRemote ? null : <div><dt><HardDrive aria-hidden="true" /> Размер</dt><dd>{readableSize(work.fileSize)}</dd></div>}
            <div><dt>Статус</dt><dd><select aria-label="Статус чтения" onChange={(event) => void updateStatus(event.target.value as WorkStatus)} value={work.status}><option value="planned">В планах</option><option value="reading">Читаю</option><option value="completed">Прочитано</option><option value="on_hold">Отложено</option></select></dd></div>
            {isRemote ? (
              <div><dt><Globe2 aria-hidden="true" /> Источник</dt><dd className="details-source"><span>Онлайн-каталог</span><small title={work.remoteUrl ?? undefined}>{work.remoteUrl}</small></dd></div>
            ) : (
              <div><dt>Источник</dt><dd className="details-source"><span title={work.sourcePath}>{work.sourcePath}</span><Button aria-label="Изменить расположение" disabled={relinking} onClick={() => void relinkSource()} variant="ghost"><Link2 aria-hidden="true" /></Button></dd></div>
            )}
          </dl>
          <div className="details-collection">
            <div><FolderHeart aria-hidden="true" /><span><strong>Добавить в коллекцию</strong><small>Одна книга может быть в нескольких подборках.</small></span></div>
            {collections.length > 0 ? (
              <div><select aria-label="Коллекция" onChange={(event) => setCollectionId(event.target.value)} value={collectionId}>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.title}</option>)}</select><Button aria-label="Добавить в коллекцию" onClick={() => void addToCollection()} variant="secondary">Добавить</Button></div>
            ) : <Link to="/collections">Создать первую коллекцию</Link>}
          </div>
          {notice ? <div aria-live="polite" className="notice notice--success"><span>{notice}</span></div> : null}
        </section>
      </div>
    </div>
  );
}
