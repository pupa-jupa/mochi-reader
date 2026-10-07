## 2024-10-07 - [Explicit Form Labels]
**Learning:** React Testing Library is sensitive to changes in label content when using `getByLabelText`. Modifying the label text (like adding a visual `*` for required fields) breaks the exact match.
**Action:** Always use a regex (e.g. `/Название произведения/i`) in `getByLabelText` queries when adding visual indicators to form labels, or use `aria-label` / `aria-labelledby` if the visual content changes dynamically.
