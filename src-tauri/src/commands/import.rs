use std::{path::PathBuf, sync::Arc};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::{
    app_state::AppState,
    domain::error::{AppError, AppResult},
    import::job::{ImportBatchResult, ImportOptions, import_paths as run_import},
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPathsRequest {
    pub paths: Vec<String>,
    #[serde(default)]
    pub options: ImportOptions,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportProgress {
    completed: usize,
    total: usize,
    current_path: String,
}

#[tauri::command]
pub async fn import_paths(
    app: AppHandle,
    state: State<'_, AppState>,
    request: ImportPathsRequest,
) -> AppResult<ImportBatchResult> {
    let database = Arc::clone(&state.database);
    tauri::async_runtime::spawn_blocking(move || {
        let connection = database.lock().map_err(|_| AppError::Validation {
            message: "Библиотека временно недоступна.".to_string(),
        })?;
        let total = request.paths.len();
        let mut aggregate = ImportBatchResult {
            items: Vec::with_capacity(total),
            imported: 0,
            failed: 0,
        };

        for (index, raw_path) in request.paths.into_iter().enumerate() {
            let path = PathBuf::from(&raw_path);
            let mut item_result = run_import(&connection, &[path], &request.options);
            aggregate.imported = aggregate.imported.saturating_add(item_result.imported);
            aggregate.failed = aggregate.failed.saturating_add(item_result.failed);
            aggregate.items.append(&mut item_result.items);
            let _ = app.emit(
                "import://progress",
                ImportProgress {
                    completed: index + 1,
                    total,
                    current_path: raw_path,
                },
            );
        }

        Ok(aggregate)
    })
    .await
    .map_err(|error| AppError::Validation {
        message: format!("Не удалось завершить импорт: {error}"),
    })?
}
