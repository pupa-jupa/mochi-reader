## 2024-03-08 - [SQL Injection via format!]
**Vulnerability:** Found a SQL injection vulnerability in `src-tauri/src/database/progress_repository.rs` where the `column` parameter in `query_one` was directly injected into the SQL query string using `format!`.
**Learning:** Even internal query helpers can become vulnerable if they accept column names or table names dynamically and construct queries with `format!` without validating against a strict allowlist.
**Prevention:** Avoid dynamic query building using `format!` for column or table names if possible. If required, use a strict `match` statement to validate the dynamic components against an explicit allowlist before constructing the query.
