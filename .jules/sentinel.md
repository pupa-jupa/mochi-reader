## 2024-03-24 - SQL Injection in Backend Repository
**Vulnerability:** SQL injection vulnerability via `format!` dynamically constructing queries in `src-tauri/src/database/progress_repository.rs`.
**Learning:** Hardcoding or strictly validating column names in SQL construction prevents SQL injection, whereas directly trusting parameter values (`column: &str`) allows injection risks.
**Prevention:** Avoid dynamically constructing column names or queries using `format!` macro in Rust/Tauri. Use match statements against strict allowlists instead.
