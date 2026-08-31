use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AdapterKind {
    Manifest,
    GenericHtml,
    Mangadex,
}

impl AdapterKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Manifest => "manifest",
            Self::GenericHtml => "generic_html",
            Self::Mangadex => "mangadex",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceCapabilities {
    pub search: bool,
    pub download: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValidatedSource {
    pub name: String,
    pub base_url: String,
    pub adapter_kind: AdapterKind,
    pub config: Value,
    pub capabilities: SourceCapabilities,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceConfig {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub adapter_kind: AdapterKind,
    pub enabled: bool,
    pub capabilities: SourceCapabilities,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteMangaSummary {
    pub remote_id: String,
    pub title: String,
    pub url: String,
    pub cover_url: Option<String>,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSearchPage {
    pub items: Vec<RemoteMangaSummary>,
    pub has_next_page: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteChapter {
    pub remote_id: String,
    pub title: String,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePage {
    pub index: u32,
    pub label: String,
    pub url: String,
}
