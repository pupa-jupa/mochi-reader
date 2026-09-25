## 2024-03-24 - Memoize Reusable Complex Components
**Learning:** React components that appear in high quantities in lists, such as `BookCard`, can significantly impact render performance when parent components update state.
**Action:** Use `React.memo` for components like `BookCard` that take complex props and appear frequently in lists. This helps to avoid unnecessary re-renders when parent states change but props passed to the child component remain exactly the same.
