## 2025-02-28 - [SQL Injection Fix in `progress_repository.rs`]
**Vulnerability:** Use of `format!` for unvalidated dynamic column name interpolation in reading progress queries (SQL injection vulnerability).
**Learning:** `format!` inside `rusqlite` SQL queries can be exploited if the inputs are not validated.
**Prevention:** Avoid dynamically constructing column names using `format!`. If a column name *must* be dynamic, strictly validate it using a `match` allowlist to prevent SQL injection vulnerabilities.
