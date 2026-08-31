use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReaderMode {
    Book,
    Pdf,
    Manga,
}

impl ReaderMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Book => "book",
            Self::Pdf => "pdf",
            Self::Manga => "manga",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum ReaderLocator {
    Book {
        chapter_id: Option<String>,
        char_offset: Option<u64>,
    },
    Pdf {
        page_index: u32,
    },
    Manga {
        chapter_id: Option<String>,
        page_index: u32,
    },
}

impl ReaderLocator {
    pub fn mode(&self) -> ReaderMode {
        match self {
            Self::Book { .. } => ReaderMode::Book,
            Self::Pdf { .. } => ReaderMode::Pdf,
            Self::Manga { .. } => ReaderMode::Manga,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressUpdate {
    pub work_id: String,
    pub locator: ReaderLocator,
    pub percent: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingProgress {
    pub content_identity: String,
    pub work_id: String,
    pub locator: ReaderLocator,
    pub percent: f64,
    pub reader_mode: ReaderMode,
    pub updated_at: String,
}
