import {
  Accessibility,
  ClipboardCopy,
  FolderOpen,
  HardDrive,
  LifeBuoy,
  Moon,
  Palette,
  Rabbit,
  RotateCcw,
  Scaling,
  Sun,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { desktopBridge, isDesktopRuntime, type DesktopBridge } from '../../app/bridge';
import { Button } from '../../components/Button';
import { type ThemeName, useSettingsStore } from '../../stores/settingsStore';
import type { CacheStats } from '../../types/cache';

const themes: Array<{ id: ThemeName; label: string; description: string }> = [
  { id: 'sakura', label: 'Светлая', description: 'Тёплая светлая палитра' },
  { id: 'milk', label: 'Нейтральная', description: 'Сдержанная нейтральная палитра' },
  { id: 'night', label: 'Тёмная', description: 'Тёмная палитра' },
];

interface SettingsPageProps {
  bridge?: DesktopBridge;
}

export function SettingsPage({ bridge }: SettingsPageProps) {
  const api = bridge ?? desktopBridge;
  const shouldLoadCache = Boolean(bridge) || isDesktopRuntime();
  const theme = useSettingsStore((state) => state.theme);
  const reduceMotion = useSettingsStore((state) => state.reduceMotion);
  const showMascot = useSettingsStore((state) => state.showMascot);
  const uiScale = useSettingsStore((state) => state.uiScale);
  const cacheLimitMb = useSettingsStore((state) => state.cacheLimitMb);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setReduceMotion = useSettingsStore((state) => state.setReduceMotion);
  const setShowMascot = useSettingsStore((state) => state.setShowMascot);
  const setUiScale = useSettingsStore((state) => state.setUiScale);
  const setCacheLimitMb = useSettingsStore((state) => state.setCacheLimitMb);
  const reset = useSettingsStore((state) => state.reset);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);
  const [diagnosticNotice, setDiagnosticNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldLoadCache) return;
    let active = true;
    void api
      .getCacheStats()
      .then((stats) => active && setCacheStats(stats))
      .catch(() => active && setCacheError('Не удалось проверить кэш.'));
    return () => {
      active = false;
    };
  }, [api, shouldLoadCache]);

  async function clearTransientCache() {
    setCacheBusy(true);
    setCacheError(null);
    try {
      setCacheStats(await api.clearCache(false));
    } catch {
      setCacheError('Не удалось очистить временный кэш.');
    } finally {
      setCacheBusy(false);
    }
  }

  async function openLogs() {
    setDiagnosticBusy(true);
    setDiagnosticNotice(null);
    try {
      await api.openLogDirectory();
    } catch {
      setDiagnosticNotice('Не удалось открыть папку логов.');
    } finally {
      setDiagnosticBusy(false);
    }
  }

  async function copyDiagnostics() {
    setDiagnosticBusy(true);
    setDiagnosticNotice(null);
    try {
      await api.copyDiagnosticInformation();
      setDiagnosticNotice('Диагностическая информация скопирована.');
    } catch {
      setDiagnosticNotice('Не удалось скопировать диагностическую информацию.');
    } finally {
      setDiagnosticBusy(false);
    }
  }

  return (
    <div className="page settings-page">
      <header className="page-heading">
        <div><p className="eyebrow">Параметры приложения</p><h1>Настройки</h1><p>Изменения применяются сразу и сохраняются автоматически.</p></div>
        <Button onClick={reset} variant="ghost"><RotateCcw aria-hidden="true" /> Сбросить</Button>
      </header>

      <section className="settings-section">
        <div className="settings-section__heading"><Palette aria-hidden="true" /><div><h2>Оформление</h2><p>Цветовая тема интерфейса.</p></div></div>
        <div className="theme-grid">
          {themes.map((option) => (
            <button
              aria-pressed={theme === option.id}
              className="theme-card"
              data-theme-preview={option.id}
              key={option.id}
              onClick={() => setTheme(option.id)}
              type="button"
            >
              <span className="theme-card__swatch"><i /><i /><i /></span>
              <strong>{option.label}</strong>
              <small>{option.description}</small>
              {option.id === 'night' ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section settings-section--rows">
        <div className="settings-section__heading"><Accessibility aria-hidden="true" /><div><h2>Интерфейс</h2><p>Масштаб, анимация и иллюстрации.</p></div></div>
        <label className="setting-row">
          <span className="setting-row__icon"><Scaling aria-hidden="true" /></span>
          <span><strong>Масштаб интерфейса</strong><small>От 80% до 130%</small></span>
          <input aria-label="Масштаб интерфейса" max="130" min="80" onChange={(event) => setUiScale(Number(event.target.value))} step="5" type="range" value={uiScale} />
          <output>{uiScale}%</output>
        </label>
        <label className="setting-row">
          <span className="setting-row__icon"><WandSparkles aria-hidden="true" /></span>
          <span><strong>Уменьшить анимации</strong><small>Отключает перемещения и мягкие пружины</small></span>
          <input checked={reduceMotion} className="switch" onChange={(event) => setReduceMotion(event.target.checked)} type="checkbox" />
        </label>
        <label className="setting-row">
          <span className="setting-row__icon"><Rabbit aria-hidden="true" /></span>
          <span><strong>Показывать Mochi</strong><small>Иллюстрации в приветствиях и пустых состояниях</small></span>
          <input checked={showMascot} className="switch" onChange={(event) => setShowMascot(event.target.checked)} type="checkbox" />
        </label>
      </section>

      <section className="settings-section settings-section--rows cache-settings">
        <div className="settings-section__heading"><HardDrive aria-hidden="true" /><div><h2>Кэш онлайн-манги</h2><p>Использование диска и сохранённые страницы.</p></div></div>
        <label className="setting-row">
          <span className="setting-row__icon"><HardDrive aria-hidden="true" /></span>
          <span><strong>Размер кэша</strong><small>Старые временные страницы удаляются автоматически</small></span>
          <select
            aria-label="Размер кэша"
            onChange={(event) => setCacheLimitMb(event.target.value === 'unlimited' ? null : Number(event.target.value))}
            value={cacheLimitMb ?? 'unlimited'}
          >
            <option value="500">500 МБ</option>
            <option value="1024">1 ГБ</option>
            <option value="2048">2 ГБ</option>
            <option value="5120">5 ГБ</option>
            <option value="unlimited">Без ограничения</option>
          </select>
        </label>
        <div className="cache-usage-row">
          <div><strong>{cacheStats ? `${formatMegabytes(cacheStats.totalBytes)} занято` : 'Считаем размер…'}</strong><small>{cacheStats ? `${cacheStats.entryCount} файлов · ${formatMegabytes(cacheStats.pinnedBytes)} сохранено офлайн` : 'Локальные страницы остаются только на этом компьютере'}</small></div>
          <Button aria-label="Очистить временный кэш" disabled={cacheBusy || !shouldLoadCache} onClick={() => void clearTransientCache()} variant="secondary">
            {cacheBusy ? <span className="spinner" /> : <Trash2 aria-hidden="true" />} Очистить временный кэш
          </Button>
        </div>
        {cacheError ? <div className="notice notice--error" role="alert">{cacheError}</div> : null}
      </section>

      <section className="settings-section settings-section--rows diagnostics-settings">
        <div className="settings-section__heading"><LifeBuoy aria-hidden="true" /><div><h2>Диагностика</h2><p>Локальные журналы помогают разобраться с ошибкой без отправки личных данных.</p></div></div>
        <div className="diagnostic-actions">
          <div><strong>Журналы и сведения о системе</strong><small>Копия не содержит путей к книгам, названий и содержимого библиотеки.</small></div>
          <div>
            <Button aria-label="Открыть папку логов" disabled={diagnosticBusy || !shouldLoadCache} onClick={() => void openLogs()} variant="secondary"><FolderOpen aria-hidden="true" /> Открыть папку логов</Button>
            <Button aria-label="Скопировать диагностическую информацию" disabled={diagnosticBusy || !shouldLoadCache} onClick={() => void copyDiagnostics()} variant="secondary"><ClipboardCopy aria-hidden="true" /> Скопировать информацию</Button>
          </div>
        </div>
        {diagnosticNotice ? <div aria-live="polite" className="notice notice--success">{diagnosticNotice}</div> : null}
      </section>
    </div>
  );
}

function formatMegabytes(bytes: number) {
  if (bytes <= 0) return '0 МБ';
  const megabytes = bytes / (1024 * 1024);
  if (megabytes < 1) return `${Math.max(0.1, Math.round(megabytes * 10) / 10)} МБ`;
  return `${Math.round(megabytes)} МБ`;
}
