## 2025-02-23 - Prevent SQL Injection by avoiding `format!` for column names
**Vulnerability:** Found a SQL injection vulnerability in `src-tauri/src/database/progress_repository.rs` where the `column` parameter in `query_one` was directly injected into the SQL string using `format!`.
**Learning:** `rusqlite` parameters (`?1`, `?2`) only work for values, not for identifiers like column or table names. Developers often use `format!` as a workaround, which introduces SQL injection risks.
**Prevention:** Always use a strict `match` allowlist to validate any dynamic identifiers (column/table names) before interpolating them into SQL queries.
