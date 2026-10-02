## 2026-10-02 - Add missing accessibility roles to custom progress bars
**Learning:** Custom UI elements acting as progress bars (like the one in `BookCard.tsx`) need explicit ARIA roles (`role="progressbar"`) and value attributes (`aria-valuenow`, `aria-valuemin`, `aria-valuemax`) to be correctly interpreted by screen readers. A visual `width` style is not sufficient.
**Action:** Always add standard ARIA progress bar attributes to any `div` or `span` that visually represents reading or completion progress.
