## 2025-02-28 - Avoid String Interpolation for Dynamic Columns in SQL Queries
**Vulnerability:** The `progress_repository.rs` used `format!` to interpolate a dynamic column name (`column`) directly into an SQL query (`FROM reading_progress WHERE {column} = ?1`).
**Learning:** Even though the function was only called with hardcoded values internally, this pattern allows potential SQL injection if the `column` parameter ever receives user input. `rusqlite` parameters (`?1`) cannot be used for identifiers like table or column names.
**Prevention:** Always validate dynamic identifiers (like column or table names) against a strict, hardcoded allowlist (e.g., using a `match` statement) before interpolating them into SQL queries.
