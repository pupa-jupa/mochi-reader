## 2024-05-18 - [SQL Injection Prevention in Dynamic Queries]
**Vulnerability:** A query in `ProgressRepository::query_one` used string interpolation (`format!("... WHERE {column} = ...")`) to insert a column name dynamically. Because table and column names cannot be passed as bound parameters in rusqlite, this created an SQL Injection risk if the input was ever uncontrolled.
**Learning:** String interpolation for column names should be avoided unless strictly necessary, and if used, the input MUST be validated against a strict allowlist.
**Prevention:** Use an allowlist pattern (e.g. checking `if column != "work_id" && column != "content_identity"`) before using `format!` to construct queries.
