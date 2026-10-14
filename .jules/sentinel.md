## 2025-02-27 - SQL Injection Risk with Dynamic Interpolation in rusqlite

**Vulnerability:** A `format!` macro was used in `src-tauri/src/database/progress_repository.rs` to dynamically insert a column name (`content_identity` or `work_id`) directly into a raw SQL query. While the input in this specific usage might have been constrained by internal logic, it is a severe anti-pattern that can lead to SQL Injection.

**Learning:** `rusqlite` parameterized queries (like `?1`) only work for values, not for identifiers like table or column names. Developers sometimes use `format!` out of convenience to reuse query structures, which bypasses `rusqlite`'s safety mechanisms for user inputs.

**Prevention:** Never use `format!` or string concatenation for dynamic identifiers (like column or table names) in SQL queries with `rusqlite`. Instead, explicitly allowlist the allowed identifiers using a `match` statement, returning an error for invalid inputs. This completely mitigates injection risks by hardcoding the acceptable variations of the SQL string.
