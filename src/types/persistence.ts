export type ReaderMode = 'book' | 'pdf' | 'manga';

export interface ReadingProgress {
  workId: string;
  chapterId: string | null;
  pageIndex: number | null;
  charOffset: number | null;
  percent: number;
  readerMode: ReaderMode;
  updatedAt: string;
}

export type ProgressUpdate = Omit<ReadingProgress, 'updatedAt'>;

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
  workId: string;
  workTitle: string;
  chapterId: string | null;
  pageIndex: number | null;
  openedAt: string;
  closedAt: string | null;
}

export interface CollectionSummary {
  id: string;
  title: string;
  description: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}
