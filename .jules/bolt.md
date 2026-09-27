
## 2023-10-27 - Memoize BookCard in Grids
**Learning:** React re-renders in `DashboardPage`, `CollectionDetailsPage` and `LibraryPage` lists can trigger slow UI rendering when navigating or filtering if list items, such as `BookCard`, are repeatedly recreated.
**Action:** Use `React.memo` to wrap reusable components, like `BookCard`, especially those utilized in mapped array rendering patterns, when their props primarily rely on primitive values or stable reference callbacks.
