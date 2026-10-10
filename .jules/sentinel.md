## 2024-05-24 - SQL Injection Risk via string format in `progress_repository.rs`
**Vulnerability:** A `format!` macro was dynamically inserting column names into a SQLite query inside `src-tauri/src/database/progress_repository.rs`.
**Learning:** `rusqlite` parameters like `?1` only sanitize values, not identifiers (column or table names). Injecting untrusted inputs dynamically into SQL identifiers breaks parameterized queries and leads to injection vectors.
**Prevention:** Always use strict `match` allowlists for dynamic identifiers (column/table names) when building SQL strings in rust before running `query_row` or `execute`.
