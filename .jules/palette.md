## 2024-05-19 - Visual Feedback on Async Buttons
**Learning:** Asynchronous action buttons in the UI should provide visual feedback while the action is in progress to prevent user confusion or duplicate submissions.
**Action:** When creating or updating a button that triggers an asynchronous action, replace its primary icon with `<span className="spinner" />` if an action (e.g. `saving`, `busy`, `relinking`, `diagnosticBusy`) is active.
