interface DragDropLikeEvent {
  type: string;
  paths?: string[];
  position?: unknown;
}

export function droppedPaths(event: DragDropLikeEvent) {
  return event.type === 'drop' && Array.isArray(event.paths) ? event.paths : [];
}
