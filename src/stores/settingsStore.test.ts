import { describe, expect, it } from 'vitest';

import { applySettingsToDocument } from './settingsStore';

describe('settings document adapter', () => {
  it('applies theme, motion level and bounded interface scale', () => {
    applySettingsToDocument({
      theme: 'night',
      reduceMotion: true,
      showMascot: true,
      uiScale: 112,
      onboardingComplete: true,
      cacheLimitMb: 1_024,
    });

    expect(document.documentElement).toHaveAttribute('data-theme', 'night');
    expect(document.documentElement).toHaveAttribute('data-motion', 'reduced');
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1.12');
  });
});
