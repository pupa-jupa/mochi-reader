import { BookOpen, Download, ExternalLink, FileJson2, Globe2, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { desktopBridge, isDesktopRuntime, type DesktopBridge } from '../../app/bridge';
import { Button } from '../../components/Button';
import type { OpdsCatalogPreview, SourceAdapterKind, SourceConfig } from '../../types/sources';

interface SourcesPageProps {
  bridge?: DesktopBridge;
}

type AddMode = 'url' | 'profile' | 'opds' | null;

export function SourcesPage({ bridge }: SourcesPageProps) {
  const api = bridge ?? desktopBridge;
  const shouldLoad = Boolean(bridge) || isDesktopRuntime();
  const [sources, setSources] = useState<SourceConfig[]>([]);
  const [loading, setLoading] = useState(shouldLoad);
  const [mode, setMode] = useState<AddMode>(null);
  const [url, setUrl] = useState('');
  const [profileJson, setProfileJson] = useState('');
  const [opdsName, setOpdsName] = useState('');
  const [opdsUrl, setOpdsUrl] = useState('');
  const [opdsPreview, setOpdsPreview] = useState<OpdsCatalogPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldLoad) return;
    let active = true;
    void api
      .listSources()
      .then((items) => active && setSources(items))
      .catch(() => active && setError('Не удалось загрузить источники.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [api, shouldLoad]);

  async function submitUrl(event: FormEvent) {
    event.preventDefault();
    const value = url.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const source = await api.addSourceFromUrl(value);
      setSources((current) => upsertSource(current, source));
      setUrl('');
      setMode(null);
    } catch (reason) {
      setError(sourceError(reason, 'Manifest не найден или не прошёл безопасную проверку.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitProfile(event: FormEvent) {
    event.preventDefault();
    if (!profileJson.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const source = await api.importSourceProfile(profileJson);
      setSources((current) => upsertSource(current, source));
      setProfileJson('');
      setMode(null);
    } catch (reason) {
      setError(sourceError(reason, 'JSON-профиль не прошёл проверку.'));
    } finally {
      setBusy(false);
    }
  }

  async function connectMangaDex() {
    setBusy(true);
    setError(null);
    try {
      const source = await api.addBuiltInSource('mangadex');
      setSources((current) => upsertSource(current, source));
      setMode(null);
    } catch (reason) {
      setError(sourceError(reason, 'Не удалось подключить MangaDex.'));
    } finally {
      setBusy(false);
    }
  }

  async function checkOpds(event: FormEvent) {
    event.preventDefault();
    const value = opdsUrl.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    setOpdsPreview(null);
    try {
      setOpdsPreview(await api.previewOpdsCatalog(value, opdsName.trim()));
    } catch (reason) {
      setError(sourceError(reason, 'Не удалось проверить OPDS-каталог.'));
    } finally {
      setBusy(false);
    }
  }

  async function connectOpds() {
    const value = opdsUrl.trim();
    if (!value || !opdsPreview) return;
    setBusy(true);
    setError(null);
    try {
      const source = await api.addOpdsSource(value, opdsName.trim());
      setSources((current) => upsertSource(current, source));
      setOpdsName('');
      setOpdsUrl('');
      setOpdsPreview(null);
      setMode(null);
    } catch (reason) {
      setError(sourceError(reason, 'Не удалось подключить OPDS-каталог.'));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(source: SourceConfig) {
    const enabled = !source.enabled;
    setSources((current) =>
      current.map((item) => (item.id === source.id ? { ...item, enabled } : item)),
    );
    try {
      await api.setSourceEnabled(source.id, enabled);
    } catch {
      setSources((current) =>
        current.map((item) => (item.id === source.id ? { ...item, enabled: source.enabled } : item)),
      );
      setError('Не удалось изменить состояние источника.');
    }
  }

  async function remove(source: SourceConfig) {
    if (removeConfirmId !== source.id) {
      setRemoveConfirmId(source.id);
      return;
    }
    try {
      await api.removeSource(source.id);
      setSources((current) => current.filter((item) => item.id !== source.id));
      setRemoveConfirmId(null);
    } catch {
      setError('Не удалось удалить источник.');
    }
  }

  const mangaDexConnected = sources.some((source) => source.adapterKind === 'mangadex');

  return (
    <div className="page sources-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Расширяемая манга-полка</p>
          <h1>Онлайн-источники</h1>
          <p>Встроенный MangaDex API, manifest и HTML-профили без исполняемого кода.</p>
        </div>
      </header>
      <section className="source-intro">
        <div className="source-intro__icon"><Globe2 aria-hidden="true" /></div>
        <div><h2>Добавить источник</h2><p>Каждый адаптер ограничен своим HTTPS origin.</p></div>
        <div className="source-intro__actions">
          <Button
            aria-label={mangaDexConnected ? 'MangaDex подключён' : 'Подключить MangaDex'}
            disabled={busy || mangaDexConnected}
            onClick={() => void connectMangaDex()}
          >
            {busy && !mangaDexConnected ? <span className="spinner" /> : <Globe2 aria-hidden="true" />}
            {mangaDexConnected ? 'MangaDex подключён' : 'Подключить MangaDex'}
          </Button>
          <Button aria-label="Добавить по URL" disabled={busy} onClick={() => setMode('url')} variant="secondary">
            <ExternalLink aria-hidden="true" /> Добавить по URL
          </Button>
          <Button aria-label="Подключить OPDS" disabled={busy} onClick={() => setMode('opds')} variant="secondary">
            <BookOpen aria-hidden="true" /> Подключить OPDS
          </Button>
          <Button aria-label="Импорт JSON" disabled={busy} onClick={() => setMode('profile')} variant="secondary">
            <FileJson2 aria-hidden="true" /> Импорт JSON
          </Button>
        </div>
      </section>

      {mode === 'url' ? (
        <form className="source-form" onSubmit={(event) => void submitUrl(event)}>
          <div><label htmlFor="source-url">URL источника</label><input autoFocus id="source-url" onChange={(event) => setUrl(event.target.value)} placeholder="https://manga.example" type="url" value={url} /><small>Проверим /.well-known/mochi-reader.json, HTTPS и все endpoint origins.</small></div>
          <Button disabled={busy || !url.trim()} type="submit">{busy ? <span className="spinner" /> : <ShieldCheck aria-hidden="true" />} Проверить и добавить</Button>
          <button aria-label="Закрыть форму URL" className="icon-button" onClick={() => setMode(null)} type="button"><X aria-hidden="true" /></button>
        </form>
      ) : null}

      {mode === 'profile' ? (
        <form className="source-profile-form" onSubmit={(event) => void submitProfile(event)}>
          <div className="source-profile-form__heading"><div><strong>Декларативный JSON-источник</strong><p>Mochi Source Manifest v1 или legacy HTML-профиль. JavaScript запрещён.</p></div><button aria-label="Закрыть импорт JSON" className="icon-button" onClick={() => setMode(null)} type="button"><X aria-hidden="true" /></button></div>
          <label htmlFor="source-profile-json">JSON-профиль</label>
          <textarea id="source-profile-json" onChange={(event) => setProfileJson(event.target.value)} placeholder={'{\n  "schemaVersion": 1,\n  "id": "example.source",\n  "kind": "manga",\n  "name": "…"\n}'} spellCheck="false" value={profileJson} />
          <Button disabled={busy || !profileJson.trim()} type="submit">{busy ? <span className="spinner" /> : <FileJson2 aria-hidden="true" />} Проверить и импортировать</Button>
        </form>
      ) : null}

      {mode === 'opds' ? (
        <form className="source-profile-form" onSubmit={(event) => void checkOpds(event)}>
          <div className="source-profile-form__heading">
            <div><strong>Подключить OPDS-каталог</strong><p>Поддерживаются OPDS 1.x (Atom) и OPDS 2.0 (JSON).</p></div>
            <button aria-label="Закрыть форму OPDS" className="icon-button" onClick={() => { setMode(null); setOpdsPreview(null); }} type="button"><X aria-hidden="true" /></button>
          </div>
          <label htmlFor="opds-name">Название каталога</label>
          <input id="opds-name" maxLength={200} onChange={(event) => { setOpdsName(event.target.value); setOpdsPreview(null); }} placeholder="Необязательно — возьмём из каталога" value={opdsName} />
          <label htmlFor="opds-url">URL каталога</label>
          <input autoFocus id="opds-url" onChange={(event) => { setOpdsUrl(event.target.value); setOpdsPreview(null); }} placeholder="https://library.example/opds" type="url" value={opdsUrl} />
          <Button disabled={busy || !opdsUrl.trim()} type="submit">{busy ? <span className="spinner" /> : <ShieldCheck aria-hidden="true" />} Проверить каталог</Button>
          {opdsPreview ? (
            <section aria-label="Предпросмотр OPDS" className="source-safety">
              <BookOpen aria-hidden="true" />
              <div>
                <h2>{opdsPreview.name}</h2>
                <span>{opdsPreview.catalogType === 'opds2' ? 'OPDS 2.0' : 'OPDS 1.x'}</span>
                <span>{opdsPreview.itemCount === null ? 'Количество изданий неизвестно' : `${opdsPreview.itemCount} изданий`}</span>
              </div>
              <Button disabled={busy} onClick={() => void connectOpds()} type="button">Подключить каталог</Button>
            </section>
          ) : null}
        </form>
      ) : null}

      {error ? <div className="notice notice--error" role="alert"><span>{error}</span><button aria-label="Закрыть ошибку" onClick={() => setError(null)} type="button"><X aria-hidden="true" /></button></div> : null}

      <div className="source-safety">
        <ShieldCheck aria-hidden="true" />
        <div><strong>Без обходов и скрытых входов</strong><span>Reader не импортирует cookies и не обходит CAPTCHA, paywall, DRM или ограничения доступа.</span></div>
      </div>

      {loading ? <div className="persistent-loading"><span className="spinner" /><p>Проверяем подключённые адаптеры…</p></div> : null}
      {!loading && sources.length === 0 ? (
        <section className="sources-empty"><Globe2 aria-hidden="true" /><h2>Источники ещё не подключены</h2><p>Добавь совместимый URL или импортируй профиль сайта.</p></section>
      ) : null}
      {sources.length > 0 ? (
        <section aria-label="Подключённые источники" className="source-grid">
          {sources.map((source) => (
            <article className="source-card" data-disabled={!source.enabled || undefined} key={source.id}>
              <div className="source-card__top"><div className="source-card__logo"><Globe2 aria-hidden="true" /></div><label className="source-card__switch"><span className="sr-only">Источник {source.name} {source.enabled ? 'включён' : 'выключен'}</span><input aria-label={`Источник ${source.name} ${source.enabled ? 'включён' : 'выключен'}`} checked={source.enabled} className="switch" onChange={() => void toggle(source)} type="checkbox" /></label></div>
              <div><span className="source-card__adapter">{adapterLabel(source.adapterKind)}</span><h2>{source.name}</h2><p title={source.baseUrl}>{sourceHost(source.baseUrl)}</p></div>
              <div className="source-card__capabilities"><span><Search aria-hidden="true" /> Поиск</span>{source.capabilities.download ? <span><Download aria-hidden="true" /> Offline</span> : <span>Только чтение</span>}</div>
              {source.enabled ? <Link className="button button--secondary" to={`/sources/${source.id}`}><Search aria-hidden="true" /> Открыть каталог</Link> : null}
              <Button aria-label={removeConfirmId === source.id ? `Подтвердить удаление ${source.name}` : `Удалить источник ${source.name}`} onClick={() => void remove(source)} variant={removeConfirmId === source.id ? 'danger' : 'ghost'}><Trash2 aria-hidden="true" /> {removeConfirmId === source.id ? 'Точно удалить?' : 'Удалить'}</Button>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function upsertSource(items: SourceConfig[], source: SourceConfig) {
  const next = items.filter((item) => item.id !== source.id);
  return [...next, source].sort((left, right) => left.name.localeCompare(right.name, 'ru'));
}

function adapterLabel(kind: SourceAdapterKind) {
  if (kind === 'mangadex') return 'MangaDex API';
  if (kind === 'manifest') return 'Manifest adapter';
  if (kind === 'opds') return 'OPDS-каталог';
  return 'HTML profile';
}

function sourceError(reason: unknown, fallback: string) {
  if (typeof reason === 'object' && reason !== null && 'userMessage' in reason) {
    return String(reason.userMessage);
  }
  return fallback;
}

function sourceHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}
