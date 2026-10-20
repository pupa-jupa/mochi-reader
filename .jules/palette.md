## 2024-05-18 - Missing loading spinners on async buttons
**Learning:** Found multiple forms in `NotesPage.tsx` and `WorkDetailsPage.tsx` where async form submissions lock the UI but do not show an explicit loading spinner icon. Instead, the button text updates (e.g. 'Сохраняю...'). Users may miss the text change or mistake the disabled state for an error.
**Action:** When a button is performing an async operation and is disabled, always render a `<span className="spinner" />` or similar visual indicator so it's globally consistent with UX Coding Standards.
