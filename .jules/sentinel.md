## 2025-05-16 - Prevent SQL Injection with Allowlist in Tauri Backend
**Vulnerability:** SQL Injection via string formatting (`format!`) of column names dynamically in `src-tauri/src/database/progress_repository.rs`.
**Learning:** Using `format!` to insert variables directly into SQL queries makes the code vulnerable to SQL Injection, especially when the dynamic part is an identifier like a column or table name which cannot be parameterized.
**Prevention:** Instead of using string interpolation, use a strict `match` statement allowlist to validate and ensure that the provided string precisely matches expected, safe identifiers. Return an explicit validation error if it does not match.
