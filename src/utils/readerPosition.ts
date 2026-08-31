import type { SavedReaderPosition } from '../types/reader';

export function clampCharacterOffset({
  savedOffset,
  chapterLength,
}: {
  savedOffset: number;
  chapterLength: number;
}) {
  if (!Number.isFinite(savedOffset)) return 0;
  return Math.min(Math.max(0, Math.round(savedOffset)), Math.max(0, chapterLength));
}

export function normalizeReaderProgress(progress: number) {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

function positionKey(workId: string) {
  return `mochi-reader:position:${workId}`;
}

export function loadReaderPosition(workId: string): SavedReaderPosition | null {
  try {
    const raw = localStorage.getItem(positionKey(workId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedReaderPosition>;
    if (typeof parsed.chapterId !== 'string' || typeof parsed.progress !== 'number') return null;
    return {
      chapterId: parsed.chapterId,
      progress: normalizeReaderProgress(parsed.progress),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveReaderPosition(workId: string, position: Omit<SavedReaderPosition, 'updatedAt'>) {
  localStorage.setItem(
    positionKey(workId),
    JSON.stringify({
      ...position,
      progress: normalizeReaderProgress(position.progress),
      updatedAt: new Date().toISOString(),
    }),
  );
}
