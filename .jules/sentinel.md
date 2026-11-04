## 2024-05-15 - SQL Injection in Dynamic Column Names
**Vulnerability:** Found a risk of SQL Injection in `ProgressRepository::query_one` where a dynamic column name parameter was formatted directly into the query string using `format!`.
**Learning:** `rusqlite` parameterized queries (like `?1`) only work for values, not identifiers (like column or table names). Dynamic identifiers interpolated into strings using `format!` create a potential SQL injection vector if not validated.
**Prevention:** Always use a strict `match` allowlist to validate dynamic table or column names before string formatting. Avoid dynamic column queries altogether if possible.
