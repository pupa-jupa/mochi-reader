import type { MangaDirection } from '../types/manga';

export type MangaAction = 'next' | 'previous' | null;

export function resolveMangaAction({
  key,
  direction,
}: {
  key: string;
  direction: MangaDirection;
}): MangaAction {
  if (key === 'ArrowRight') return direction === 'rtl' ? 'previous' : 'next';
  if (key === 'ArrowLeft') return direction === 'rtl' ? 'next' : 'previous';
  return null;
}

export function doublePageSpread(
  index: number,
  total: number,
  direction: MangaDirection,
): number[] {
  if (total <= 0) return [];
  const first = Math.min(Math.max(0, index), total - 1);
  const spread = first + 1 < total ? [first, first + 1] : [first];
  return direction === 'rtl' ? spread.reverse() : spread;
}
