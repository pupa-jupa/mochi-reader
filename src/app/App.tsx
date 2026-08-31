import { HashRouter, Route, Routes } from 'react-router-dom';

import { BookmarksPage } from '../features/bookmarks/BookmarksPage';
import { CollectionsPage } from '../features/collections/CollectionsPage';
import { CollectionDetailsPage } from '../features/collections/CollectionDetailsPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { WorkDetailsPage } from '../features/details/WorkDetailsPage';
import { HistoryPage } from '../features/history/HistoryPage';
import { LibraryPage } from '../features/library/LibraryPage';
import { NotesPage } from '../features/notes/NotesPage';
import { OnboardingFlow } from '../features/onboarding/OnboardingFlow';
import { UniversalReaderPage } from '../features/reader/UniversalReaderPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { SourcesPage } from '../features/sources/SourcesPage';
import { SourceCatalogPage } from '../features/sources/SourceCatalogPage';
import { RemoteMangaDetailsPage } from '../features/sources/RemoteMangaDetailsPage';
import { RemoteMangaReaderPage } from '../features/sources/RemoteMangaReaderPage';
import { useSettingsStore } from '../stores/settingsStore';
import { AppLayout } from './AppLayout';
import { DocumentSettingsSync } from './DocumentSettingsSync';

export function App() {
  const onboardingComplete = useSettingsStore((state) => state.onboardingComplete);
  const settingsReady = useSettingsStore((state) => state.settingsReady);

  return (
    <div aria-label="Mochi Reader" className="app" role="application">
      <DocumentSettingsSync />
      <HashRouter>
        {!settingsReady ? (
          <div aria-label="Загружаем настройки" className="app-initializing">
            <span className="spinner" />
            <p>Раскладываем книги по полкам…</p>
          </div>
        ) : onboardingComplete ? (
          <Routes>
            <Route element={<AppLayout />}>
              <Route element={<DashboardPage />} index />
              <Route element={<LibraryPage key="library" />} path="library" />
              <Route element={<LibraryPage initialFilter="book" key="books" />} path="books" />
              <Route element={<LibraryPage initialFilter="manga" key="manga" />} path="manga" />
              <Route element={<LibraryPage initialFilter="favorite" key="favorites" />} path="favorites" />
              <Route element={<CollectionsPage />} path="collections" />
              <Route element={<CollectionDetailsPage />} path="collections/:id" />
              <Route element={<BookmarksPage />} path="bookmarks" />
              <Route element={<NotesPage />} path="notes" />
              <Route element={<HistoryPage />} path="history" />
              <Route element={<SourcesPage />} path="sources" />
              <Route element={<SourceCatalogPage />} path="sources/:sourceId" />
              <Route element={<RemoteMangaDetailsPage />} path="sources/:sourceId/manga" />
              <Route element={<SettingsPage />} path="settings" />
              <Route element={<WorkDetailsPage />} path="work/:id" />
            </Route>
            <Route element={<UniversalReaderPage />} path="read/:id" />
            <Route element={<RemoteMangaReaderPage />} path="sources/:sourceId/read" />
          </Routes>
        ) : (
          <OnboardingFlow />
        )}
      </HashRouter>
    </div>
  );
}
