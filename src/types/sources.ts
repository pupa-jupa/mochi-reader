export type SourceAdapterKind = 'manifest' | 'generic_html' | 'mangadex';

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
