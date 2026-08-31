import { describe, expect, it } from 'vitest';

import { clampCharacterOffset, normalizeReaderProgress } from './readerPosition';

describe('reader position', () => {
  it('restores the nearest valid offset after content shrinks', () => {
    expect(clampCharacterOffset({ savedOffset: 900, chapterLength: 640 })).toBe(640);
    expect(clampCharacterOffset({ savedOffset: -20, chapterLength: 640 })).toBe(0);
  });

  it('keeps persisted percentages in the valid range', () => {
    expect(normalizeReaderProgress(1.7)).toBe(1);
    expect(normalizeReaderProgress(-0.5)).toBe(0);
    expect(normalizeReaderProgress(Number.NaN)).toBe(0);
  });
});
