## 2026-10-26 - Prevent SQL Injection via format! macro
**Vulnerability:** Unsanitized dynamic column names were inserted into SQL queries using the `format!` macro in `ProgressRepository::query_one`.
**Learning:** Even internal query helpers are vulnerable to SQL injection when using string formatting (`format!`) instead of strict validation or parameterized inputs, because `rusqlite` parameterization does not work for table or column identifiers.
**Prevention:** Always use a strict `match` statement allowlist to validate dynamic identifiers like column names before formatting them into a SQL string. Do not trust dynamically passed strings for identifiers.
