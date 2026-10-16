## 2024-10-16 - Prevent Unsafe Dynamic Column Identifiers in SQLite Queries
**Vulnerability:** Found `format!` being used to dynamically construct SQL queries with `column` identifier in `query_one` method in `src-tauri/src/database/progress_repository.rs`.
**Learning:** Even if the dynamic parts are from internal sources, using `format!` string interpolation introduces potential SQL injection risks and bypasses `rusqlite`'s protection.
**Prevention:** Avoid `format!` for SQL column/table names. Use a strict `match` block with an allowlist for any dynamic components.
