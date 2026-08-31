import type {
  AnnotationLocator,
  ReaderAnnotation,
  TextQuoteSelector,
} from '../types/annotations';

export type BookAnnotationLocator = Extract<AnnotationLocator, { kind: 'book' }>;

const defaultContextLength = 64;

export function createBookAnnotationLocator(
  root: HTMLElement,
  sourceRange: Range,
  chapterId: string,
  contextLength = defaultContextLength,
): BookAnnotationLocator {
  if (!containsBoundary(root, sourceRange.startContainer) || !containsBoundary(root, sourceRange.endContainer)) {
    throw new Error('Selection is outside the reading document.');
  }
  const range = sourceRange.cloneRange();
  const exact = range.toString();
  if (!exact.trim()) throw new Error('Selection is empty.');

  const startOffset = absoluteTextOffset(root, range.startContainer, range.startOffset);
  const endOffset = absoluteTextOffset(root, range.endContainer, range.endOffset);
  const text = root.textContent ?? '';
  const quote: TextQuoteSelector = {
    exact,
    prefix: text.slice(Math.max(0, startOffset - contextLength), startOffset),
    suffix: text.slice(endOffset, endOffset + contextLength),
  };
  const startPath = pathFromRoot(root, range.startContainer);
  const endPath = pathFromRoot(root, range.endContainer);

  return {
    kind: 'book',
    chapterId,
    startOffset,
    endOffset,
    quote,
    domRange:
      startPath && endPath
        ? {
            startPath,
            startNodeOffset: range.startOffset,
            endPath,
            endNodeOffset: range.endOffset,
          }
        : null,
  };
}

export function resolveBookAnnotationRange(
  root: HTMLElement,
  locator: BookAnnotationLocator,
): Range | null {
  const domRange = resolveDomRange(root, locator);
  if (domRange && rangeMatches(domRange, locator.quote.exact)) return domRange;

  const positionRange = rangeFromTextOffsets(root, locator.startOffset, locator.endOffset);
  if (positionRange && rangeMatches(positionRange, locator.quote.exact)) return positionRange;

  const quoteRange = rangeFromTextQuote(root, locator.quote);
  if (quoteRange) return quoteRange;
  return locator.quote.exact.length === 0 ? positionRange : null;
}

export function applyAnnotationHighlights(
  root: HTMLElement,
  annotations: ReaderAnnotation[],
): number {
  clearAnnotationHighlights(root);
  let applied = 0;
  for (const annotation of annotations) {
    if (annotation.kind === 'quote' || annotation.locator.kind !== 'book') continue;
    const range = resolveBookAnnotationRange(root, annotation.locator);
    if (!range || range.collapsed) continue;
    if (wrapTextRange(root, range, annotation)) applied += 1;
  }
  return applied;
}

export function clearAnnotationHighlights(root: HTMLElement) {
  const marks = [...root.querySelectorAll<HTMLElement>('[data-reader-annotation]')].reverse();
  const parents = new Set<Node>();
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    parents.add(parent);
    mark.replaceWith(document.createTextNode(mark.textContent ?? ''));
  }
  for (const parent of parents) parent.normalize();
}

function resolveDomRange(root: HTMLElement, locator: BookAnnotationLocator): Range | null {
  if (!locator.domRange) return null;
  const start = nodeFromPath(root, locator.domRange.startPath);
  const end = nodeFromPath(root, locator.domRange.endPath);
  if (!start || !end) return null;
  try {
    const range = document.createRange();
    range.setStart(start, clampedNodeOffset(start, locator.domRange.startNodeOffset));
    range.setEnd(end, clampedNodeOffset(end, locator.domRange.endNodeOffset));
    return range;
  } catch {
    return null;
  }
}

function rangeFromTextQuote(root: HTMLElement, quote: TextQuoteSelector): Range | null {
  if (!quote.exact) return null;
  const text = root.textContent ?? '';
  let bestIndex = -1;
  let bestScore = -1;
  let cursor = 0;
  while (cursor <= text.length) {
    const index = text.indexOf(quote.exact, cursor);
    if (index < 0) break;
    const before = text.slice(Math.max(0, index - quote.prefix.length), index);
    const after = text.slice(index + quote.exact.length, index + quote.exact.length + quote.suffix.length);
    const score = commonSuffixLength(before, quote.prefix) + commonPrefixLength(after, quote.suffix);
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
    cursor = index + Math.max(1, quote.exact.length);
  }
  return bestIndex < 0
    ? null
    : rangeFromTextOffsets(root, bestIndex, bestIndex + quote.exact.length);
}

function rangeFromTextOffsets(root: HTMLElement, rawStart: number, rawEnd: number): Range | null {
  const nodes = textNodes(root);
  if (nodes.length === 0) return null;
  const total = nodes.reduce((length, node) => length + node.data.length, 0);
  const start = Math.max(0, Math.min(total, Number.isFinite(rawStart) ? rawStart : 0));
  const end = Math.max(start, Math.min(total, Number.isFinite(rawEnd) ? rawEnd : start));
  const startBoundary = textBoundary(nodes, start);
  const endBoundary = textBoundary(nodes, end);
  if (!startBoundary || !endBoundary) return null;
  const range = document.createRange();
  range.setStart(startBoundary.node, startBoundary.offset);
  range.setEnd(endBoundary.node, endBoundary.offset);
  return range;
}

function textBoundary(nodes: Text[], offset: number) {
  let cursor = 0;
  for (const node of nodes) {
    const end = cursor + node.data.length;
    if (offset <= end) return { node, offset: offset - cursor };
    cursor = end;
  }
  const node = nodes.at(-1);
  return node ? { node, offset: node.data.length } : null;
}

function wrapTextRange(root: HTMLElement, range: Range, annotation: ReaderAnnotation) {
  const start = absoluteTextOffset(root, range.startContainer, range.startOffset);
  const end = absoluteTextOffset(root, range.endContainer, range.endOffset);
  if (end <= start) return false;
  const segments: Array<{ node: Text; start: number; end: number }> = [];
  let cursor = 0;
  for (const node of textNodes(root)) {
    const nodeEnd = cursor + node.data.length;
    const overlapStart = Math.max(start, cursor);
    const overlapEnd = Math.min(end, nodeEnd);
    if (overlapStart < overlapEnd) {
      segments.push({
        node,
        start: overlapStart - cursor,
        end: overlapEnd - cursor,
      });
    }
    cursor = nodeEnd;
  }
  for (const segment of segments.reverse()) {
    const parent = segment.node.parentNode;
    if (!parent) continue;
    const before = segment.node.data.slice(0, segment.start);
    const selected = segment.node.data.slice(segment.start, segment.end);
    const after = segment.node.data.slice(segment.end);
    const fragment = document.createDocumentFragment();
    if (before) fragment.append(document.createTextNode(before));
    const mark = document.createElement('mark');
    mark.className = 'reader-highlight';
    mark.dataset.readerAnnotation = annotation.id;
    mark.dataset.annotationKind = annotation.kind;
    mark.dataset.annotationColor = annotation.color ?? 'lavender';
    mark.textContent = selected;
    fragment.append(mark);
    if (after) fragment.append(document.createTextNode(after));
    parent.replaceChild(fragment, segment.node);
  }
  return segments.length > 0;
}

function absoluteTextOffset(root: HTMLElement, container: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(container, clampedNodeOffset(container, offset));
  return range.toString().length;
}

function pathFromRoot(root: Node, node: Node): number[] | null {
  const path: number[] = [];
  let current: Node | null = node;
  while (current && current !== root) {
    const parent: Node | null = current.parentNode;
    if (!parent) return null;
    const index = [...parent.childNodes].indexOf(current as ChildNode);
    if (index < 0) return null;
    path.unshift(index);
    current = parent;
  }
  return current === root ? path : null;
}

function nodeFromPath(root: Node, path: number[]): Node | null {
  let node: Node = root;
  for (const index of path) {
    const child = node.childNodes.item(index);
    if (!child) return null;
    node = child;
  }
  return node;
}

function containsBoundary(root: HTMLElement, node: Node) {
  return node === root || root.contains(node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
}

function clampedNodeOffset(node: Node, offset: number) {
  const length = node.nodeType === Node.TEXT_NODE ? (node.textContent?.length ?? 0) : node.childNodes.length;
  return Math.max(0, Math.min(length, offset));
}

function textNodes(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  return nodes;
}

function rangeMatches(range: Range, exact: string) {
  return exact.length === 0 || range.toString() === exact;
}

function commonPrefixLength(left: string, right: string) {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
}

function commonSuffixLength(left: string, right: string) {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[left.length - 1 - index] === right[right.length - 1 - index]) {
    index += 1;
  }
  return index;
}
