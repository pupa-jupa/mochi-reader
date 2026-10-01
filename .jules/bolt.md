## 2024-05-18 - List Item Memoization and Stable Callbacks
**Learning:** Using `React.memo` with a custom comparison function that ignores inline callbacks is an anti-pattern that leads to stale closures, as the component will hold onto callbacks from its initial render.
**Action:** To safely memoize list items (like `BookCard`), ensure parent components pass stable callback references using `useCallback`. This often requires refactoring the callback signatures to accept identifying arguments (e.g., `id`, `title`) so they don't need to close over the specific item data in inline functions.
