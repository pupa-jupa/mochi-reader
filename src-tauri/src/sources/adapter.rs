use scraper::{ElementRef, Html, Selector};
use serde::Deserialize;

use crate::{
    domain::error::{AppError, AppResult},
    sources::{
        http_policy::{HttpPolicy, resolve_image_url},
        model::{
            AdapterKind, RemoteChapter, RemoteMangaSummary, RemotePage, RemoteSearchPage,
            ValidatedSource,
        },
    },
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManifestSearchResponse {
    items: Vec<ManifestSearchItem>,
    #[serde(default)]
    has_next_page: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManifestSearchItem {
    id: String,
    title: String,
    url: String,
    #[serde(default)]
    cover_url: Option<String>,
    #[serde(default)]
    summary: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManifestChaptersResponse {
    items: Vec<ManifestChapterItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManifestChapterItem {
    id: String,
    title: String,
    url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManifestPagesResponse {
    pages: Vec<ManifestPageItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManifestPageItem {
    url: String,
    #[serde(default)]
    label: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HtmlProfileConfig {
    selectors: HtmlSelectorConfig,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HtmlSelectorConfig {
    search_items: String,
    title: String,
    manga_url: String,
    #[serde(default)]
    cover: Option<String>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    next_page: Option<String>,
    chapter_items: String,
    #[serde(default)]
    chapter_title: Option<String>,
    chapter_url: String,
    page_images: String,
}

pub fn parse_manifest_search(source: &ValidatedSource, json: &str) -> AppResult<RemoteSearchPage> {
    if source.adapter_kind != AdapterKind::Manifest {
        return Err(validation("Источник не использует manifest adapter."));
    }
    if json.len() > 4 * 1024 * 1024 {
        return Err(validation("Ответ поиска больше 4 МБ."));
    }
    let response: ManifestSearchResponse = serde_json::from_str(json)
        .map_err(|error| validation(&format!("Источник вернул неверный JSON поиска: {error}")))?;
    let policy = HttpPolicy::for_source(&source.base_url)?;
    let mut items = Vec::with_capacity(response.items.len().min(200));
    for item in response.items.into_iter().take(200) {
        validate_remote_identity(&item.id, &item.title)?;
        let url = policy.resolve(&item.url)?.to_string();
        let cover_url = item
            .cover_url
            .as_deref()
            .map(|value| resolve_image_url(source, value).map(|url| url.to_string()))
            .transpose()?;
        items.push(RemoteMangaSummary {
            remote_id: item.id,
            title: normalize_text(&item.title),
            url,
            cover_url,
            summary: normalize_optional(item.summary.as_deref(), 4_000),
        });
    }
    Ok(RemoteSearchPage {
        items,
        has_next_page: response.has_next_page,
    })
}

pub fn parse_html_search(source: &ValidatedSource, html: &str) -> AppResult<RemoteSearchPage> {
    if source.adapter_kind != AdapterKind::GenericHtml {
        return Err(validation("Источник не использует HTML profile adapter."));
    }
    if html.len() > 4 * 1024 * 1024 {
        return Err(validation("HTML-ответ поиска больше 4 МБ."));
    }
    let config: HtmlProfileConfig = serde_json::from_value(source.config.clone())
        .map_err(|_| validation("Сохранённый HTML-профиль повреждён."))?;
    let item_selector = parse_selector(&config.selectors.search_items)?.selector;
    let document = Html::parse_document(html);
    let policy = HttpPolicy::for_source(&source.base_url)?;
    let mut items = Vec::new();
    for item in document.select(&item_selector).take(200) {
        let title = extract(item, &config.selectors.title)?;
        let remote_url = extract(item, &config.selectors.manga_url)?;
        if title.is_empty() || remote_url.is_empty() {
            continue;
        }
        let url = policy.resolve(&remote_url)?.to_string();
        let cover_url = config
            .selectors
            .cover
            .as_deref()
            .map(|selector| extract(item, selector))
            .transpose()?
            .filter(|value| !value.is_empty())
            .map(|value| resolve_image_url(source, &value).map(|url| url.to_string()))
            .transpose()?;
        let summary = config
            .selectors
            .summary
            .as_deref()
            .map(|selector| extract(item, selector))
            .transpose()?
            .and_then(|value| normalize_optional(Some(&value), 4_000));
        items.push(RemoteMangaSummary {
            remote_id: url.clone(),
            title: normalize_text(&title),
            url,
            cover_url,
            summary,
        });
    }
    let has_next_page = config
        .selectors
        .next_page
        .as_deref()
        .map(parse_selector)
        .transpose()?
        .is_some_and(|selector| document.select(&selector.selector).next().is_some());
    Ok(RemoteSearchPage {
        items,
        has_next_page,
    })
}

pub fn parse_manifest_chapters(
    source: &ValidatedSource,
    json: &str,
) -> AppResult<Vec<RemoteChapter>> {
    ensure_adapter(source, AdapterKind::Manifest)?;
    ensure_payload_size(json, 4 * 1024 * 1024, "Ответ со списком глав больше 4 МБ.")?;
    let response: ManifestChaptersResponse = serde_json::from_str(json)
        .map_err(|error| validation(&format!("Источник вернул неверный JSON глав: {error}")))?;
    let policy = HttpPolicy::for_source(&source.base_url)?;
    response
        .items
        .into_iter()
        .take(5_000)
        .map(|chapter| {
            validate_remote_identity(&chapter.id, &chapter.title)?;
            Ok(RemoteChapter {
                remote_id: chapter.id,
                title: normalize_text(&chapter.title),
                url: policy.resolve(&chapter.url)?.to_string(),
                attribution: None,
            })
        })
        .collect()
}

pub fn parse_manifest_pages(source: &ValidatedSource, json: &str) -> AppResult<Vec<RemotePage>> {
    ensure_adapter(source, AdapterKind::Manifest)?;
    ensure_payload_size(json, 4 * 1024 * 1024, "Ответ со страницами больше 4 МБ.")?;
    let response: ManifestPagesResponse = serde_json::from_str(json)
        .map_err(|error| validation(&format!("Источник вернул неверный JSON страниц: {error}")))?;
    response
        .pages
        .into_iter()
        .take(2_000)
        .enumerate()
        .map(|(index, page)| {
            let url = resolve_image_url(source, &page.url)?;
            let label = page
                .label
                .as_deref()
                .and_then(|value| normalize_optional(Some(value), 200))
                .unwrap_or_else(|| label_from_url(&url, index));
            Ok(RemotePage {
                index: index as u32,
                label,
                url: url.to_string(),
            })
        })
        .collect()
}

pub fn parse_html_chapters(source: &ValidatedSource, html: &str) -> AppResult<Vec<RemoteChapter>> {
    ensure_adapter(source, AdapterKind::GenericHtml)?;
    ensure_payload_size(
        html,
        8 * 1024 * 1024,
        "HTML-страница произведения больше 8 МБ.",
    )?;
    let config = html_config(source)?;
    let item_selector = parse_selector(&config.selectors.chapter_items)?.selector;
    let document = Html::parse_document(html);
    let policy = HttpPolicy::for_source(&source.base_url)?;
    let mut chapters = Vec::new();
    for (index, item) in document.select(&item_selector).take(5_000).enumerate() {
        let remote_url = extract(item, &config.selectors.chapter_url)?;
        if remote_url.is_empty() {
            continue;
        }
        let url = policy.resolve(&remote_url)?.to_string();
        let title = config
            .selectors
            .chapter_title
            .as_deref()
            .map(|selector| extract(item, selector))
            .transpose()?
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| format!("Глава {}", index + 1));
        chapters.push(RemoteChapter {
            remote_id: url.clone(),
            title: normalize_text(&title).chars().take(300).collect(),
            url,
            attribution: None,
        });
    }
    Ok(chapters)
}

pub fn parse_html_pages(source: &ValidatedSource, html: &str) -> AppResult<Vec<RemotePage>> {
    ensure_adapter(source, AdapterKind::GenericHtml)?;
    ensure_payload_size(html, 16 * 1024 * 1024, "HTML-страница главы больше 16 МБ.")?;
    let config = html_config(source)?;
    let extraction = parse_selector(&config.selectors.page_images)?;
    let document = Html::parse_document(html);
    let mut pages = Vec::new();
    for element in document.select(&extraction.selector).take(2_000) {
        let value = extract_selected(element, extraction.attribute.as_deref());
        if value.is_empty() {
            continue;
        }
        let url = resolve_image_url(source, &value)?;
        let index = pages.len();
        pages.push(RemotePage {
            index: index as u32,
            label: label_from_url(&url, index),
            url: url.to_string(),
        });
    }
    Ok(pages)
}

fn html_config(source: &ValidatedSource) -> AppResult<HtmlProfileConfig> {
    serde_json::from_value(source.config.clone())
        .map_err(|_| validation("Сохранённый HTML-профиль повреждён."))
}

fn ensure_adapter(source: &ValidatedSource, expected: AdapterKind) -> AppResult<()> {
    if source.adapter_kind != expected {
        return Err(validation("Для источника выбран неверный adapter."));
    }
    Ok(())
}

fn ensure_payload_size(value: &str, maximum: usize, message: &str) -> AppResult<()> {
    if value.len() > maximum {
        return Err(validation(message));
    }
    Ok(())
}

struct ExtractionSelector {
    selector: Selector,
    attribute: Option<String>,
}

fn parse_selector(specification: &str) -> AppResult<ExtractionSelector> {
    let (selector, attribute) = match specification.rsplit_once('@') {
        Some((selector, attribute))
            if !selector.is_empty()
                && !attribute.is_empty()
                && attribute.chars().all(|character| {
                    character.is_ascii_alphanumeric() || character == '-' || character == '_'
                }) =>
        {
            (selector, Some(attribute.to_string()))
        }
        _ => (specification, None),
    };
    let selector = Selector::parse(selector)
        .map_err(|_| validation("HTML-профиль содержит некорректный CSS selector."))?;
    Ok(ExtractionSelector {
        selector,
        attribute,
    })
}

fn extract(root: ElementRef<'_>, specification: &str) -> AppResult<String> {
    let extraction = parse_selector(specification)?;
    let Some(element) = root.select(&extraction.selector).next() else {
        return Ok(String::new());
    };
    Ok(extract_selected(element, extraction.attribute.as_deref()))
}

fn extract_selected(element: ElementRef<'_>, attribute: Option<&str>) -> String {
    if let Some(attribute) = attribute {
        return element
            .value()
            .attr(attribute)
            .unwrap_or_default()
            .trim()
            .to_string();
    }
    normalize_text(&element.text().collect::<Vec<_>>().join(" "))
}

fn label_from_url(url: &url::Url, index: usize) -> String {
    url.path_segments()
        .and_then(|mut segments| segments.rfind(|segment| !segment.is_empty()))
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| format!("Страница {}", index + 1))
}

fn validate_remote_identity(id: &str, title: &str) -> AppResult<()> {
    if id.trim().is_empty()
        || id.len() > 1_024
        || title.trim().is_empty()
        || title.chars().count() > 300
    {
        return Err(validation(
            "Источник вернул произведение с некорректным id или названием.",
        ));
    }
    Ok(())
}

fn normalize_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn normalize_optional(value: Option<&str>, max_chars: usize) -> Option<String> {
    value
        .map(normalize_text)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(max_chars).collect())
}

fn validation(message: &str) -> AppError {
    AppError::Validation {
        message: message.to_string(),
    }
}
