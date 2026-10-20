## 2025-02-27 - SQL Injection in Progress Repository using format!
**Vulnerability:** Found a dynamic column query string interpolation using `format!` in `query_one` inside `src-tauri/src/database/progress_repository.rs`.
**Learning:** `rusqlite` parameters like `?1` only sanitize column values, not table or column names themselves. The dynamic format string introduces an attack vector where an injection could potentially access different reading progress details if `column` values are user controlled.
**Prevention:** Rather than interpolating the column string, directly match allowed dynamic column strings (`"work_id"`, `"content_identity"`) against fixed SQL queries to strictly validate incoming queries.
