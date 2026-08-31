use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkKind {
    Book,
    Manga,
}

impl WorkKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Book => "book",
            Self::Manga => "manga",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkStatus {
    Reading,
    Planned,
    Completed,
    OnHold,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkOrigin {
    Local,
    Remote,
}

impl WorkOrigin {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::Remote => "remote",
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkSort {
    #[default]
    AddedDesc,
    TitleAsc,
    LastOpenedDesc,
    ProgressDesc,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkListQuery {
    pub search: String,
    pub kinds: Vec<WorkKind>,
    pub statuses: Vec<WorkStatus>,
    pub favorite: Option<bool>,
    pub sort: WorkSort,
    pub offset: u32,
    pub limit: u32,
}

impl Default for WorkListQuery {
    fn default() -> Self {
        Self {
            search: String::new(),
            kinds: Vec::new(),
            statuses: Vec::new(),
            favorite: None,
            sort: WorkSort::default(),
            offset: 0,
            limit: 40,
        }
    }
}

impl WorkStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Reading => "reading",
            Self::Planned => "planned",
            Self::Completed => "completed",
            Self::OnHold => "on_hold",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkFormat {
    Epub,
    Pdf,
    Fb2,
    Txt,
    Html,
    Markdown,
    Cbz,
    Cbr,
    ZipImages,
    ImageFolder,
    Image,
    RemoteManga,
}

impl WorkFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Epub => "epub",
            Self::Pdf => "pdf",
            Self::Fb2 => "fb2",
            Self::Txt => "txt",
            Self::Html => "html",
            Self::Markdown => "markdown",
            Self::Cbz => "cbz",
            Self::Cbr => "cbr",
            Self::ZipImages => "zip_images",
            Self::ImageFolder => "image_folder",
            Self::Image => "image",
            Self::RemoteManga => "remote_manga",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteWorkDraft {
    pub source_id: String,
    pub remote_id: String,
    pub title: String,
    pub description: Option<String>,
    pub remote_url: String,
    pub cover_url: Option<String>,
    pub chapter_count: u32,
}

#[derive(Debug, Clone)]
pub struct NewWork {
    pub title: String,
    pub author: Option<String>,
    pub kind: WorkKind,
    pub format: WorkFormat,
    pub source_path: PathBuf,
    pub file_size: u64,
    pub fingerprint: String,
    pub cover_path: Option<PathBuf>,
    pub page_count: Option<u32>,
    pub chapter_count: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkSummary {
    pub id: String,
    pub title: String,
    pub author: Option<String>,
    pub kind: WorkKind,
    pub format: WorkFormat,
    pub cover_path: Option<String>,
    pub status: WorkStatus,
    pub favorite: bool,
    pub progress_percent: f64,
    pub missing_file: bool,
    pub added_at: String,
    pub last_opened_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkDetails {
    #[serde(flatten)]
    pub summary: WorkSummary,
    pub original_title: Option<String>,
    pub description: Option<String>,
    pub source_path: String,
    pub file_size: u64,
    pub page_count: Option<u32>,
    pub chapter_count: u32,
    pub origin_kind: WorkOrigin,
    pub source_id: Option<String>,
    pub remote_id: Option<String>,
    pub remote_url: Option<String>,
    pub remote_cover_url: Option<String>,
}

impl std::ops::Deref for WorkDetails {
    type Target = WorkSummary;

    fn deref(&self) -> &Self::Target {
        &self.summary
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkPage {
    pub items: Vec<WorkSummary>,
    pub total: u64,
}
