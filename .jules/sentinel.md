## 2024-05-18 - Prevent SQL Injection via `rusqlite` dynamic column names
**Vulnerability:** A potential SQL injection vulnerability existed in `progress_repository.rs` due to the use of `format!` to insert a dynamic column name directly into an SQL query string before passing it to `rusqlite`.
**Learning:** `rusqlite` parameterized queries (using `?1`, etc.) only protect against SQL injection in values, not in column names, table names, or SQL keywords. Using `format!` for identifiers bypasses this protection.
**Prevention:** Avoid dynamically interpolating strings into SQL queries. If an identifier must be dynamic, validate it strictly using an allowlist (e.g., a `match` statement returning known safe strings) before using `format!`.
