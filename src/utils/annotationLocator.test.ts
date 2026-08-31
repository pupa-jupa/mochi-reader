import { describe, expect, it } from 'vitest';

import type { ReaderAnnotation } from '../types/annotations';
import {
  applyAnnotationHighlights,
  createBookAnnotationLocator,
  resolveBookAnnotationRange,
} from './annotationLocator';

function selectAcrossMarkup(root: HTMLElement) {
  const first = root.querySelector('strong')?.firstChild;
  const second = root.querySelector('em')?.firstChild;
  if (!first || !second) throw new Error('fixture text nodes are missing');
  const range = document.createRange();
  range.setStart(first, 0);
  range.setEnd(second, second.textContent?.length ?? 0);
  return range;
}

function annotationFixture(locator: ReturnType<typeof createBookAnnotationLocator>): ReaderAnnotation {
  return {
    id: 'annotation-1',
    contentIdentity: 'local:work-1',
    workId: 'work-1',
    workTitle: 'Moon',
    workKind: 'book',
    coverPath: null,
    kind: 'highlight',
    quote: locator.quote.exact,
    note: null,
    locator,
    color: 'sakura',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };
}

describe('book annotation locators', () => {
  it('restores a cross-element selection after font and width changes', () => {
    const root = document.createElement('article');
    root.innerHTML = '<p>Before <strong>quiet</strong> <em>moon</em> after.</p>';
    const locator = createBookAnnotationLocator(root, selectAcrossMarkup(root), 'chapter-1');

    root.style.fontSize = '31px';
    root.style.width = '520px';
    const restored = resolveBookAnnotationRange(root, locator);

    expect(locator.quote.exact).toBe('quiet moon');
    expect(locator.quote.prefix).toContain('Before');
    expect(locator.quote.suffix).toContain('after');
    expect(restored?.toString()).toBe('quiet moon');
  });

  it('uses quote context when markup and absolute offsets have shifted', () => {
    const original = document.createElement('article');
    original.innerHTML = '<p>Before <strong>quiet</strong> <em>moon</em> after.</p>';
    const locator = createBookAnnotationLocator(original, selectAcrossMarkup(original), 'chapter-1');
    const changed = document.createElement('article');
    changed.innerHTML = '<header>New introduction.</header><p>Before quiet <span>moon</span> after.</p>';

    expect(resolveBookAnnotationRange(changed, locator)?.toString()).toBe('quiet moon');
  });

  it('renders and reapplies persisted highlights without changing readable text', () => {
    const root = document.createElement('article');
    root.innerHTML = '<p>Before <strong>quiet</strong> <em>moon</em> after.</p>';
    const locator = createBookAnnotationLocator(root, selectAcrossMarkup(root), 'chapter-1');
    const annotation = annotationFixture(locator);

    expect(applyAnnotationHighlights(root, [annotation])).toBe(1);
    expect(
      [...root.querySelectorAll('[data-reader-annotation="annotation-1"]')]
        .map((mark) => mark.textContent)
        .join(''),
    ).toBe('quiet moon');
    expect(root.textContent).toBe('Before quiet moon after.');

    expect(applyAnnotationHighlights(root, [annotation])).toBe(1);
    expect(root.textContent).toBe('Before quiet moon after.');
  });
});
