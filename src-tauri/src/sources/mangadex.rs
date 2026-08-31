use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use url::Url;

use crate::{
    domain::error::{AppError, AppResult},
    sources::{
        http_policy::{HttpPolicy, resolve_image_url},
        model::{
            AdapterKind, RemoteChapter, RemoteMangaSummary, RemotePage, RemoteSearchPage,
            SourceCapabilities, ValidatedSource,
        },
    },
};

const SEARCH_PAGE_SIZE: u32 = 20;
const CHAPTER_PAGE_SIZE: u32 = 100;
const MAX_JSON_BYTES: usize = 4 * 1024 * 1024;
const MAX_PAGES: usize = 2_000;
const API_ORIGIN: &str = "https://api.mangadex.org";
const IMAGE_ORIGIN: &str = "https://uploads.mangadex.org";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MangadexConfig {
    schema_version: u32,
    languages: Vec<String>,
    content_ratings: Vec<String>,
    data_saver: bool,
    image_origins: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    result: String,
    data: Vec<SearchItem>,
    limit: u32,
    offset: u32,
    total: u32,
}

#[derive(Debug, Deserialize)]
struct SearchItem {
    id: String,
    #[serde(rename = "type")]
    resource_type: String,
    attributes: MangaAttributes,
    #[serde(default)]
    relationships: Vec<Relationship>,
}

#[derive(Debug, Deserialize)]
struct MangaAttributes {
    title: HashMap<String, String>,
    #[serde(default)]
    description: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct ChapterResponse {
    result: String,
    data: Vec<ChapterItem>,
    limit: u32,
    offset: u32,
    total: u32,
}

#[derive(Debug, Deserialize)]
struct ChapterItem {
    id: String,
    #[serde(rename = "type")]
    resource_type: String,
    attributes: ChapterAttributes,
    #[serde(default)]
    relationships: Vec<Relationship>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChapterAttributes {
    volume: Option<String>,
    chapter: Option<String>,
    title: Option<String>,
    translated_language: Option<String>,
    external_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Relationship {
    #[serde(rename = "type")]
    resource_type: String,
    #[serde(default)]
    attributes: Option<RelationshipAttributes>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RelationshipAttributes {
    file_name: Option<String>,
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AtHomeResponse {
    result: String,
    base_url: String,
    chapter: AtHomeChapter,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AtHomeChapter {
    hash: String,
    #[serde(default)]
    data: Vec<String>,
    #[serde(default)]
    data_saver: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChapterBatch {
    pub items: Vec<RemoteChapter>,
    pub offset: u32,
    pub limit: u32,
    pub total: u32,
}

impl ChapterBatch {
    pub fn next_offset(&self) -> Option<u32> {
        let next = self.offset.saturating_add(self.limit);
        (self.limit > 0 && next < self.total).then_some(next)
    }
}

pub fn builtin_source() -> ValidatedSource {
    let config = MangadexConfig {
        schema_version: 1,
        languages: vec!["ru".to_string(), "en".to_string()],
        content_ratings: vec!["safe".to_string(), "suggestive".to_string()],
        data_saver: true,
        image_origins: vec![IMAGE_ORIGIN.to_string()],
    };
    ValidatedSource {
        name: "MangaDex".to_string(),
        base_url: API_ORIGIN.to_string(),
        adapter_kind: AdapterKind::Mangadex,
        config: serde_json::to_value(config).expect("static MangaDex config must serialize"),
        capabilities: SourceCapabilities {
            search: true,
            download: false,
        },
    }
}

pub fn builtin_source_for(kind: &str) -> AppResult<ValidatedSource> {
    match kind {
        "mangadex" => Ok(builtin_source()),
        _ => Err(validation("Неизвестный встроенный источник.")),
    }
}

pub fn search_url(source: &ValidatedSource, query: &str, page: u32) -> AppResult<Url> {
    ensure_source(source)?;
    if query.trim().is_empty() || query.chars().count() > 200 || !(1..=1_000).contains(&page) {
        return Err(validation("Некорректные параметры поиска MangaDex."));
    }
    let config = config(source)?;
    let policy = HttpPolicy::for_source(&source.base_url)?;
    let mut url = policy.resolve("/manga")?;
    {
        let mut query_pairs = url.query_pairs_mut();
        query_pairs
            .append_pair("title", query.trim())
            .append_pair("limit", &SEARCH_PAGE_SIZE.to_string())
            .append_pair("offset", &((page - 1) * SEARCH_PAGE_SIZE).to_string())
            .append_pair("includes[]", "cover_art")
            .append_pair("order[relevance]", "desc");
        for language in config.languages {
            query_pairs.append_pair("availableTranslatedLanguage[]", &language);
        }
        for rating in config.content_ratings {
            query_pairs.append_pair("contentRating[]", &rating);
        }
    }
    Ok(url)
}

pub fn chapter_url(source: &ValidatedSource, manga_id: &str, offset: u32) -> AppResult<Url> {
    ensure_source(source)?;
    validate_path_component(manga_id, "Идентификатор манги")?;
    let config = config(source)?;
    let policy = HttpPolicy::for_source(&source.base_url)?;
    let mut url = policy.resolve("/")?;
    url.path_segments_mut()
        .map_err(|_| validation("Не удалось собрать MangaDex URL глав."))?
        .extend(["manga", manga_id, "feed"]);
    {
        let mut query_pairs = url.query_pairs_mut();
        query_pairs
            .append_pair("limit", &CHAPTER_PAGE_SIZE.to_string())
            .append_pair("offset", &offset.to_string())
            .append_pair("includes[]", "scanlation_group")
            .append_pair("order[volume]", "asc")
            .append_pair("order[chapter]", "asc");
        for language in config.languages {
            query_pairs.append_pair("translatedLanguage[]", &language);
        }
        for rating in config.content_ratings {
            query_pairs.append_pair("contentRating[]", &rating);
        }
    }
    Ok(url)
}

pub fn at_home_url(source: &ValidatedSource, chapter_id: &str) -> AppResult<Url> {
    ensure_source(source)?;
    validate_path_component(chapter_id, "Идентификатор главы")?;
    let policy = HttpPolicy::for_source(&source.base_url)?;
    let mut url = policy.resolve("/")?;
    url.path_segments_mut()
        .map_err(|_| validation("Не удалось собрать MangaDex@Home URL."))?
        .extend(["at-home", "server", chapter_id]);
    Ok(url)
}

pub fn parse_search(
    source: &ValidatedSource,
    json: &str,
    page: u32,
) -> AppResult<RemoteSearchPage> {
    ensure_source(source)?;
    ensure_json_size(json)?;
    if !(1..=1_000).contains(&page) {
        return Err(validation(
            "Номер страницы MangaDex вне допустимого диапазона.",
        ));
    }
    let response: SearchResponse = serde_json::from_str(json)
        .map_err(|error| validation(&format!("MangaDex вернул неверный JSON поиска: {error}")))?;
    ensure_ok(&response.result)?;
    let data_count = response.data.len().try_into().unwrap_or(u32::MAX);
    let mut items = Vec::with_capacity(response.data.len().min(200));
    for item in response.data.into_iter().take(200) {
        if item.resource_type != "manga" {
            continue;
        }
        validate_path_component(&item.id, "Идентификатор манги")?;
        let title = localized(&item.attributes.title)
            .ok_or_else(|| validation("MangaDex вернул мангу без названия."))?;
        let cover_url = item
            .relationships
            .iter()
            .find(|relationship| relationship.resource_type == "cover_art")
            .and_then(|relationship| relationship.attributes.as_ref())
            .and_then(|attributes| attributes.file_name.as_deref())
            .map(|file_name| cover_url(source, &item.id, file_name))
            .transpose()?;
        items.push(RemoteMangaSummary {
            remote_id: item.id.clone(),
            title: title.chars().take(300).collect(),
            url: format!("https://mangadex.org/title/{}", item.id),
            cover_url,
            summary: localized(&item.attributes.description)
                .map(|value| value.chars().take(4_000).collect()),
        });
    }
    let consumed = response.offset.saturating_add(data_count);
    Ok(RemoteSearchPage {
        items,
        has_next_page: consumed < response.total && response.limit > 0,
    })
}

pub fn parse_chapters(json: &str) -> AppResult<ChapterBatch> {
    ensure_json_size(json)?;
    let response: ChapterResponse = serde_json::from_str(json)
        .map_err(|error| validation(&format!("MangaDex вернул неверный JSON глав: {error}")))?;
    ensure_ok(&response.result)?;
    let mut items = Vec::with_capacity(response.data.len().min(5_000));
    for chapter in response.data.into_iter().take(5_000) {
        if chapter.resource_type != "chapter"
            || chapter
                .attributes
                .external_url
                .as_deref()
                .is_some_and(|url| !url.trim().is_empty())
        {
            continue;
        }
        validate_path_component(&chapter.id, "Идентификатор главы")?;
        let title = chapter_title(&chapter.attributes);
        let mut seen = HashSet::new();
        let groups = chapter
            .relationships
            .iter()
            .filter(|relationship| relationship.resource_type == "scanlation_group")
            .filter_map(|relationship| relationship.attributes.as_ref())
            .filter_map(|attributes| attributes.name.as_deref())
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .filter(|name| seen.insert((*name).to_string()))
            .map(ToString::to_string)
            .collect::<Vec<_>>();
        items.push(RemoteChapter {
            remote_id: chapter.id.clone(),
            title,
            url: format!("https://mangadex.org/chapter/{}", chapter.id),
            attribution: (!groups.is_empty()).then(|| groups.join(", ")),
        });
    }
    Ok(ChapterBatch {
        items,
        offset: response.offset,
        limit: response.limit,
        total: response.total,
    })
}

pub fn parse_pages(source: &ValidatedSource, json: &str) -> AppResult<Vec<RemotePage>> {
    ensure_source(source)?;
    ensure_json_size(json)?;
    let response: AtHomeResponse = serde_json::from_str(json)
        .map_err(|error| validation(&format!("MangaDex@Home вернул неверный JSON: {error}")))?;
    ensure_ok(&response.result)?;
    validate_path_component(&response.chapter.hash, "Hash главы")?;
    let config = config(source)?;
    let filenames = if config.data_saver && !response.chapter.data_saver.is_empty() {
        &response.chapter.data_saver
    } else {
        &response.chapter.data
    };
    if filenames.len() > MAX_PAGES {
        return Err(validation("MangaDex вернул слишком много страниц."));
    }
    let mut base_url = Url::parse(&response.base_url)
        .map_err(|_| validation("MangaDex@Home вернул некорректный base URL."))?;
    ensure_image_origin(&config, &base_url)?;
    let route = if config.data_saver && !response.chapter.data_saver.is_empty() {
        "data-saver"
    } else {
        "data"
    };
    filenames
        .iter()
        .enumerate()
        .map(|(index, filename)| {
            validate_path_component(filename, "Имя файла страницы")?;
            base_url.set_query(None);
            base_url.set_fragment(None);
            base_url.set_path("/");
            base_url
                .path_segments_mut()
                .map_err(|_| validation("Не удалось собрать URL страницы MangaDex."))?
                .extend([route, &response.chapter.hash, filename]);
            let url = resolve_image_url(source, base_url.as_str())?;
            Ok(RemotePage {
                index: index as u32,
                label: filename.to_string(),
                url: url.to_string(),
            })
        })
        .collect()
}

fn config(source: &ValidatedSource) -> AppResult<MangadexConfig> {
    let config: MangadexConfig = serde_json::from_value(source.config.clone())
        .map_err(|_| validation("Сохранённая конфигурация MangaDex повреждена."))?;
    if config.schema_version != 1
        || config.languages.is_empty()
        || config.content_ratings.is_empty()
        || config.image_origins.is_empty()
    {
        return Err(validation("Конфигурация MangaDex неполна."));
    }
    Ok(config)
}

fn ensure_source(source: &ValidatedSource) -> AppResult<()> {
    if source.adapter_kind != AdapterKind::Mangadex || source.base_url != API_ORIGIN {
        return Err(validation(
            "Для источника выбран неверный MangaDex adapter.",
        ));
    }
    Ok(())
}

fn cover_url(source: &ValidatedSource, manga_id: &str, file_name: &str) -> AppResult<String> {
    validate_path_component(file_name, "Имя обложки")?;
    let mut url = Url::parse(IMAGE_ORIGIN).expect("static MangaDex image origin must be valid");
    let sized_name = format!("{file_name}.256.jpg");
    url.path_segments_mut()
        .map_err(|_| validation("Не удалось собрать URL обложки MangaDex."))?
        .extend(["covers", manga_id, &sized_name]);
    Ok(resolve_image_url(source, url.as_str())?.to_string())
}

fn ensure_image_origin(config: &MangadexConfig, url: &Url) -> AppResult<()> {
    let origin = url.origin().ascii_serialization();
    if url.scheme() != "https"
        || !config
            .image_origins
            .iter()
            .any(|allowed| allowed == &origin)
    {
        return Err(validation(
            "MangaDex@Home вернул сервер вне разрешённого origin.",
        ));
    }
    Ok(())
}

fn chapter_title(attributes: &ChapterAttributes) -> String {
    let mut parts = Vec::new();
    if let Some(volume) = trimmed(attributes.volume.as_deref()) {
        parts.push(format!("Том {volume}"));
    }
    if let Some(chapter) = trimmed(attributes.chapter.as_deref()) {
        parts.push(format!("Глава {chapter}"));
    }
    if let Some(title) = trimmed(attributes.title.as_deref()) {
        parts.push(title.to_string());
    }
    if let Some(language) = trimmed(attributes.translated_language.as_deref()) {
        parts.push(language.to_uppercase());
    }
    if parts.is_empty() {
        "Глава без номера".to_string()
    } else {
        parts.join(" · ")
    }
}

fn localized(values: &HashMap<String, String>) -> Option<String> {
    ["ru", "en", "ja-ro"]
        .into_iter()
        .find_map(|key| values.get(key).filter(|value| !value.trim().is_empty()))
        .or_else(|| values.values().find(|value| !value.trim().is_empty()))
        .map(|value| value.split_whitespace().collect::<Vec<_>>().join(" "))
}

fn trimmed(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn validate_path_component(value: &str, name: &str) -> AppResult<()> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 1_024
        || value == "."
        || value == ".."
        || value.contains('/')
        || value.contains('\\')
    {
        return Err(validation(&format!("{name} имеет неверный формат.")));
    }
    Ok(())
}

fn ensure_json_size(json: &str) -> AppResult<()> {
    if json.len() > MAX_JSON_BYTES {
        return Err(validation("Ответ MangaDex больше 4 МБ."));
    }
    Ok(())
}

fn ensure_ok(result: &str) -> AppResult<()> {
    if result != "ok" {
        return Err(validation("MangaDex вернул ошибку API."));
    }
    Ok(())
}

fn validation(message: &str) -> AppError {
    AppError::Validation {
        message: message.to_string(),
    }
}
