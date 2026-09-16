## 2024-05-24 - Accessible Visual Progress Bars
**Learning:** Visual progress bars (like `.progress` with a width percentage) need explicit ARIA roles and values (`role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`) to be properly announced by screen readers, even if they already have an `aria-label`.
**Action:** Always include the full suite of progress bar ARIA attributes when building custom visual progress indicators instead of just relying on an `aria-label`.
