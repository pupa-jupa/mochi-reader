## 2024-09-27 - Redundant ARIA labels on wrapper inputs
**Learning:** While explicit `aria-label`s on form inputs improve a11y, adding them to inputs inherently enclosed inside `<label><span>Text</span><input /></label>` can sometimes be redundant. It is technically safe, but often the implicit label is sufficient for screen readers.
**Action:** Before applying `aria-label` to form elements, ensure that they are not already accessible via wrapping `<label>` tags with descriptive inner text. Use `aria-label` exclusively on un-labeled or icon-only inputs.
