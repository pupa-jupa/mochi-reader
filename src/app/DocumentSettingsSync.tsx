import { useEffect, useRef } from 'react';

import { desktopBridge, isDesktopRuntime } from './bridge';
import { applySettingsToDocument, useSettingsStore } from '../stores/settingsStore';

export function DocumentSettingsSync() {
  const theme = useSettingsStore((state) => state.theme);
  const reduceMotion = useSettingsStore((state) => state.reduceMotion);
  const showMascot = useSettingsStore((state) => state.showMascot);
  const uiScale = useSettingsStore((state) => state.uiScale);
  const onboardingComplete = useSettingsStore((state) => state.onboardingComplete);
  const cacheLimitMb = useSettingsStore((state) => state.cacheLimitMb);
  const settingsReady = useSettingsStore((state) => state.settingsReady);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!isDesktopRuntime()) {
      useSettingsStore.getState().finishHydration();
      return;
    }
    let active = true;
    void desktopBridge
      .getSettings()
      .then((settings) => {
        if (active) useSettingsStore.getState().hydrateFromDesktop(settings);
      })
      .catch(() => {
        if (active) useSettingsStore.getState().finishHydration();
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const settings = { theme, reduceMotion, showMascot, uiScale, onboardingComplete, cacheLimitMb };
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => applySettingsToDocument(settings, media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme, reduceMotion, showMascot, uiScale, onboardingComplete, cacheLimitMb]);

  useEffect(() => {
    if (!settingsReady || !isDesktopRuntime()) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void desktopBridge
        .updateSettings({
          theme,
          reduceMotion,
          showMascot,
          uiScale,
          onboardingComplete,
          cacheLimitMb,
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, [cacheLimitMb, onboardingComplete, reduceMotion, settingsReady, showMascot, theme, uiScale]);

  return null;
}
