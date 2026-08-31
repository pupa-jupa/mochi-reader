import { describe, expect, it } from 'vitest';

import { droppedPaths } from './desktopDrop';

describe('desktop drag and drop adapter', () => {
  it('returns paths only for a completed drop event', () => {
    expect(droppedPaths({ type: 'enter', paths: ['C:\\Books'], position: {} })).toEqual([]);
    expect(
      droppedPaths({
        type: 'drop',
        paths: ['C:\\Books\\Moon.epub', 'C:\\Manga'],
        position: {},
      }),
    ).toEqual(['C:\\Books\\Moon.epub', 'C:\\Manga']);
  });
});
