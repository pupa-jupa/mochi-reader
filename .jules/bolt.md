
## 2024-05-24 - Stable Callbacks in Memoized Lists
**Learning:** Using `React.memo` with custom comparison functions that ignore inline callbacks causes stale closures. We refactored list components (`BookCard`) to accept identifying arguments (e.g. `id`) and use stable callback references. We noticed that when parent component callbacks need to perform optimistic updates based on rapidly changing local state (like `collection`), those callbacks will also become unstable.
**Action:** Use `useRef` to maintain a stable reference to frequently changing local state, and access `ref.current` inside the `useCallback` to prevent memoized child re-renders without sacrificing closure accuracy.
