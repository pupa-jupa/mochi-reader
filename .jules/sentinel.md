## 2024-06-25 - Prevent SQL Injection via Dynamic Columns in `rusqlite`
**Vulnerability:** SQL injection risk due to string interpolation (`format!`) for dynamic column names in the `query_one` method of `ProgressRepository`.
**Learning:** `rusqlite` parameterized queries (using `?1`) only protect values, not table or column names. Passing untrusted input to a dynamically constructed SQL query string opens up the possibility for SQL injection.
**Prevention:** Avoid dynamic column names in queries whenever possible. If required, strictly validate them against a hardcoded `match` statement allowlist to ensure only safe, known identifiers are included in the SQL string.
