## 2026-10-18 - Prevent SQL Injection via `format!`
**Vulnerability:** SQL Injection risk in `src-tauri/src/database/progress_repository.rs` due to the use of `format!` to insert a dynamic column name into an SQL query string (`fn query_one`).
**Learning:** `rusqlite` parameters only work for values, not for identifiers like table or column names. Using `format!` with dynamic identifiers, even if they seem safe internally, introduces an SQL injection vulnerability vector if user input ever reaches that code path.
**Prevention:** Use a strict `match` statement allowlist to validate and select static query strings for dynamic identifiers, rather than interpolating them into SQL strings with `format!`.
