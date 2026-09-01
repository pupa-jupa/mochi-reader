use quick_xml::de::from_str as from_xml_str;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use url::{Url, form_urlencoded};

use crate::{
    domain::error::{AppError, AppResult},
    sources::{
        http_client::{ExpectedContent, SourceHttpClient},
        http_policy::HttpPolicy,
        model::{
            AdapterKind, RemoteContentKind, RemoteMangaSummary, RemoteSearchPage,
            SourceCapabilities, ValidatedSource,
        },
    },
};

const MAX_CATALOG_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OpdsCatalogType {
    Opds1,
    Opds2,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpdsCatalogPreview {
    pub name: String,
    pub catalog_type: OpdsCatalogType,
    pub item_count: Option<u32>,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedOpdsCatalog {
    pub preview: OpdsCatalogPreview,
    pub search_template: Option<String>,
    pub page: RemoteSearchPage,
}

#[derive(Debug, Deserialize)]
struct Opds2Feed {
    metadata: Opds2Metadata,
    #[serde(default)]
    links: Vec<Opds2Link>,
    #[serde(default)]
    publications: Vec<Opds2Publication>,
    #[serde(default)]
    groups: Vec<Opds2Group>,
    #[serde(default)]
    navigation: Vec<Opds2Link>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Opds2Metadata {
    title: String,
    #[serde(default)]
    number_of_items: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct Opds2Group {
    #[serde(default)]
    publications: Vec<Opds2Publication>,
}

#[derive(Debug, Deserialize)]
struct Opds2Publication {
    metadata: Value,
    #[serde(default)]
    links: Vec<Opds2Link>,
    #[serde(default)]
    images: Vec<Opds2Link>,
}

#[derive(Debug, Deserialize)]
struct Opds2Link {
    href: String,
    #[serde(default)]
    rel: Value,
    #[serde(default, rename = "type")]
    media_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AtomFeed {
    title: String,
    #[serde(default, rename = "link")]
    links: Vec<AtomLink>,
    #[serde(default, rename = "entry")]
    entries: Vec<AtomEntry>,
}

#[derive(Debug, Deserialize)]
struct AtomEntry {
    id: String,
    title: String,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    content: Option<String>,
    #[serde(default, rename = "author")]
    authors: Vec<AtomAuthor>,
    #[serde(default, rename = "link")]
    links: Vec<AtomLink>,
}

#[derive(Debug, Deserialize)]
struct AtomAuthor {
    name: String,
}

#[derive(Debug, Deserialize)]
struct AtomLink {
    #[serde(rename = "@href")]
    href: String,
    #[serde(default, rename = "@rel")]
    rel: String,
    #[serde(default, rename = "@type")]
    media_type: Option<String>,
}

pub async fn probe_catalog(
    raw_url: &str,
    name: Option<&str>,
) -> AppResult<(OpdsCatalogPreview, ValidatedSource)> {
    let value = raw_url.trim();
    let policy = HttpPolicy::for_source(value)?;
    let catalog_url =
        Url::parse(value).map_err(|_| validation("Укажи корректный URL OPDS-каталога."))?;
    policy.ensure_allowed(&catalog_url)?;
    let client = SourceHttpClient::new(policy).await?;
    let (bytes, media_type) = client
        .get(&catalog_url, ExpectedContent::Catalog, MAX_CATALOG_BYTES)
        .await?;
    let body =
        std::str::from_utf8(&bytes).map_err(|_| validation("OPDS-каталог должен быть в UTF-8."))?;
    let parsed = parse_catalog(body, &media_type, &catalog_url)?;
    let source = validated_source(name, &catalog_url, &parsed)?;
    Ok((parsed.preview, source))
}

pub fn parse_catalog(
    body: &str,
    media_type: &str,
    catalog_url: &Url,
) -> AppResult<ParsedOpdsCatalog> {
    if body.len() > MAX_CATALOG_BYTES {
        return Err(validation("OPDS-каталог превышает допустимый размер."));
    }
    let policy = HttpPolicy::for_source(catalog_url.as_str())?;
    policy.ensure_allowed(catalog_url)?;
    let normalized_type = media_type
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    if normalized_type == "application/opds+json"
        || normalized_type == "application/json"
        || normalized_type.ends_with("+json")
    {
        parse_opds2(body, catalog_url, &policy)
    } else if matches!(
        normalized_type.as_str(),
        "application/atom+xml" | "application/xml" | "text/xml"
    ) {
        parse_opds1(body, catalog_url, &policy)
    } else {
        Err(validation("Сервер вернул не OPDS-каталог."))
    }
}

pub fn validated_source(
    custom_name: Option<&str>,
    catalog_url: &Url,
    catalog: &ParsedOpdsCatalog,
) -> AppResult<ValidatedSource> {
    let name = custom_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&catalog.preview.name);
    if name.chars().count() > 200 {
        return Err(validation("Название OPDS-каталога слишком длинное."));
    }
    Ok(ValidatedSource {
        name: name.to_string(),
        base_url: catalog_url.as_str().to_string(),
        adapter_kind: AdapterKind::Opds,
        config: json!({
            "schemaVersion": 1,
            "catalogUrl": catalog_url.as_str(),
            "catalogType": catalog.preview.catalog_type,
            "searchTemplate": catalog.search_template,
        }),
        capabilities: SourceCapabilities {
            search: true,
            download: catalog
                .page
                .items
                .iter()
                .any(|item| item.acquisition_url.is_some()),
        },
    })
}

pub fn catalog_url(source: &ValidatedSource) -> AppResult<Url> {
    ensure_opds(source)?;
    let value = source
        .config
        .get("catalogUrl")
        .and_then(Value::as_str)
        .ok_or_else(|| validation("Сохранённая конфигурация OPDS повреждена."))?;
    let policy = HttpPolicy::for_source(&source.base_url)?;
    let url = Url::parse(value).map_err(|_| validation("Сохранённый OPDS URL повреждён."))?;
    policy.ensure_allowed(&url)?;
    Ok(url)
}

pub fn search_url(source: &ValidatedSource, query: &str) -> AppResult<Option<Url>> {
    ensure_opds(source)?;
    let Some(template) = source.config.get("searchTemplate").and_then(Value::as_str) else {
        return Ok(None);
    };
    let encoded = form_urlencoded::byte_serialize(query.trim().as_bytes()).collect::<String>();
    let expanded = expand_search_template(template, &encoded)?;
    let url = Url::parse(&expanded)
        .map_err(|_| validation("OPDS search template вернул неверный URL."))?;
    HttpPolicy::for_source(&source.base_url)?.ensure_allowed(&url)?;
    Ok(Some(url))
}

pub fn filter_page(mut page: RemoteSearchPage, query: &str) -> RemoteSearchPage {
    let needle = query.trim().to_lowercase();
    page.items.retain(|item| {
        item.title.to_lowercase().contains(&needle)
            || item
                .author
                .as_deref()
                .is_some_and(|value| value.to_lowercase().contains(&needle))
            || item
                .summary
                .as_deref()
                .is_some_and(|value| value.to_lowercase().contains(&needle))
    });
    page.has_next_page = false;
    page
}

fn parse_opds2(body: &str, catalog_url: &Url, policy: &HttpPolicy) -> AppResult<ParsedOpdsCatalog> {
    let feed: Opds2Feed = serde_json::from_str(body)
        .map_err(|_| validation("Сервер вернул некорректный OPDS 2 JSON."))?;
    let name = clean_required(
        &feed.metadata.title,
        "В OPDS 2 отсутствует название каталога.",
    )?;
    if feed.publications.is_empty() && feed.groups.is_empty() && feed.navigation.is_empty() {
        return Err(validation("JSON не содержит коллекций OPDS 2."));
    }
    let search_template = feed
        .links
        .iter()
        .find(|link| {
            rel_contains(&link.rel, "search")
                && (link.href.contains("{?query") || link.href.contains("{searchTerms}"))
        })
        .map(|link| resolve_template(catalog_url, &link.href, policy))
        .transpose()?;
    let mut publications = feed.publications;
    for group in feed.groups {
        publications.extend(group.publications);
    }
    let mut items = Vec::new();
    for publication in publications.into_iter().take(200) {
        if let Some(item) = opds2_item(publication, catalog_url, policy)? {
            items.push(item);
        }
    }
    let item_count = feed.metadata.number_of_items.or(Some(items.len() as u32));
    Ok(ParsedOpdsCatalog {
        preview: OpdsCatalogPreview {
            name,
            catalog_type: OpdsCatalogType::Opds2,
            item_count,
            url: catalog_url.as_str().to_string(),
        },
        search_template,
        page: RemoteSearchPage {
            items,
            has_next_page: false,
        },
    })
}

fn opds2_item(
    publication: Opds2Publication,
    catalog_url: &Url,
    policy: &HttpPolicy,
) -> AppResult<Option<RemoteMangaSummary>> {
    let Some(title) = publication.metadata.get("title").and_then(Value::as_str) else {
        return Ok(None);
    };
    let title = clean_required(title, "OPDS publication has an empty title.")?;
    let acquisition = publication.links.iter().find(|link| {
        rel_contains(&link.rel, "download")
            || rel_contains(&link.rel, "http://opds-spec.org/acquisition/open-access")
    });
    let acquisition_url = acquisition
        .map(|link| resolve_url(catalog_url, &link.href, policy).map(|url| url.to_string()))
        .transpose()?;
    let format = acquisition
        .and_then(|link| link.media_type.as_deref())
        .and_then(format_from_media_type);
    let cover_url = publication
        .images
        .first()
        .and_then(|link| resolve_url(catalog_url, &link.href, policy).ok())
        .map(|url| url.to_string());
    let remote_id = publication
        .metadata
        .get("identifier")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| acquisition_url.clone())
        .unwrap_or_else(|| title.clone());
    Ok(Some(RemoteMangaSummary {
        remote_id,
        title,
        url: acquisition_url
            .clone()
            .unwrap_or_else(|| catalog_url.as_str().to_string()),
        cover_url,
        summary: publication
            .metadata
            .get("description")
            .and_then(Value::as_str)
            .map(clean_text),
        content_kind: RemoteContentKind::Book,
        author: author_from_value(publication.metadata.get("author")),
        acquisition_url,
        format: format.map(str::to_string),
    }))
}

fn parse_opds1(body: &str, catalog_url: &Url, policy: &HttpPolicy) -> AppResult<ParsedOpdsCatalog> {
    let feed: AtomFeed = from_xml_str(body)
        .map_err(|_| validation("Сервер вернул некорректный OPDS 1 Atom feed."))?;
    let name = clean_required(&feed.title, "В OPDS 1 отсутствует название каталога.")?;
    let search_template = feed
        .links
        .iter()
        .find(|link| {
            (link.rel == "search" || link.rel == "http://opds-spec.org/search")
                && (link.href.contains("{?query") || link.href.contains("{searchTerms}"))
        })
        .map(|link| resolve_template(catalog_url, &link.href, policy))
        .transpose()?;
    let mut items = Vec::new();
    for entry in feed.entries.into_iter().take(200) {
        let acquisition = entry.links.iter().find(|link| {
            link.rel == "download" || link.rel == "http://opds-spec.org/acquisition/open-access"
        });
        let acquisition_url = acquisition
            .map(|link| resolve_url(catalog_url, &link.href, policy).map(|url| url.to_string()))
            .transpose()?;
        let cover_url = entry
            .links
            .iter()
            .find(|link| link.rel == "http://opds-spec.org/image/thumbnail")
            .or_else(|| {
                entry
                    .links
                    .iter()
                    .find(|link| link.rel == "http://opds-spec.org/image")
            })
            .and_then(|link| resolve_url(catalog_url, &link.href, policy).ok())
            .map(|url| url.to_string());
        let title = clean_required(&entry.title, "В OPDS entry отсутствует название.")?;
        let format = acquisition
            .and_then(|link| link.media_type.as_deref())
            .and_then(format_from_media_type)
            .map(str::to_string);
        items.push(RemoteMangaSummary {
            remote_id: clean_required(&entry.id, "В OPDS entry отсутствует id.")?,
            title,
            url: acquisition_url
                .clone()
                .unwrap_or_else(|| catalog_url.as_str().to_string()),
            cover_url,
            summary: entry
                .summary
                .or(entry.content)
                .map(|value| clean_text(&value)),
            content_kind: RemoteContentKind::Book,
            author: entry.authors.first().map(|author| clean_text(&author.name)),
            acquisition_url,
            format,
        });
    }
    Ok(ParsedOpdsCatalog {
        preview: OpdsCatalogPreview {
            name,
            catalog_type: OpdsCatalogType::Opds1,
            item_count: Some(items.len() as u32),
            url: catalog_url.as_str().to_string(),
        },
        search_template,
        page: RemoteSearchPage {
            items,
            has_next_page: false,
        },
    })
}

fn author_from_value(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(author) => Some(clean_text(author)),
        Value::Object(author) => author.get("name").and_then(Value::as_str).map(clean_text),
        Value::Array(authors) => authors.iter().find_map(|author| match author {
            Value::String(value) => Some(clean_text(value)),
            Value::Object(value) => value.get("name").and_then(Value::as_str).map(clean_text),
            _ => None,
        }),
        _ => None,
    }
}

fn rel_contains(value: &Value, expected: &str) -> bool {
    match value {
        Value::String(rel) => rel == expected,
        Value::Array(relations) => relations.iter().any(|rel| rel.as_str() == Some(expected)),
        _ => false,
    }
}

fn resolve_url(base: &Url, value: &str, policy: &HttpPolicy) -> AppResult<Url> {
    let url = base
        .join(value)
        .map_err(|_| validation("OPDS содержит некорректный URL."))?;
    policy.ensure_allowed(&url)?;
    Ok(url)
}

fn resolve_template(base: &Url, value: &str, policy: &HttpPolicy) -> AppResult<String> {
    let brace = value.find('{').unwrap_or(value.len());
    let (path, template) = value.split_at(brace);
    let resolved = resolve_url(base, path, policy)?;
    if !template.is_empty()
        && !template.contains("{searchTerms}")
        && !template.starts_with("{?query")
    {
        return Err(validation(
            "OPDS search template использует неподдерживаемые параметры.",
        ));
    }
    Ok(format!("{resolved}{template}"))
}

fn expand_search_template(template: &str, query: &str) -> AppResult<String> {
    if template.contains("{searchTerms}") {
        return Ok(template.replace("{searchTerms}", query));
    }
    if let Some(start) = template.find("{?query") {
        let end = template[start..]
            .find('}')
            .map(|offset| start + offset)
            .ok_or_else(|| validation("OPDS search template не закрыт."))?;
        return Ok(format!(
            "{}?query={}{}",
            &template[..start],
            query,
            &template[end + 1..]
        ));
    }
    Err(validation("OPDS search template не содержит query."))
}

fn format_from_media_type(media_type: &str) -> Option<&'static str> {
    match media_type
        .split(';')
        .next()?
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "application/epub+zip" => Some("epub"),
        "application/pdf" => Some("pdf"),
        "application/x-fictionbook+xml" | "application/fb2+xml" => Some("fb2"),
        "text/plain" => Some("txt"),
        "text/html" | "application/xhtml+xml" => Some("html"),
        "text/markdown" => Some("markdown"),
        _ => None,
    }
}

fn ensure_opds(source: &ValidatedSource) -> AppResult<()> {
    if source.adapter_kind != AdapterKind::Opds {
        return Err(validation("Источник не использует OPDS adapter."));
    }
    Ok(())
}

fn clean_required(value: &str, message: &str) -> AppResult<String> {
    let value = clean_text(value);
    if value.is_empty() || value.chars().count() > 500 {
        return Err(validation(message));
    }
    Ok(value)
}

fn clean_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn validation(message: &str) -> AppError {
    AppError::Validation {
        message: message.to_string(),
    }
}
