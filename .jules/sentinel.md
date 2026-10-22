## 2024-05-18 - Prevent SQL Injection via `format!` string interpolation
**Vulnerability:** Found a SQL injection vulnerability in `ProgressRepository::query_one` where a method parameter was directly inserted into a SQL query string using the `format!` macro (`FROM reading_progress WHERE {column} = ?1`).
**Learning:** `rusqlite` parameters (`?1`) cannot be used to dynamically insert column names or table names in SQL queries, which creates a pattern of manually interpolating identifiers with `format!`.
**Prevention:** Never use `format!` to interpolate variables directly into SQL statements without validation. Use a strict `match` block allowlist when dynamically selecting column or table names to ensure they represent valid, hardcoded identifiers.
