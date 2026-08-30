use serde::Serialize;
use thiserror::Error;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("database operation failed: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("file operation failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("{entity} was not found")]
    NotFound { entity: &'static str },
    #[error("{message}")]
    Validation { message: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppErrorPayload {
    pub code: &'static str,
    pub user_message: String,
    pub detail: String,
    pub recoverable: bool,
}

impl From<&AppError> for AppErrorPayload {
    fn from(error: &AppError) -> Self {
        let (code, user_message, recoverable) = match error {
            AppError::NotFound { .. } => (
                "not_found",
                "Не удалось найти запрошенный объект.".to_string(),
                true,
            ),
            AppError::Validation { message } => ("validation", message.clone(), true),
            AppError::Io(_) => ("file_error", "Не удалось прочитать файл.".to_string(), true),
            AppError::Database(_) => (
                "database_error",
                "Не удалось сохранить изменения.".to_string(),
                true,
            ),
        };

        Self {
            code,
            user_message,
            detail: error.to_string(),
            recoverable,
        }
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        AppErrorPayload::from(self).serialize(serializer)
    }
}
