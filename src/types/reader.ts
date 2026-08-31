import type { WorkFormat, WorkKind } from './library';

export interface ReaderChapter {
  id: string;
  title: string;
  html: string;
  plainTextLength: number;
}

export interface ReaderDocument {
  workId: string;
  title: string;
  author: string | null;
  format: WorkFormat;
  kind: WorkKind;
  chapters: ReaderChapter[];
}

export interface SavedReaderPosition {
  chapterId: string;
  progress: number;
  updatedAt: string;
}
