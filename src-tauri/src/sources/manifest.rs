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
    schema_version: u32,
    name: String,
    #[serde(default)]
    image_origins: Vec<String>,
    endpoints: ManifestEndpoints,
    #[serde(default)]
    capabilities: ManifestCapabilities,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManifestEndpoints {
    search: String,
    manga: String,
    chapters: String,
    pages: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManifestCapabilities {
    #[serde(default)]
    download: bool,
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
    normalize_image_origins(&mut manifest.image_origins)?;
    let policy = HttpPolicy::for_source(requested_base.as_str())?;
    validate_template(&policy, &manifest.endpoints.search, &["query", "page"])?;
    validate_template(&policy, &manifest.endpoints.manga, &["id"])?;
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
            search: true,
            download: manifest.capabilities.download,
        },
    })
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
