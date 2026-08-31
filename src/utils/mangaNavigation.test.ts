import { describe, expect, it } from 'vitest';

import { doublePageSpread, resolveMangaAction } from './mangaNavigation';

describe('manga navigation', () => {
  it('maps ArrowRight to previous in RTL mode', () => {
    expect(resolveMangaAction({ key: 'ArrowRight', direction: 'rtl' })).toBe('previous');
    expect(resolveMangaAction({ key: 'ArrowLeft', direction: 'rtl' })).toBe('next');
  });

  it('keeps an odd final page visible in a double-page spread', () => {
    expect(doublePageSpread(8, 9, 'ltr')).toEqual([8]);
    expect(doublePageSpread(0, 9, 'ltr')).toEqual([0, 1]);
  });
});
