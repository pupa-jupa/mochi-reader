## 2024-05-24 - Fix SQL Injection in query_one

**Vulnerability:** SQL injection vulnerability found in `ProgressRepository::query_one` in `src-tauri/src/database/progress_repository.rs` due to the use of `format!` to construct SQL queries with string interpolation for column names without proper whitelisting.

**Learning:** When using `format!` to construct SQL query strings, injecting column names directly can lead to SQL injection.

**Prevention:** Use match arms or exhaustive enum matches to safely resolve column names before injecting them into the SQL string via `format!`, or avoid dynamically constructing SQL queries where possible.
