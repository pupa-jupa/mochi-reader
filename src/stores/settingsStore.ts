import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AppSettings, ThemeName } from '../types/settings';

export type { AppSettings, ThemeName } from '../types/settings';

interface SettingsState extends AppSettings {
  settingsReady: boolean;
  setTheme(theme: ThemeName): void;
  setReduceMotion(value: boolean): void;
  setShowMascot(value: boolean): void;
  setUiScale(value: number): void;
  setCacheLimitMb(value: number | null): void;
  completeOnboarding(): void;
  hydrateFromDesktop(settings: AppSettings): void;
  finishHydration(): void;
  reset(): void;
}

export const defaultSettings: AppSettings = {
  theme: 'sakura',
  reduceMotion: false,
  showMascot: true,
  uiScale: 100,
  onboardingComplete: false,
  cacheLimitMb: 1_024,
};

function boundedScale(scale: number) {
  return Math.min(130, Math.max(80, Math.round(scale)));
}

export function applySettingsToDocument(settings: AppSettings, systemReduced = false) {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.dataset.motion =
    systemReduced || settings.reduceMotion ? 'reduced' : 'full';
  document.documentElement.style.setProperty('--ui-scale', String(boundedScale(settings.uiScale) / 100));
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      settingsReady: false,
      setTheme: (theme) => set({ theme }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setShowMascot: (showMascot) => set({ showMascot }),
      setUiScale: (uiScale) => set({ uiScale: boundedScale(uiScale) }),
      setCacheLimitMb: (cacheLimitMb) => set({ cacheLimitMb }),
      completeOnboarding: () => set({ onboardingComplete: true }),
      hydrateFromDesktop: (settings) => set({ ...settings, settingsReady: true }),
      finishHydration: () => set({ settingsReady: true }),
      reset: () => set(defaultSettings),
    }),
    {
      name: 'mochi-reader:settings',
      version: 1,
      partialize: ({ theme, reduceMotion, showMascot, uiScale, onboardingComplete, cacheLimitMb }) => ({
        theme,
        reduceMotion,
        showMascot,
        uiScale,
        onboardingComplete,
        cacheLimitMb,
      }),
    },
  ),
);
