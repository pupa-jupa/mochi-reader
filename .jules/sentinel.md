## 2023-10-21 - [Prevent SQL Injection via Dynamic Column Names]
**Vulnerability:** SQL injection vulnerability in `ProgressRepository::query_one` caused by directly injecting the `column` parameter into a SQL query using `format!()`.
**Learning:** In Tauri Rust backend using `rusqlite`, dynamically inserting column names into SQL strings via `format!` bypasses parameterized query protections, allowing malicious input to alter the SQL structure.
**Prevention:** Avoid `format!` for dynamic identifiers. Use a strict `match` statement allowlist to validate all dynamic column names before incorporating them into SQL strings.
