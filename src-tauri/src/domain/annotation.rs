use serde::{Deserialize, Serialize};

use super::reader::ReaderMode;
use super::work::WorkKind;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnnotationKind {
    Highlight,
    Note,
    Quote,
}

impl AnnotationKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Highlight => "highlight",
            Self::Note => "note",
            Self::Quote => "quote",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HighlightColor {
    Sakura,
    Peach,
    Lavender,
    Butter,
    Mint,
}

impl HighlightColor {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Sakura => "sakura",
            Self::Peach => "peach",
            Self::Lavender => "lavender",
            Self::Butter => "butter",
            Self::Mint => "mint",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextQuoteSelector {
    pub exact: String,
    pub prefix: String,
    pub suffix: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DomRangeSelector {
    pub start_path: Vec<u32>,
    pub start_node_offset: u32,
    pub end_path: Vec<u32>,
    pub end_node_offset: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfTextRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum AnnotationLocator {
    Book {
        chapter_id: String,
        start_offset: u64,
        end_offset: u64,
        quote: TextQuoteSelector,
        dom_range: Option<DomRangeSelector>,
    },
    Pdf {
        page_index: u32,
        quote: Option<TextQuoteSelector>,
        #[serde(default)]
        rects: Vec<PdfTextRect>,
    },
    Manga {
        chapter_id: Option<String>,
        page_index: u32,
    },
}

impl AnnotationLocator {
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
pub struct ReaderAnnotationDraft {
    pub work_id: String,
    pub kind: AnnotationKind,
    pub quote: String,
    pub note: Option<String>,
    pub locator: AnnotationLocator,
    pub color: Option<HighlightColor>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderAnnotationUpdate {
    pub note: Option<String>,
    pub color: Option<HighlightColor>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderAnnotation {
    pub id: String,
    pub content_identity: String,
    pub work_id: String,
    pub work_title: String,
    pub work_kind: WorkKind,
    pub cover_path: Option<String>,
    pub kind: AnnotationKind,
    pub quote: String,
    pub note: Option<String>,
    pub locator: AnnotationLocator,
    pub color: Option<HighlightColor>,
    pub created_at: String,
    pub updated_at: String,
}
