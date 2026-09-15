## 2024-05-24 - Tooltips for icon-only buttons
**Learning:** Icon-only buttons used `aria-label` for screen readers, but sighted mouse users didn't get any tooltips to understand what the icons meant, which degrades usability.
**Action:** Replicate the text in `aria-label` attributes to `title` attributes on all icon-only buttons to allow native browser tooltips.
