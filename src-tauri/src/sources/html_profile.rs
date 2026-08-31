use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    domain::error::{AppError, AppResult},
    sources::{
        http_policy::{HttpPolicy, normalize_image_origins},
        model::{AdapterKind, SourceCapabilities, ValidatedSource},
    },
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HtmlProfile {
    schema_version: u32,
    name: String,
    base_url: String,
    search_path: String,
    #[serde(default)]
    image_origins: Vec<String>,
    selectors: HtmlSelectors,
    #[serde(default)]
    allow_download: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HtmlSelectors {
    search_items: String,
    title: String,
    manga_url: String,
    #[serde(default)]
    cover: Option<String>,
    #[serde(default)]
    summary: Option<String>,
    chapter_items: String,
    #[serde(default)]
    chapter_title: Option<String>,
    chapter_url: String,
    page_images: String,
    #[serde(default)]
    next_page: Option<String>,
}

pub fn validate_html_profile(json: &str) -> AppResult<ValidatedSource> {
    if json.len() > 256 * 1024 {
        return Err(validation("JSON-профиль больше 256 КБ."));
    }
    let raw: Value = serde_json::from_str(json)
        .map_err(|error| validation(&format!("JSON-профиль не читается: {error}")))?;
    reject_active_content(&raw)?;
    let mut profile: HtmlProfile = serde_json::from_value(raw)
        .map_err(|error| validation(&format!("JSON-профиль имеет неверную структуру: {error}")))?;
    if profile.schema_version != 1 {
        return Err(validation(
            "Эта версия HTML-профиля пока не поддерживается.",
        ));
    }
    let name_length = profile.name.trim().chars().count();
    if !(1..=120).contains(&name_length) {
        return Err(validation(
            "Название источника должно содержать от 1 до 120 символов.",
        ));
    }
    let policy = HttpPolicy::for_source(&profile.base_url)?;
    normalize_image_origins(&mut profile.image_origins)?;
    validate_search_path(&policy, &profile.search_path)?;
    for selector in [
        &profile.selectors.search_items,
        &profile.selectors.title,
        &profile.selectors.manga_url,
        &profile.selectors.chapter_items,
        &profile.selectors.chapter_url,
        &profile.selectors.page_images,
    ] {
        validate_selector(selector)?;
    }
    for selector in [
        profile.selectors.cover.as_deref(),
        profile.selectors.summary.as_deref(),
        profile.selectors.chapter_title.as_deref(),
        profile.selectors.next_page.as_deref(),
    ]
    .into_iter()
    .flatten()
    {
        validate_selector(selector)?;
    }
    let config = serde_json::to_value(&profile)
        .map_err(|_| validation("Не удалось нормализовать JSON-профиль."))?;
    Ok(ValidatedSource {
        name: profile.name.trim().to_string(),
        base_url: policy.base_url().as_str().to_string(),
        adapter_kind: AdapterKind::GenericHtml,
        config,
        capabilities: SourceCapabilities {
            search: true,
            download: profile.allow_download,
        },
    })
}

fn validate_search_path(policy: &HttpPolicy, template: &str) -> AppResult<()> {
    let resolved = template.replace("{query}", "value").replace("{page}", "1");
    if resolved.contains('{') || resolved.contains('}') || !template.contains("{query}") {
        return Err(validation(
            "searchPath должен содержать {query} и только известные placeholders.",
        ));
    }
    policy.resolve(&resolved)?;
    Ok(())
}

fn validate_selector(selector: &str) -> AppResult<()> {
    let selector = selector.trim();
    if selector.is_empty() || selector.len() > 512 {
        return Err(validation("CSS selector пустой или слишком длинный."));
    }
    let lower = selector.to_ascii_lowercase();
    if lower.contains("javascript:") || lower.contains("<script") || lower.contains("expression(") {
        return Err(validation("JSON-профиль не может содержать JavaScript."));
    }
    Ok(())
}

fn reject_active_content(value: &Value) -> AppResult<()> {
    match value {
        Value::Object(values) => {
            for (key, value) in values {
                if key.to_ascii_lowercase().contains("script") {
                    return Err(validation("JSON-профиль не может содержать скрипты."));
                }
                reject_active_content(value)?;
            }
        }
        Value::Array(values) => {
            for value in values {
                reject_active_content(value)?;
            }
        }
        Value::String(value) => {
            let lower = value.to_ascii_lowercase();
            if lower.contains("javascript:") || lower.contains("<script") {
                return Err(validation("JSON-профиль не может содержать JavaScript."));
            }
        }
        _ => {}
    }
    Ok(())
}

fn validation(message: &str) -> AppError {
    AppError::Validation {
        message: message.to_string(),
    }
}
