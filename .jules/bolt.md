## 2023-10-23 - Prevent stale closures while memoizing list item callbacks

**Learning:** When using `React.memo` on list components (e.g., `BookCard`), passing inline callbacks from parent components completely defeats the memoization because a new function instance is created on every render. However, wrapping the callback in `useCallback` isn't enough if the callback needs access to frequently changing state (like list items), as adding the state to the dependency array still causes frequent re-renders.

**Action:** Refactor callback signatures to accept identifying arguments (e.g., `id`, `title`) instead of closing over specific item data. In the parent component, maintain a stable reference to frequently changing state (if needed) using `useRef` combined with `useEffect`, and access `ref.current` inside a stable `useCallback` (with empty or minimal dependencies) to pass down to the memoized children.
