import { BookOpen, FileSearch, FolderHeart, FolderOpen, Heart, Image as ImageIcon, MoreHorizontal, Play, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Link } from 'react-router-dom';

import type { WorkSummary } from '../types/library';

interface BookCardProps {
  work: WorkSummary;
  onToggleFavorite?(): void;
  onRevealSource?(): void;
  onRemove?(): void;
}

const formatLabels: Record<string, string> = {
  epub: 'EPUB',
  pdf: 'PDF',
  fb2: 'FB2',
  txt: 'TXT',
  html: 'HTML',
  markdown: 'MD',
  cbz: 'CBZ',
  cbr: 'CBR',
  zip_images: 'ZIP',
  image_folder: 'ПАПКА',
  image: 'IMAGE',
  remote_manga: 'ONLINE',
};

export function BookCard({ work, onToggleFavorite, onRevealSource, onRemove }: BookCardProps) {
  const coverClass = `book-card__cover book-card__cover--${work.kind}`;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    function close(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenu(null);
    }
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [menu]);

  function openMenu(event: ReactMouseEvent) {
    event.preventDefault();
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - 230),
      y: Math.min(event.clientY, window.innerHeight - 310),
    });
  }

  return (
    <article className="book-card" onContextMenu={openMenu}>
      <Link aria-label={`Открыть «${work.title}»`} className={coverClass} to={`/work/${work.id}`}>
        <span className="book-card__format">{formatLabels[work.format] ?? work.format}</span>
        {work.kind === 'manga' ? <ImageIcon aria-hidden="true" /> : <BookOpen aria-hidden="true" />}
        <span className="book-card__cover-title">{work.title}</span>
      </Link>
      <div className="book-card__body">
        <div>
          <h3 title={work.title}>{work.title}</h3>
          <p>{work.author || (work.kind === 'manga' ? 'Манга' : 'Автор не указан')}</p>
        </div>
        <button aria-label={`Меню «${work.title}»`} className="icon-button" onClick={openMenu} type="button">
          <MoreHorizontal aria-hidden="true" />
        </button>
      </div>
      <div className="book-card__meta">
        <div aria-label={`Прочитано ${Math.round(work.progressPercent)}%`} className="progress">
          <span style={{ width: `${Math.min(100, Math.max(0, work.progressPercent))}%` }} />
        </div>
        <button
          aria-label={work.favorite ? `Убрать «${work.title}» из избранного` : `Добавить «${work.title}» в избранное`}
          aria-pressed={work.favorite}
          className="book-card__favorite"
          onClick={onToggleFavorite}
          type="button"
        >
          <Heart aria-hidden="true" className="book-card__heart" fill={work.favorite ? 'currentColor' : 'none'} />
        </button>
      </div>
      {menu ? (
        <div
          aria-label={`Действия с «${work.title}»`}
          className="book-context-menu"
          ref={menuRef}
          role="menu"
          style={{ left: menu.x, top: menu.y }}
        >
          <Link onClick={() => setMenu(null)} role="menuitem" to={`/read/${work.id}`}><Play aria-hidden="true" /> Читать</Link>
          <Link onClick={() => setMenu(null)} role="menuitem" to={`/work/${work.id}`}><FileSearch aria-hidden="true" /> Информация</Link>
          <Link onClick={() => setMenu(null)} role="menuitem" to={`/work/${work.id}?collection=1`}><FolderHeart aria-hidden="true" /> Добавить в коллекцию</Link>
          {onToggleFavorite ? <button onClick={() => { onToggleFavorite(); setMenu(null); }} role="menuitem" type="button"><Heart aria-hidden="true" /> {work.favorite ? 'Убрать из избранного' : 'В избранное'}</button> : null}
          {onRevealSource && work.format !== 'remote_manga' ? <button onClick={() => { onRevealSource(); setMenu(null); }} role="menuitem" type="button"><FolderOpen aria-hidden="true" /> Открыть расположение файла</button> : null}
          {onRemove ? <><span className="book-context-menu__separator" /><button className="book-context-menu__danger" onClick={() => { onRemove(); setMenu(null); }} role="menuitem" type="button"><Trash2 aria-hidden="true" /> Убрать из библиотеки</button></> : null}
        </div>
      ) : null}
    </article>
  );
}
