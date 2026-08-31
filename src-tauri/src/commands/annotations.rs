use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;

use crate::{
    app_state::AppState,
    database::annotation_repository::{AnnotationQuery, AnnotationRepository},
    domain::{
        annotation::{ReaderAnnotation, ReaderAnnotationDraft, ReaderAnnotationUpdate},
        error::{AppError, AppResult},
    },
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnnotationExportFormat {
    Markdown,
    Json,
}

#[tauri::command]
pub fn list_annotations(
    state: State<'_, AppState>,
    query: AnnotationQuery,
) -> AppResult<Vec<ReaderAnnotation>> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    AnnotationRepository::new(&connection).list(&query)
}

#[tauri::command]
pub fn create_annotation(
    state: State<'_, AppState>,
    draft: ReaderAnnotationDraft,
) -> AppResult<ReaderAnnotation> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    AnnotationRepository::new(&connection).create(&draft)
}

#[tauri::command]
pub fn update_annotation(
    state: State<'_, AppState>,
    id: String,
    update: ReaderAnnotationUpdate,
) -> AppResult<ReaderAnnotation> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    AnnotationRepository::new(&connection).update(&id, &update)
}

#[tauri::command]
pub fn delete_annotation(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    AnnotationRepository::new(&connection).delete(&id)
}

#[tauri::command]
pub fn copy_text(app: AppHandle, text: String) -> AppResult<()> {
    if text.chars().count() > 1_000_000 {
        return Err(AppError::Validation {
            message: "Слишком много текста для копирования.".to_string(),
        });
    }
    app.clipboard()
        .write_text(text)
        .map_err(|_| AppError::Validation {
            message: "Не удалось скопировать текст.".to_string(),
        })
}

#[tauri::command]
pub async fn export_annotations(
    app: AppHandle,
    state: State<'_, AppState>,
    query: AnnotationQuery,
    format: AnnotationExportFormat,
) -> AppResult<bool> {
    let annotations = {
        let connection = state.database.lock().map_err(|_| unavailable())?;
        AnnotationRepository::new(&connection).list(&AnnotationQuery {
            limit: Some(1_000),
            ..query
        })?
    };
    if annotations.is_empty() {
        return Err(AppError::Validation {
            message: "Нет заметок для экспорта.".to_string(),
        });
    }

    let (content, extension, filter_name) = match format {
        AnnotationExportFormat::Markdown => {
            (annotations_to_markdown(&annotations), "md", "Markdown")
        }
        AnnotationExportFormat::Json => (
            serde_json::to_string_pretty(&annotations).map_err(|_| AppError::Validation {
                message: "Не удалось подготовить JSON с заметками.".to_string(),
            })?,
            "json",
            "JSON",
        ),
    };
    let destination = app
        .dialog()
        .file()
        .set_file_name(format!("mochi-reader-notes.{extension}"))
        .add_filter(filter_name, &[extension])
        .blocking_save_file();
    let Some(destination) = destination else {
        return Ok(false);
    };
    let path = destination.into_path().map_err(|_| AppError::Validation {
        message: "Не удалось выбрать файл для экспорта.".to_string(),
    })?;
    std::fs::write(path, content).map_err(|_| AppError::Validation {
        message: "Не удалось сохранить экспорт заметок.".to_string(),
    })?;
    Ok(true)
}

pub fn annotations_to_markdown(annotations: &[ReaderAnnotation]) -> String {
    let mut markdown = String::from("# Заметки Mochi Reader\n\n");
    let mut current_work = "";
    for annotation in annotations {
        if annotation.work_title != current_work {
            current_work = &annotation.work_title;
            markdown.push_str("## ");
            markdown.push_str(&annotation.work_title.replace('\n', " "));
            markdown.push_str("\n\n");
        }
        let label = match annotation.kind {
            crate::domain::annotation::AnnotationKind::Highlight => "Подсветка",
            crate::domain::annotation::AnnotationKind::Note => "Заметка",
            crate::domain::annotation::AnnotationKind::Quote => "Цитата",
        };
        markdown.push_str("### ");
        markdown.push_str(label);
        markdown.push_str(" · ");
        markdown.push_str(&annotation.created_at);
        markdown.push_str("\n\n");
        if !annotation.quote.is_empty() {
            for line in annotation.quote.lines() {
                markdown.push_str("> ");
                markdown.push_str(line);
                markdown.push('\n');
            }
            markdown.push('\n');
        }
        if let Some(note) = &annotation.note {
            markdown.push_str(note);
            markdown.push_str("\n\n");
        }
    }
    markdown
}

fn unavailable() -> AppError {
    AppError::Validation {
        message: "Библиотека временно недоступна.".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{
        annotation::{
            AnnotationKind, AnnotationLocator, HighlightColor, ReaderAnnotation, TextQuoteSelector,
        },
        work::WorkKind,
    };

    #[test]
    fn markdown_export_keeps_quotes_and_notes_readable() {
        let markdown = annotations_to_markdown(&[ReaderAnnotation {
            id: "annotation-1".to_string(),
            content_identity: "local:work-1".to_string(),
            work_id: "work-1".to_string(),
            work_title: "Quiet Moon".to_string(),
            work_kind: WorkKind::Book,
            cover_path: None,
            kind: AnnotationKind::Note,
            quote: "The moon was near.".to_string(),
            note: Some("Return here.".to_string()),
            locator: AnnotationLocator::Book {
                chapter_id: "chapter-1".to_string(),
                start_offset: 10,
                end_offset: 28,
                quote: TextQuoteSelector {
                    exact: "The moon was near.".to_string(),
                    prefix: String::new(),
                    suffix: String::new(),
                },
                dom_range: None,
            },
            color: Some(HighlightColor::Lavender),
            created_at: "2026-09-01T00:00:00Z".to_string(),
            updated_at: "2026-09-01T00:00:00Z".to_string(),
        }]);

        assert!(markdown.contains("## Quiet Moon"));
        assert!(markdown.contains("> The moon was near."));
        assert!(markdown.contains("Return here."));
    }
}
