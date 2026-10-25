## 2024-10-25 - Prevent SQL Injection via format! macro
**Vulnerability:** SQL injection vulnerability in `ProgressRepository::query_one` where a dynamic column name is inserted directly into the SQL string using `format!`.
**Learning:** In Rust with `rusqlite`, string formatting for SQL queries must not be used for dynamic identifiers unless explicitly validated via an allowlist, as `rusqlite` parameters only protect values, not table/column names.
**Prevention:** Use a strict `match` statement allowlist to validate dynamic column or table names before inserting them into SQL strings, or use static SQL strings and pass varying values as parameters.
