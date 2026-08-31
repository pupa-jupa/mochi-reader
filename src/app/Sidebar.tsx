import {
  Bookmark,
  BookOpen,
  BookMarked,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FolderHeart,
  Globe2,
  Home,
  Heart,
  Images,
  Settings,
  StickyNote,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';

import logo from '../assets/brand/app-icon-master.png';

const navigation = [
  { to: '/', label: 'Сегодня', icon: Home, end: true },
  { to: '/library', label: 'Библиотека', icon: BookOpen },
  { to: '/books', label: 'Книги', icon: BookMarked },
  { to: '/manga', label: 'Манга', icon: Images },
  { to: '/favorites', label: 'Избранное', icon: Heart },
  { to: '/collections', label: 'Коллекции', icon: FolderHeart },
  { to: '/bookmarks', label: 'Закладки', icon: Bookmark },
  { to: '/notes', label: 'Заметки', icon: StickyNote },
  { to: '/history', label: 'История', icon: Clock3 },
  { to: '/sources', label: 'Источники', icon: Globe2 },
] as const;

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('mochi:sidebar') === '1');

  function toggle() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem('mochi:sidebar', next ? '1' : '0');
      return next;
    });
  }

  return (
    <aside aria-label="Основная навигация" className="sidebar" data-collapsed={collapsed}>
      <div className="brand">
        <img alt="" src={logo} />
        <div className="brand__copy">
          <strong>Mochi</strong>
          <span>reader</span>
        </div>
      </div>

      <nav className="sidebar__nav">
        {navigation.map(({ to, label, icon: Icon, ...props }) => (
          <NavLink
            className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}
            key={to}
            title={collapsed ? label : undefined}
            to={to}
            {...props}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__footer">
        <NavLink
          className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}
          title={collapsed ? 'Настройки' : undefined}
          to="/settings"
        >
          <Settings aria-hidden="true" />
          <span>Настройки</span>
        </NavLink>
        <button
          aria-label={collapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель'}
          className="sidebar__collapse"
          onClick={toggle}
          type="button"
        >
          {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
          <span>{collapsed ? '' : 'Свернуть'}</span>
        </button>
      </div>
    </aside>
  );
}
