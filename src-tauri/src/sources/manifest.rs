use serde::{Deserialize, Serialize};
use url::Url;

use crate::{
    domain::error::{AppError, AppResult},
    sources::{
        http_policy::{HttpPolicy, normalize_image_origins},
        model::{AdapterKind, SourceCapabilities, ValidatedSource},
    },
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManifestDefinition {
    #[serde(default, rename = "$schema", skip_serializing_if = "Option::is_none")]
    json_schema: Option<String>,
    schema_version: u32,
    #[serde(default)]
    id: Option<String>,
    name: String,
    #[serde(default)]
    kind: Option<ManifestKind>,
    #[serde(default, alias = "imageOrigins")]
    allowed_domains: Vec<String>,
    #[serde(default)]
    base_url: Option<String>,
    endpoints: ManifestEndpoints,
    #[serde(default)]
    pagination: Option<ManifestPagination>,
    #[serde(default)]
    mappings: Option<ManifestMappings>,
    #[serde(default)]
    formats: Vec<ManifestFormat>,
    #[serde(default)]
    capabilities: ManifestCapabilities,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum ManifestKind {
    Manga,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum ManifestFormat {
    RemoteManga,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManifestEndpoints {
    search: String,
    #[serde(alias = "manga")]
    details: String,
    chapters: String,
    pages: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManifestPagination {
    kind: PaginationKind,
    start: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum PaginationKind {
    Page,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManifestMappings {
    search: SearchMappings,
    chapters: ChapterMappings,
    pages: PageMappings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SearchMappings {
    items: String,
    id: String,
    title: String,
    url: String,
    #[serde(default)]
    cover_url: Option<String>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    has_next_page: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ChapterMappings {
    items: String,
    id: String,
    title: String,
    url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PageMappings {
    items: String,
    url: String,
    #[serde(default)]
    label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManifestCapabilities {
    #[serde(default = "default_true")]
    search: bool,
    #[serde(default)]
    download: bool,
}

impl Default for ManifestCapabilities {
    fn default() -> Self {
        Self {
            search: true,
            download: false,
        }
    }
}

pub fn validate_manifest(json: &str, requested_base: &Url) -> AppResult<ValidatedSource> {
    if json.len() > 1024 * 1024 {
        return Err(validation("Manifest источника больше 1 МБ."));
    }
    let mut manifest: ManifestDefinition = serde_json::from_str(json)
        .map_err(|error| validation(&format!("Manifest имеет неверную структуру: {error}")))?;
    if manifest.schema_version != 1 {
        return Err(validation("Эта версия manifest пока не поддерживается."));
    }
    validate_name(&manifest.name)?;
    normalize_image_origins(&mut manifest.allowed_domains)?;
    let requested_policy = HttpPolicy::for_source(requested_base.as_str())?;
    let policy = if let Some(base_url) = manifest.base_url.as_deref() {
        let declared = HttpPolicy::for_source(base_url)?;
        if declared.base_url().origin() != requested_policy.base_url().origin() {
            return Err(validation(
                "baseUrl manifest должен совпадать с origin опубликованного manifest.",
            ));
        }
        declared
    } else {
        requested_policy
    };
    validate_contract(&manifest)?;
    validate_template(&policy, &manifest.endpoints.search, &["query", "page"])?;
    validate_template(&policy, &manifest.endpoints.details, &["id"])?;
    validate_template(&policy, &manifest.endpoints.chapters, &["id"])?;
    validate_template(&policy, &manifest.endpoints.pages, &["id"])?;
    let config = serde_json::to_value(&manifest)
        .map_err(|_| validation("Не удалось нормализовать manifest."))?;
    Ok(ValidatedSource {
        name: manifest.name.trim().to_string(),
        base_url: policy.base_url().as_str().to_string(),
        adapter_kind: AdapterKind::Manifest,
        config,
        capabilities: SourceCapabilities {
            search: manifest.capabilities.search,
            download: manifest.capabilities.download,
        },
    })
}

pub fn validate_manifest_document(json: &str) -> AppResult<ValidatedSource> {
    let document: serde_json::Value = serde_json::from_str(json)
        .map_err(|error| validation(&format!("Manifest имеет неверный JSON: {error}")))?;
    let base_url = document
        .get("baseUrl")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| validation("В Mochi Source Manifest v1 отсутствует baseUrl."))?;
    let base = Url::parse(base_url)
        .map_err(|_| validation("В Mochi Source Manifest v1 указан неверный baseUrl."))?;
    validate_manifest(json, &base)
}

fn validate_contract(manifest: &ManifestDefinition) -> AppResult<()> {
    let uses_v1_contract = manifest.id.is_some()
        || manifest.kind.is_some()
        || manifest.base_url.is_some()
        || manifest.pagination.is_some()
        || manifest.mappings.is_some()
        || !manifest.formats.is_empty();
    if !uses_v1_contract {
        return Ok(());
    }
    let id = manifest
        .id
        .as_deref()
        .ok_or_else(|| validation("В Mochi Source Manifest v1 отсутствует id."))?;
    if !(3..=100).contains(&id.len())
        || !id.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
    {
        return Err(validation(
            "id manifest должен содержать 3–100 символов: a-z, A-Z, 0-9, точку, _ или -.",
        ));
    }
    if manifest.kind.is_none() || manifest.base_url.is_none() {
        return Err(validation(
            "В Mochi Source Manifest v1 обязательны kind и baseUrl.",
        ));
    }
    let pagination = manifest
        .pagination
        .as_ref()
        .ok_or_else(|| validation("В Mochi Source Manifest v1 отсутствует pagination."))?;
    if pagination.start != 1 {
        return Err(validation(
            "Mochi Source Manifest v1 использует pagination.start = 1.",
        ));
    }
    let mappings = manifest
        .mappings
        .as_ref()
        .ok_or_else(|| validation("В Mochi Source Manifest v1 отсутствует mappings."))?;
    for path in [
        &mappings.search.items,
        &mappings.search.id,
        &mappings.search.title,
        &mappings.search.url,
        &mappings.chapters.items,
        &mappings.chapters.id,
        &mappings.chapters.title,
        &mappings.chapters.url,
        &mappings.pages.items,
        &mappings.pages.url,
    ] {
        validate_mapping_path(path)?;
    }
    for path in [
        mappings.search.cover_url.as_deref(),
        mappings.search.summary.as_deref(),
        mappings.search.has_next_page.as_deref(),
        mappings.pages.label.as_deref(),
    ]
    .into_iter()
    .flatten()
    {
        validate_mapping_path(path)?;
    }
    if manifest.formats.is_empty()
        || manifest
            .formats
            .iter()
            .any(|format| *format != ManifestFormat::RemoteManga)
    {
        return Err(validation(
            "Mochi Source Manifest v1 должен объявить formats: [\"remote_manga\"].",
        ));
    }
    if !manifest.capabilities.search {
        return Err(validation(
            "Mochi Source Manifest v1 должен включать capability search.",
        ));
    }
    Ok(())
}

fn validate_mapping_path(path: &str) -> AppResult<()> {
    if path == "$" {
        return Ok(());
    }
    let Some(rest) = path.strip_prefix("$.") else {
        return Err(validation(
            "Mapping должен быть простым безопасным JSON path вида $.field.nestedField.",
        ));
    };
    if rest.is_empty()
        || rest.split('.').any(|segment| {
            segment.is_empty()
                || segment.len() > 100
                || !segment.chars().all(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '_' | '-')
                })
        })
    {
        return Err(validation(
            "Mapping должен быть простым безопасным JSON path вида $.field.nestedField.",
        ));
    }
    Ok(())
}

fn default_true() -> bool {
    true
}

fn validate_template(policy: &HttpPolicy, template: &str, placeholders: &[&str]) -> AppResult<()> {
    if template.is_empty() || template.len() > 2_048 {
        return Err(validation("Endpoint template пустой или слишком длинный."));
    }
    let mut resolved = template.to_string();
    for placeholder in placeholders {
        resolved = resolved.replace(&format!("{{{placeholder}}}"), "value");
    }
    if resolved.contains('{') || resolved.contains('}') {
        return Err(validation(
            "Endpoint template содержит неизвестный placeholder.",
        ));
    }
    policy.resolve(&resolved)?;
    Ok(())
}

fn validate_name(name: &str) -> AppResult<()> {
    let length = name.trim().chars().count();
    if !(1..=120).contains(&length) {
        return Err(validation(
            "Название источника должно содержать от 1 до 120 символов.",
        ));
    }
    Ok(())
}

fn validation(message: &str) -> AppError {
    AppError::Validation {
        message: message.to_string(),
    }
}
