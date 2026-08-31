export type MangaMode = 'vertical' | 'single' | 'double';
export type MangaDirection = 'ltr' | 'rtl';

export interface MangaPageDescriptor {
  index: number;
  label: string;
  mediaType: string;
}

export interface MangaManifest {
  workId: string;
  title: string;
  pages: MangaPageDescriptor[];
}

export interface MangaPageData {
  index: number;
  dataUrl: string;
}
