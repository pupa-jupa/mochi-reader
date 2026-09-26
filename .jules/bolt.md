## 2026-09-26 - [Avoid Inline Intl.DateTimeFormat Instantiations]
**Learning:** `new Intl.DateTimeFormat` instantiation is surprisingly slow in JS. A loop of 10000 instantiations took over 5000ms, while reusing a cached instance reduced the same loop to ~21ms. In heavily rendered components like BookmarksPage or HistoryPage, inline formatters cause measurable slowdown.
**Action:** Always extract and cache `Intl.DateTimeFormat` (and similar `Intl` constructors) into a shared utilities file rather than instantiating them on the fly in render loops or frequently called functions.
