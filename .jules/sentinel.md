## 2024-05-31 - SQL Injection Risk via format! with rusqlite
**Vulnerability:** A helper function (`query_one`) constructed SQL queries dynamically using the `format!` macro for column names (`WHERE {column} = ?1`) before passing the string to `rusqlite`.
**Learning:** `rusqlite` parameters prevent SQL injection for *values*, but not for structural parts of the query like identifiers (table or column names). Passing dynamic identifier strings directly into queries creates a risk of SQL injection, even if the caller intends them to be safe.
**Prevention:** Never use `format!` to insert dynamic identifiers into SQL queries. If dynamic column or table names are required, validate them against a strict `match` statement allowlist before formatting them into the query.
