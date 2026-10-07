## 2024-05-18 - Missing memoization for React functional components with many rendered items
**Learning:** In list views (like LibraryPage or DashboardPage) many child components (like `BookCard`) are rendered in lists. When React functional components are used in these long lists, they can cause unnecessary re-renders, especially if inline callback functions are used.
**Action:** React.memo should be added to `BookCard` to prevent re-renders when a new object is passed or just to stop standard propagation.
