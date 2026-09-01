import type { AnnotationLocator, PdfTextRect } from '../types/annotations';

export type PdfAnnotationLocator = Extract<AnnotationLocator, { kind: 'pdf' }>;

const contextLength = 64;

export function createPdfAnnotationLocator(
  textLayer: HTMLElement,
  pageStage: HTMLElement,
  sourceRange: Range,
  pageIndex: number,
): PdfAnnotationLocator {
  if (!containsBoundary(textLayer, sourceRange.startContainer)
    || !containsBoundary(textLayer, sourceRange.endContainer)) {
    throw new Error('Selection is outside the PDF text layer.');
  }

  const range = sourceRange.cloneRange();
  const exact = range.toString();
  if (!exact.trim()) throw new Error('Selection is empty.');

  const before = range.cloneRange();
  before.selectNodeContents(textLayer);
  before.setEnd(range.startContainer, range.startOffset);
  const startOffset = before.toString().length;
  const text = textLayer.textContent ?? '';

  return {
    kind: 'pdf',
    pageIndex,
    quote: {
      exact,
      prefix: text.slice(Math.max(0, startOffset - contextLength), startOffset),
      suffix: text.slice(startOffset + exact.length, startOffset + exact.length + contextLength),
    },
    rects: normalizedRangeRects(sourceRange, pageStage),
  };
}

function normalizedRangeRects(range: Range, pageStage: HTMLElement): PdfTextRect[] {
  const pageRect = pageStage.getBoundingClientRect();
  if (pageRect.width <= 0 || pageRect.height <= 0) {
    throw new Error('PDF page geometry is unavailable.');
  }

  const clientRects = typeof range.getClientRects === 'function'
    ? Array.from(range.getClientRects())
    : [];
  const fallback = typeof range.getBoundingClientRect === 'function'
    ? range.getBoundingClientRect()
    : null;
  const rects = clientRects.length > 0 ? clientRects : fallback ? [fallback] : [];

  const normalized = rects
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => normalizeRect(rect, pageRect))
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (normalized.length === 0) throw new Error('Selection geometry is unavailable.');
  return normalized;
}

function normalizeRect(rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>, page: DOMRect) {
  const left = clamp(rect.left, page.left, page.right);
  const top = clamp(rect.top, page.top, page.bottom);
  const right = clamp(rect.right, page.left, page.right);
  const bottom = clamp(rect.bottom, page.top, page.bottom);
  return {
    x: round((left - page.left) / page.width),
    y: round((top - page.top) / page.height),
    width: round((right - left) / page.width),
    height: round((bottom - top) / page.height),
  };
}

function containsBoundary(root: HTMLElement, boundary: Node) {
  return boundary === root || root.contains(boundary);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
