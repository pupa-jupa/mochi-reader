## 2026-10-16 - Visual Feedback for Async Buttons
**Learning:** Asynchronous action buttons without visual feedback (like 'busy' or 'saving' text without an indicator) can lead to a confusing user experience, making users wonder if their click registered.
**Action:** When creating or updating UI components for async actions, always provide clear visual feedback by replacing their primary icon with a `<span className="spinner" />` element while the action is in progress.
