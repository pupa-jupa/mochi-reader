## 2024-05-18 - React.memo with inline callbacks anti-pattern
**Learning:** Wrapping a list component (like `BookCard`) with `React.memo` is ineffective if parent components pass inline closures (e.g. `() => toggleFavorite(id)`) as props, because new function references are created on every render, causing the memoized component to re-render anyway.
**Action:** Always refactor child component callback props to accept identifying arguments (like `id`) instead of relying on parent closures. Then, pass stable function references using `useCallback` in the parent component.
