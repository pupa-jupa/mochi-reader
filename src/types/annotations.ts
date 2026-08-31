import type { WorkKind } from './library';

export type AnnotationKind = 'highlight' | 'note' | 'quote';
export type HighlightColor = 'sakura' | 'peach' | 'lavender' | 'butter' | 'mint';

export interface TextQuoteSelector {
  exact: string;
  prefix: string;
  suffix: string;
}

export interface DomRangeSelector {
  startPath: number[];
  startNodeOffset: number;
  endPath: number[];
  endNodeOffset: number;
}

export interface PdfTextRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AnnotationLocator =
  | {
      kind: 'book';
      chapterId: string;
      startOffset: number;
      endOffset: number;
      quote: TextQuoteSelector;
      domRange: DomRangeSelector | null;
    }
  | {
      kind: 'pdf';
      pageIndex: number;
      quote: TextQuoteSelector | null;
      rects: PdfTextRect[];
    }
  | { kind: 'manga'; chapterId: string | null; pageIndex: number };

export interface ReaderAnnotationDraft {
  workId: string;
  kind: AnnotationKind;
  quote: string;
  note: string | null;
  locator: AnnotationLocator;
  color: HighlightColor | null;
}

export interface ReaderAnnotationUpdate {
  note: string | null;
  color: HighlightColor | null;
}

export interface ReaderAnnotation extends ReaderAnnotationDraft {
  id: string;
  contentIdentity: string;
  workTitle: string;
  workKind: WorkKind;
  coverPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnnotationQuery {
  workId?: string | null;
  kind?: AnnotationKind | null;
  search?: string | null;
  limit?: number | null;
}

export type AnnotationExportFormat = 'markdown' | 'json';
