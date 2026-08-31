export type WorkKind = 'book' | 'manga';
export type WorkStatus = 'reading' | 'planned' | 'completed' | 'on_hold';
export type WorkFormat =
  | 'epub'
  | 'pdf'
  | 'fb2'
  | 'txt'
  | 'html'
  | 'markdown'
  | 'cbz'
  | 'cbr'
  | 'zip_images'
  | 'image_folder'
  | 'image';

export interface WorkSummary {
  id: string;
  title: string;
  author: string | null;
  kind: WorkKind;
  format: WorkFormat;
  coverPath: string | null;
  status: WorkStatus;
  favorite: boolean;
  progressPercent: number;
  missingFile: boolean;
  addedAt: string;
  lastOpenedAt: string | null;
}

export interface WorkDetails extends WorkSummary {
  originalTitle: string | null;
  description: string | null;
  sourcePath: string;
  fileSize: number;
  pageCount: number | null;
  chapterCount: number;
}

export interface WorkMetadataUpdate {
  title: string;
  author: string | null;
  originalTitle: string | null;
  description: string | null;
}

export interface WorkPage {
  items: WorkSummary[];
  total: number;
}

export interface LibraryQuery {
  query: string;
  kinds?: WorkKind[];
  statuses?: WorkStatus[];
  favorite?: boolean | null;
  sort?: LibrarySort;
  offset: number;
  limit: number;
}

export type LibrarySort = 'added_desc' | 'title_asc' | 'last_opened_desc' | 'progress_desc';

export interface ImportItemResult {
  path: string;
  workId: string | null;
  title: string | null;
  error: string | null;
}

export interface ImportBatchResult {
  items: ImportItemResult[];
  imported: number;
  failed: number;
}
