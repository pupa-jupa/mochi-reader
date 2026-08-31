export type ReaderMode = 'book' | 'pdf' | 'manga';

export type ReaderLocator =
  | { kind: 'book'; chapterId: string | null; charOffset: number | null }
  | { kind: 'pdf'; pageIndex: number }
  | { kind: 'manga'; chapterId: string | null; pageIndex: number };

export interface ReadingProgress {
  contentIdentity: string;
  workId: string;
  locator: ReaderLocator;
  percent: number;
  readerMode: ReaderMode;
  updatedAt: string;
}

export type ProgressUpdate = Pick<ReadingProgress, 'workId' | 'locator' | 'percent'>;

export interface BookmarkDraft {
  workId: string;
  chapterId: string | null;
  pageIndex: number | null;
  charOffset: number | null;
  percent: number;
  excerpt: string | null;
  note: string | null;
}

export interface BookmarkRecord extends BookmarkDraft {
  id: string;
  workTitle: string;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryEntry {
  id: string;
  contentIdentity: string;
  workId: string;
  workTitle: string;
  workKind: import('./library').WorkKind;
  coverPath: string | null;
  startLocator: ReaderLocator;
  endLocator: ReaderLocator | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
}

export interface CollectionSummary {
  id: string;
  title: string;
  description: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionDetails extends CollectionSummary {
  items: import('./library').WorkSummary[];
}
