import {
  BookOpen,
  Braces,
  Copy,
  FileText,
  Highlighter,
  Pencil,
  Quote,
  Search,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { desktopBridge, isDesktopRuntime, type DesktopBridge } from '../../app/bridge';
import { Button } from '../../components/Button';
import { SectionEmpty } from '../../components/SectionEmpty';
import type {
  AnnotationExportFormat,
  AnnotationKind,
  AnnotationQuery,
  HighlightColor,
  ReaderAnnotation,
} from '../../types/annotations';

interface NotesPageProps {
  bridge?: DesktopBridge;
}

type KindFilter = 'all' | AnnotationKind;

const colorLabels: Record<HighlightColor, string> = {
  sakura: 'Сакура',
  peach: 'Персик',
  lavender: 'Лаванда',
  butter: 'Ваниль',
  mint: 'Мята',
};

export function NotesPage({ bridge }: NotesPageProps) {
  const api = bridge ?? desktopBridge;
  const shouldLoad = Boolean(bridge) || isDesktopRuntime();
  const [items, setItems] = useState<ReaderAnnotation[]>([]);
  const [loading, setLoading] = useState(shouldLoad);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [workId, setWorkId] = useState('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [colorDraft, setColorDraft] = useState<HighlightColor | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldLoad) return;
    let active = true;
    void api
      .listAnnotations({ limit: 1000 })
      .then((annotations) => {
        if (active) setItems(annotations);
      })
      .catch(() => {
        if (active) setError('Не удалось загрузить заметки.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, shouldLoad]);

  const works = useMemo(() => {
    const values = new Map<string, string>();
    for (const item of items) values.set(item.workId, item.workTitle);
    return [...values].map(([id, title]) => ({ id, title })).sort((left, right) =>
      left.title.localeCompare(right.title, 'ru'),
    );
  }, [items]);

  const visibleItems = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('ru');
    return items.filter((item) => {
      if (kind !== 'all' && item.kind !== kind) return false;
      if (workId !== 'all' && item.workId !== workId) return false;
      if (!needle) return true;
      return [item.workTitle, item.quote, item.note ?? ''].some((value) =>
        value.toLocaleLowerCase('ru').includes(needle),
      );
    });
  }, [items, kind, search, workId]);

  const activeQuery = useMemo<AnnotationQuery>(() => {
    const query: AnnotationQuery = {};
    if (workId !== 'all') query.workId = workId;
    if (kind !== 'all') query.kind = kind;
    if (search.trim()) query.search = search.trim();
    return query;
  }, [kind, search, workId]);

  function beginEdit(annotation: ReaderAnnotation) {
    setEditingId(annotation.id);
    setNoteDraft(annotation.note ?? '');
    setColorDraft(annotation.color);
    setError(null);
  }

  async function saveEdit(annotation: ReaderAnnotation) {
    const note = noteDraft.trim() || null;
    if (annotation.kind === 'note' && !note) return;
    setBusyId(annotation.id);
    setError(null);
    try {
      const updated = await api.updateAnnotation(annotation.id, {
        note,
        color: annotation.kind === 'quote' ? null : colorDraft,
      });
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setEditingId(null);
      setNotice('Изменения сохранены');
    } catch {
      setError('Не удалось сохранить изменения.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(annotation: ReaderAnnotation) {
    setBusyId(annotation.id);
    setError(null);
    try {
      await api.deleteAnnotation(annotation.id);
      setItems((current) => current.filter((item) => item.id !== annotation.id));
      if (editingId === annotation.id) setEditingId(null);
      setNotice('Заметка удалена');
    } catch {
      setError('Не удалось удалить заметку.');
    } finally {
      setBusyId(null);
    }
  }

  async function copyVisible() {
    if (visibleItems.length === 0) return;
    try {
      await api.copyText(annotationsAsText(visibleItems));
      setNotice('Видимые заметки скопированы');
    } catch {
      setError('Не удалось скопировать заметки.');
    }
  }

  async function exportVisible(format: AnnotationExportFormat) {
    try {
      const saved = await api.exportAnnotations(activeQuery, format);
      if (saved) setNotice(format === 'markdown' ? 'Markdown сохранён' : 'JSON сохранён');
    } catch {
      setError('Не удалось экспортировать заметки.');
    }
  }

  if (!loading && items.length === 0 && !error) {
    return (
      <SectionEmpty
        action={{ label: 'Открыть библиотеку', to: '/library' }}
        description="Выделите текст во время чтения и сохраните подсветку, цитату или комментарий."
        eyebrow="Аннотации"
        icon={StickyNote}
        title="Заметок пока нет"
      />
    );
  }

  return (
    <div className="page simple-page notes-page">
      <header className="page-heading notes-heading">
        <div>
          <p className="eyebrow">Аннотации</p>
          <h1>Заметки</h1>
          <p>Подсветки, цитаты и комментарии с переходом к исходному фрагменту.</p>
        </div>
        <div className="notes-heading__actions">
          <Button aria-label="Скопировать всё" disabled={visibleItems.length === 0} onClick={() => void copyVisible()} variant="ghost"><Copy aria-hidden="true" /> Копировать</Button>
          <Button aria-label="Экспорт Markdown" disabled={visibleItems.length === 0} onClick={() => void exportVisible('markdown')} variant="secondary"><FileText aria-hidden="true" /> Markdown</Button>
          <Button aria-label="Экспорт JSON" disabled={visibleItems.length === 0} onClick={() => void exportVisible('json')} variant="secondary"><Braces aria-hidden="true" /> JSON</Button>
        </div>
      </header>

      <section aria-label="Фильтры заметок" className="notes-toolbar">
        <label className="notes-search">
          <Search aria-hidden="true" />
          <input aria-label="Поиск по заметкам" onChange={(event) => setSearch(event.target.value)} placeholder="Текст заметки или цитаты" type="search" value={search} />
        </label>
        <label><span>Тип заметки</span><select onChange={(event) => setKind(event.target.value as KindFilter)} value={kind}><option value="all">Все типы</option><option value="highlight">Подсветки</option><option value="note">Заметки</option><option value="quote">Цитаты</option></select></label>
        <label><span>Книга</span><select onChange={(event) => setWorkId(event.target.value)} value={workId}><option value="all">Все книги</option>{works.map((work) => <option key={work.id} value={work.id}>{work.title}</option>)}</select></label>
        <output>{visibleItems.length} из {items.length}</output>
      </section>

      {error ? <div className="notice notice--error" role="alert">{error}</div> : null}
      {notice ? <div className="notice notice--success" role="status">{notice}</div> : null}
      {loading ? <div className="persistent-loading"><span className="spinner" /><p>Загружаем заметки…</p></div> : null}

      {!loading && visibleItems.length === 0 ? (
        <div className="filtered-empty"><Search aria-hidden="true" /><p>По выбранным фильтрам ничего не найдено.</p><button className="button button--ghost" onClick={() => { setSearch(''); setKind('all'); setWorkId('all'); }} type="button">Сбросить фильтры</button></div>
      ) : null}

      {!loading && visibleItems.length > 0 ? (
        <div className="notes-list">
          {visibleItems.map((annotation) => (
            <article className="note-card" data-annotation-color={annotation.color ?? 'none'} key={annotation.id}>
              <div className="note-card__rail">{annotationIcon(annotation.kind)}</div>
              <div className="note-card__body">
                <div className="note-card__meta">
                  <span>{kindLabel(annotation.kind)}</span>
                  <Link to={`/work/${annotation.workId}`}>{annotation.workTitle}</Link>
                  <span>{locationLabel(annotation)} · {formatDate(annotation.createdAt)}</span>
                </div>
                <blockquote>{annotation.quote}</blockquote>
                {editingId === annotation.id ? (
                  <form className="note-card__editor" onSubmit={(event) => { event.preventDefault(); void saveEdit(annotation); }}>
                    <label><span>Текст заметки</span><textarea autoFocus maxLength={20000} onChange={(event) => setNoteDraft(event.target.value)} placeholder={annotation.kind === 'note' ? 'Заметка не может быть пустой' : 'Добавить комментарий…'} rows={3} value={noteDraft} /></label>
                    {annotation.kind !== 'quote' ? (
                      <label><span>Цвет выделения</span><select onChange={(event) => setColorDraft(event.target.value as HighlightColor)} value={colorDraft ?? 'sakura'}>{Object.entries(colorLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    ) : null}
                    <div><button onClick={() => setEditingId(null)} type="button">Отмена</button><button className="button button--primary" disabled={busyId === annotation.id || (annotation.kind === 'note' && !noteDraft.trim())} type="submit">Сохранить изменения</button></div>
                  </form>
                ) : annotation.note ? <p className="note-card__comment">{annotation.note}</p> : null}
              </div>
              <div className="note-card__actions">
                <Link aria-label={`Открыть фрагмент: ${annotation.quote}`} className="icon-button" to={`/read/${annotation.workId}?annotation=${encodeURIComponent(annotation.id)}`}><BookOpen aria-hidden="true" /></Link>
                <button aria-label={`Редактировать заметку: ${annotation.quote}`} className="icon-button" onClick={() => beginEdit(annotation)} type="button"><Pencil aria-hidden="true" /></button>
                <button aria-label={`Удалить заметку: ${annotation.quote}`} className="icon-button" disabled={busyId === annotation.id} onClick={() => void remove(annotation)} type="button"><Trash2 aria-hidden="true" /></button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function annotationIcon(kind: AnnotationKind) {
  if (kind === 'highlight') return <Highlighter aria-hidden="true" />;
  if (kind === 'note') return <StickyNote aria-hidden="true" />;
  return <Quote aria-hidden="true" />;
}

function kindLabel(kind: AnnotationKind) {
  if (kind === 'highlight') return 'Подсветка';
  if (kind === 'note') return 'Заметка';
  return 'Цитата';
}

function locationLabel(annotation: ReaderAnnotation) {
  const locator = annotation.locator;
  if (locator.kind === 'pdf') return `Страница ${locator.pageIndex + 1}`;
  if (locator.kind === 'manga') return `Страница ${locator.pageIndex + 1}`;
  return 'Глава книги';
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function annotationsAsText(annotations: ReaderAnnotation[]) {
  return annotations
    .map((annotation) => {
      const lines = [annotation.workTitle, `${kindLabel(annotation.kind)} · ${formatDate(annotation.createdAt)}`];
      if (annotation.quote) lines.push(`«${annotation.quote}»`);
      if (annotation.note) lines.push(annotation.note);
      return lines.join('\n');
    })
    .join('\n\n');
}
