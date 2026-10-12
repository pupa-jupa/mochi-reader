## 2024-03-24 - Fix SQL injection via dynamic identifiers in rusqlite
**Vulnerability:** Use of `format!` to construct SQL queries with dynamic column names in `src-tauri/src/database/progress_repository.rs` (`query_one` method). This allows for SQL injection if the `column` parameter is controlled by an attacker.
**Learning:** `rusqlite` parameters (`?1`) cannot be used for structural SQL elements like table or column names, tempting developers to use `format!`. This creates an injection risk.
**Prevention:** When dynamic column or table names are required, use a strict `match` statement allowlist to map identifiers to complete query strings or validated substrings, rather than blindly formatting them into the query.
