import { Moon, Search, Sun } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useSettingsStore } from '../stores/settingsStore';

const titles: Record<string, string> = {
  '/': 'Добрый вечер',
  '/library': 'Библиотека',
  '/books': 'Книги',
  '/manga': 'Манга',
  '/favorites': 'Избранное',
  '/collections': 'Коллекции',
  '/bookmarks': 'Закладки',
  '/notes': 'Заметки',
  '/history': 'История чтения',
  '/sources': 'Онлайн-источники',
  '/settings': 'Настройки',
};

export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const title = titles[location.pathname] ?? (location.pathname.startsWith('/work/') ? 'О произведении' : 'Чтение');

  return (
    <header className="topbar">
      <p>{title}</p>
      <div className="topbar__actions">
        <button
          className="topbar__search"
          onClick={() => navigate('/library?focus=search')}
          type="button"
        >
          <Search aria-hidden="true" />
          <span>Найти книгу</span>
          <kbd>Ctrl K</kbd>
        </button>
        <button
          aria-label={theme === 'night' ? 'Включить светлую тему' : 'Включить ночную тему'}
          className="icon-button topbar__theme"
          onClick={() => setTheme(theme === 'night' ? 'sakura' : 'night')}
          type="button"
        >
          {theme === 'night' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}
