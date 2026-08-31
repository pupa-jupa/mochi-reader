use url::{Url, form_urlencoded};

use crate::{
    cache::CachedImage,
    database::source_repository::StoredSource,
    domain::error::{AppError, AppResult},
    sources::{
        adapter::{
            parse_html_chapters, parse_html_pages, parse_html_search, parse_manifest_chapters,
            parse_manifest_pages, parse_manifest_search,
        },
        http_client::{ExpectedContent, SourceHttpClient},
        http_policy::{HttpPolicy, resolve_image_url},
        model::{AdapterKind, RemoteChapter, RemotePage, RemoteSearchPage, ValidatedSource},
    },
};

const MAX_CATALOG_BYTES: usize = 4 * 1024 * 1024;
const MAX_HTML_BYTES: usize = 16 * 1024 * 1024;
const MAX_IMAGE_BYTES: usize = 32 * 1024 * 1024;

pub fn ensure_download_allowed(stored: &StoredSource) -> AppResult<()> {
    if !stored.source.enabled {
        return Err(validation("Источник выключен."));
    }
    if !stored.source.capabilities.download {
        return Err(validation(
            "Этот источник не разрешает сохранять главы для офлайн-чтения.",
        ));
    }
    Ok(())
}

pub async fn search_source(
    stored: StoredSource,
    query: &str,
    page: u32,
) -> AppResult<RemoteSearchPage> {
    if !stored.source.enabled {
        return Err(validation("Источник выключен."));
    }
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 200 {
        return Err(validation(
            "Поисковый запрос должен содержать от 1 до 200 символов.",
        ));
    }
    if !(1..=1_000).contains(&page) {
        return Err(validation(
            "Номер страницы поиска вне допустимого диапазона.",
        ));
    }
    let validated = validate_stored(stored)?;
    let policy = HttpPolicy::for_source(&validated.base_url)?;
    let template = match validated.adapter_kind {
        AdapterKind::Manifest => validated
            .config
            .pointer("/endpoints/search")
            .and_then(serde_json::Value::as_str),
        AdapterKind::GenericHtml => validated
            .config
            .get("searchPath")
            .and_then(serde_json::Value::as_str),
    }
    .ok_or_else(|| validation("В конфигурации источника отсутствует search endpoint."))?;
    let encoded_query = form_urlencoded::byte_serialize(query.as_bytes()).collect::<String>();
    let path = template
        .replace("{query}", &encoded_query)
        .replace("{page}", &page.to_string());
    let url = policy.resolve(&path)?;
    let client = SourceHttpClient::new(policy).await?;
    let expected = match validated.adapter_kind {
        AdapterKind::Manifest => ExpectedContent::Json,
        AdapterKind::GenericHtml => ExpectedContent::Html,
    };
    let (bytes, _) = client.get(&url, expected, MAX_CATALOG_BYTES).await?;
    let text = std::str::from_utf8(&bytes)
        .map_err(|_| validation("Ответ источника должен быть в UTF-8."))?;
    match validated.adapter_kind {
        AdapterKind::Manifest => parse_manifest_search(&validated, text),
        AdapterKind::GenericHtml => parse_html_search(&validated, text),
    }
}

pub async fn load_chapters(
    stored: StoredSource,
    remote_id: &str,
    manga_url: &str,
) -> AppResult<Vec<RemoteChapter>> {
    let validated = validate_stored(stored)?;
    validate_remote_argument(remote_id, "Идентификатор произведения")?;
    let policy = HttpPolicy::for_source(&validated.base_url)?;
    let (url, expected, limit) = match validated.adapter_kind {
        AdapterKind::Manifest => (
            manifest_endpoint(&validated, "chapters", remote_id, &policy)?,
            ExpectedContent::Json,
            MAX_CATALOG_BYTES,
        ),
        AdapterKind::GenericHtml => (
            source_url(&policy, manga_url)?,
            ExpectedContent::Html,
            MAX_HTML_BYTES,
        ),
    };
    let client = SourceHttpClient::new(policy).await?;
    let (bytes, _) = client.get(&url, expected, limit).await?;
    let text = utf8(&bytes)?;
    match validated.adapter_kind {
        AdapterKind::Manifest => parse_manifest_chapters(&validated, text),
        AdapterKind::GenericHtml => parse_html_chapters(&validated, text),
    }
}

pub async fn load_pages(
    stored: StoredSource,
    chapter_id: &str,
    chapter_url: &str,
) -> AppResult<Vec<RemotePage>> {
    let validated = validate_stored(stored)?;
    validate_remote_argument(chapter_id, "Идентификатор главы")?;
    let policy = HttpPolicy::for_source(&validated.base_url)?;
    let (url, expected, limit) = match validated.adapter_kind {
        AdapterKind::Manifest => (
            manifest_endpoint(&validated, "pages", chapter_id, &policy)?,
            ExpectedContent::Json,
            MAX_CATALOG_BYTES,
        ),
        AdapterKind::GenericHtml => (
            source_url(&policy, chapter_url)?,
            ExpectedContent::Html,
            MAX_HTML_BYTES,
        ),
    };
    let client = SourceHttpClient::new(policy).await?;
    let (bytes, _) = client.get(&url, expected, limit).await?;
    let text = utf8(&bytes)?;
    match validated.adapter_kind {
        AdapterKind::Manifest => parse_manifest_pages(&validated, text),
        AdapterKind::GenericHtml => parse_html_pages(&validated, text),
    }
}

pub async fn load_page_image(
    stored: StoredSource,
    page_url: &str,
    index: usize,
) -> AppResult<CachedImage> {
    let validated = validate_stored(stored)?;
    if index > 2_000 {
        return Err(validation("Номер страницы вне допустимого диапазона."));
    }
    let url = resolve_image_url(&validated, page_url)?;
    let policy = HttpPolicy::for_source(&url.origin().ascii_serialization())?;
    let client = SourceHttpClient::new(policy).await?;
    let (bytes, _) = client
        .get(&url, ExpectedContent::Image, MAX_IMAGE_BYTES)
        .await?;
    let media_type = infer::get(&bytes)
        .map(|kind| kind.mime_type())
        .filter(|mime| {
            matches!(
                *mime,
                "image/jpeg" | "image/png" | "image/webp" | "image/avif" | "image/gif"
            )
        })
        .ok_or_else(|| validation("Источник вернул неподдерживаемый формат изображения."))?;
    Ok(CachedImage {
        bytes,
        media_type: media_type.to_string(),
    })
}

fn validate_stored(stored: StoredSource) -> AppResult<ValidatedSource> {
    if !stored.source.enabled {
        return Err(validation("Источник выключен."));
    }
    Ok(ValidatedSource {
        name: stored.source.name,
        base_url: stored.source.base_url,
        adapter_kind: stored.source.adapter_kind,
        config: stored.config,
        capabilities: stored.source.capabilities,
    })
}

fn manifest_endpoint(
    source: &ValidatedSource,
    endpoint: &str,
    remote_id: &str,
    policy: &HttpPolicy,
) -> AppResult<Url> {
    let template = source
        .config
        .pointer(&format!("/endpoints/{endpoint}"))
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| validation("В manifest отсутствует нужный endpoint."))?;
    let encoded_id = form_urlencoded::byte_serialize(remote_id.as_bytes()).collect::<String>();
    policy.resolve(&template.replace("{id}", &encoded_id))
}

fn source_url(policy: &HttpPolicy, value: &str) -> AppResult<Url> {
    if value.trim().is_empty() || value.len() > 4_096 {
        return Err(validation("Источник передал некорректный URL."));
    }
    policy.resolve(value)
}

fn validate_remote_argument(value: &str, name: &str) -> AppResult<()> {
    if value.trim().is_empty() || value.len() > 2_048 {
        return Err(validation(&format!("{name} имеет неверный формат.")));
    }
    Ok(())
}

fn utf8(bytes: &[u8]) -> AppResult<&str> {
    std::str::from_utf8(bytes).map_err(|_| validation("Ответ источника должен быть в UTF-8."))
}

fn validation(message: &str) -> AppError {
    AppError::Validation {
        message: message.to_string(),
    }
}
