export type SourceAdapterKind = 'manifest' | 'generic_html' | 'mangadex' | 'opds';

export interface OpdsCatalogPreview {
  name: string;
  catalogType: 'opds1' | 'opds2';
  itemCount: number | null;
  url: string;
}

export interface SourceCapabilities {
  search: boolean;
  download: boolean;
}

export interface SourceConfig {
  id: string;
  name: string;
  baseUrl: string;
  adapterKind: SourceAdapterKind;
  enabled: boolean;
  capabilities: SourceCapabilities;
  createdAt: string;
  updatedAt: string;
}

export interface RemoteMangaSummary {
  remoteId: string;
  title: string;
  url: string;
  coverUrl: string | null;
  summary: string | null;
  contentKind?: 'manga' | 'book';
  author?: string | null;
  acquisitionUrl?: string | null;
  format?: string | null;
}

export interface RemoteWorkDraft {
  sourceId: string;
  remoteId: string;
  title: string;
  description: string | null;
  remoteUrl: string;
  coverUrl: string | null;
  chapterCount: number;
}

export interface RemoteSearchPage {
  items: RemoteMangaSummary[];
  hasNextPage: boolean;
}

export interface RemoteChapter {
  remoteId: string;
  title: string;
  url: string;
  attribution: string | null;
}

export interface RemotePage {
  index: number;
  label: string;
  url: string;
}

export interface ChapterDownloadResult {
  totalPages: number;
  cachedPages: number;
}
