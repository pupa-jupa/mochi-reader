use crate::{
    domain::error::{AppError, AppResult},
    sources::{
        http_client::{ExpectedContent, SourceHttpClient},
        http_policy::HttpPolicy,
        manifest::validate_manifest,
        model::ValidatedSource,
    },
};

const MAX_MANIFEST_BYTES: usize = 1024 * 1024;

pub async fn probe_manifest(raw_base_url: &str) -> AppResult<ValidatedSource> {
    let policy = HttpPolicy::for_source(raw_base_url)?;
    let manifest_url = policy.resolve("/.well-known/mochi-reader.json")?;
    let client = SourceHttpClient::new(policy.clone()).await?;
    let (bytes, _) = client
        .get(&manifest_url, ExpectedContent::Json, MAX_MANIFEST_BYTES)
        .await
        .map_err(|error| match error {
            AppError::Validation { message } if message.contains("HTTP 404") => validation(
                "На сайте нет Mochi Reader manifest. Импортируй декларативный JSON-профиль для этого источника.",
            ),
            other => other,
        })?;
    let json = std::str::from_utf8(&bytes)
        .map_err(|_| validation("Manifest источника должен быть в UTF-8."))?;
    validate_manifest(json, policy.base_url())
}

fn validation(message: &str) -> AppError {
    AppError::Validation {
        message: message.to_string(),
    }
}
