import { createStore, type StoreApi } from 'zustand/vanilla';

import { desktopBridge, type DesktopBridge } from '../app/bridge';
import type { ImportBatchResult, WorkSummary } from '../types/library';

export type LibraryStatus = 'idle' | 'loading' | 'ready' | 'importing' | 'error';

export interface LibraryState {
  items: WorkSummary[];
  total: number;
  query: string;
  status: LibraryStatus;
  error: string | null;
  lastImport: ImportBatchResult | null;
  setQuery(query: string): void;
  load(): Promise<void>;
  loadMore(): Promise<void>;
  importFiles(): Promise<void>;
  importFolder(): Promise<void>;
  importSelected(paths: string[]): Promise<void>;
  toggleFavorite(id: string): Promise<void>;
  revealSource(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  clearImportResult(): void;
}

export type LibraryStore = StoreApi<LibraryState>;

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    if ('userMessage' in error && typeof error.userMessage === 'string') return error.userMessage;
  }
  return 'Не удалось связаться с desktop-частью приложения. Перезапусти Mochi Reader и попробуй снова.';
}

export function createLibraryStore(
  bridge: DesktopBridge,
  initial: Partial<Pick<LibraryState, 'items' | 'total' | 'query' | 'status'>> = {},
): LibraryStore {
  let requestGeneration = 0;

  return createStore<LibraryState>()((set, get) => ({
    items: initial.items ?? [],
    total: initial.total ?? 0,
    query: initial.query ?? '',
    status: initial.status ?? 'idle',
    error: null,
    lastImport: null,
    setQuery: (query) => set({ query }),
    load: async () => {
      const generation = ++requestGeneration;
      set({ status: 'loading', error: null });
      try {
        const page = await bridge.listWorks({ query: get().query, offset: 0, limit: 80 });
        if (generation !== requestGeneration) return;
        set({ items: page.items, total: page.total, status: 'ready' });
      } catch (error) {
        if (generation !== requestGeneration) return;
        set({ status: 'error', error: errorMessage(error) });
      }
    },
    loadMore: async () => {
      const current = get();
      if (current.status === 'loading' || current.items.length >= current.total) return;
      const generation = requestGeneration;
      set({ status: 'loading', error: null });
      try {
        const page = await bridge.listWorks({
          query: current.query,
          offset: current.items.length,
          limit: 80,
        });
        if (generation !== requestGeneration) return;
        set((state) => {
          const known = new Set(state.items.map((item) => item.id));
          return {
            items: [...state.items, ...page.items.filter((item) => !known.has(item.id))],
            total: page.total,
            status: 'ready',
          };
        });
      } catch (error) {
        if (generation !== requestGeneration) return;
        set({ status: 'error', error: errorMessage(error) });
      }
    },
    importFiles: async () => {
      try {
        const paths = await bridge.pickBookFiles();
        if (paths.length > 0) await get().importSelected(paths);
      } catch (error) {
        set({ status: 'error', error: errorMessage(error) });
      }
    },
    importFolder: async () => {
      try {
        const path = await bridge.pickFolder();
        if (path) await get().importSelected([path]);
      } catch (error) {
        set({ status: 'error', error: errorMessage(error) });
      }
    },
    importSelected: async (paths) => {
      set({ status: 'importing', error: null, lastImport: null });
      try {
        const result = await bridge.importPaths(paths);
        set({ lastImport: result });
        await get().load();
      } catch (error) {
        set({ status: 'error', error: errorMessage(error) });
      }
    },
    toggleFavorite: async (id) => {
      const item = get().items.find((work) => work.id === id);
      if (!item) return;
      const favorite = !item.favorite;
      set((state) => ({
        items: state.items.map((work) => (work.id === id ? { ...work, favorite } : work)),
      }));
      try {
        await bridge.setFavorite(id, favorite);
      } catch (error) {
        set((state) => ({
          items: state.items.map((work) =>
            work.id === id ? { ...work, favorite: item.favorite } : work,
          ),
          error: errorMessage(error),
        }));
      }
    },
    revealSource: async (id) => {
      try {
        await bridge.revealWorkSource(id);
      } catch (error) {
        set({ error: errorMessage(error) });
      }
    },
    remove: async (id) => {
      try {
        await bridge.removeFromLibrary(id);
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
          total: Math.max(0, state.total - 1),
        }));
      } catch (error) {
        set({ error: errorMessage(error) });
      }
    },
    clearImportResult: () => set({ lastImport: null }),
  }));
}

export const libraryStore = createLibraryStore(desktopBridge);
