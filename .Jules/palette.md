## 2026-09-22 - Adding Spinners for Form Actions
**Learning:** The app had async operations (like saving collections or metadata) that disabled buttons but lacked visual indicators (spinners) and clear loading text, making it feel unresponsive.
**Action:** When implementing async actions in forms, swap the action icon for a `<span className="spinner" />` and update the button text to reflect the progressive state (e.g., "Сохраняю…" instead of "Сохранить") to provide immediate visual feedback.
