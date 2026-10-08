## 2024-05-18 - Added skip-to-content link
**Learning:** A visually hidden "skip-to-content" link improves keyboard navigation significantly by bypassing repetitive layout elements like the sidebar and top navigation. Adding `tabIndex={-1}` to the target anchor is a crucial best practice for proper focus management without affecting normal tab order.
**Action:** Always include a skip link in root application shells, ensuring the target has `tabIndex={-1}` and the CSS uses `:focus-visible` to position the link on-screen when active.
