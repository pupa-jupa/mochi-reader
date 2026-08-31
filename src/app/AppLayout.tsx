import { FilePlus2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { isDesktopRuntime } from './bridge';
import { libraryStore } from '../stores/libraryStore';
import { droppedPaths } from '../utils/desktopDrop';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const contentRef = useRef<HTMLElement>(null);
  const [dropActive, setDropActive] = useState(false);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [location.pathname]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        navigate('/library?focus=search');
      }
      if (event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void libraryStore.getState().importFiles();
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [navigate]);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let active = true;
    let dispose: (() => void) | undefined;
    void import('@tauri-apps/api/webview').then(async ({ getCurrentWebview }) => {
      const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        if (!active) return;
        setDropActive(event.payload.type === 'enter' || event.payload.type === 'over');
        const paths = droppedPaths(event.payload);
        if (paths.length > 0) {
          setDropActive(false);
          navigate('/library');
          void libraryStore.getState().importSelected(paths);
        }
      });
      if (active) dispose = unlisten;
      else unlisten();
    });
    return () => {
      active = false;
      dispose?.();
    };
  }, [navigate]);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell__main">
        <TopBar />
        <main className="content-canvas" id="main-content" ref={contentRef}>
          <Outlet />
        </main>
      </div>
      {dropActive ? (
        <div aria-live="polite" className="drop-overlay">
          <div><FilePlus2 aria-hidden="true" /><strong>Отпусти, чтобы добавить</strong><span>Книгу, архив манги или целую папку</span></div>
        </div>
      ) : null}
    </div>
  );
}
