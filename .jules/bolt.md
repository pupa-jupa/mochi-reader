
## 2024-11-06 - Stable Callbacks for Memoized List Components
**Learning:** In the React frontend, when memoizing list components (like `BookCard`) that receive callbacks from parent list views (`LibraryPage`, `DashboardPage`, `CollectionDetailsPage`), parent components must pass stable callback references using `useCallback`. Furthermore, callback signatures should accept identifying arguments (e.g., `id`, `title`) instead of closing over specific item data via inline arrow functions to avoid re-rendering entire lists.
**Action:** Always refactor callback signatures to accept identifying arguments and use `useCallback` when passing handlers to memoized list items.
