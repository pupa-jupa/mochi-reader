## 2024-05-30 - SQL Injection via dynamic column names in query builder
**Vulnerability:** The `query_one` function in `progress_repository.rs` used `format!` to dynamically insert a column name into a SQL query string.
**Learning:** Even if internal usages are currently safe (e.g., only called with hardcoded "work_id" or "content_identity"), using string interpolation for column names creates a dangerous pattern that can lead to SQL injection if new, user-controlled calls are added later. The `rusqlite` parameterized variables (like `?1`) only parameterize values, not identifiers like tables or columns.
**Prevention:** Always use a strict `match` statement allowlist to validate dynamic identifiers (like column names) before interpolating them into SQL queries.
