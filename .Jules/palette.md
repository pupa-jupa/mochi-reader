## 2023-10-27 - Context Menu Accessibility
**Learning:** Added `aria-expanded` and `aria-haspopup` to a context menu button. While simple ARIA additions might seem routine, it is critical to ensure interactive elements that toggle other content correctly announce their state and purpose. Context menu toggles are prime candidates for this.
**Action:** Consistently verify that custom dropdowns and menus use `aria-expanded` to communicate their active state to screen readers.
