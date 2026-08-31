export type ThemeName = 'sakura' | 'milk' | 'night';

export interface AppSettings {
  theme: ThemeName;
  reduceMotion: boolean;
  showMascot: boolean;
  uiScale: number;
  onboardingComplete: boolean;
  cacheLimitMb: number | null;
}
