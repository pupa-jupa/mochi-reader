## 2025-05-16 - Prevent SQL Injection with strict allowlists for format! macros

**Vulnerability:** Found a potential SQL injection vulnerability in `src-tauri/src/database/progress_repository.rs` where a dynamic column name was interpolated directly into a SQL query string using the `format!` macro.
**Learning:** In Tauri backends, when relying on `format!` to construct SQL queries, especially for column names or table names that cannot be parameterized in SQLite, we must never inject dynamic variables without strict validation.
**Prevention:** Always use a strict `match` allowlist to validate dynamic identifiers (like column names) before formatting them into SQL strings to avoid SQL injection risks.
