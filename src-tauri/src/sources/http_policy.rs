use std::{collections::HashSet, net::IpAddr};

use url::{Host, Origin, Url};

use crate::domain::error::{AppError, AppResult};
use crate::sources::model::{AdapterKind, ValidatedSource};

#[derive(Debug, Clone)]
pub struct HttpPolicy {
    base_url: Url,
    origin: Origin,
}

pub fn normalize_image_origins(origins: &mut Vec<String>) -> AppResult<()> {
    if origins.len() > 8 {
        return Err(validation("Источник объявил слишком много image origins."));
    }
    let mut normalized = Vec::with_capacity(origins.len());
    let mut seen = HashSet::new();
    for value in origins.iter() {
        let parsed = Url::parse(value)
            .map_err(|_| validation("imageOrigins должен содержать корректные HTTPS origins."))?;
        if parsed.path() != "/" && !parsed.path().is_empty() {
            return Err(validation("imageOrigins не должен содержать путь."));
        }
        let policy = HttpPolicy::for_source(value)?;
        let origin = policy.base_url().origin().ascii_serialization();
        if seen.insert(origin.clone()) {
            normalized.push(origin);
        }
    }
    *origins = normalized;
    Ok(())
}

pub fn resolve_image_url(source: &ValidatedSource, value: &str) -> AppResult<Url> {
    let base_policy = HttpPolicy::for_source(&source.base_url)?;
    if let Ok(url) = base_policy.resolve(value) {
        return Ok(url);
    }
    let url = Url::parse(value)
        .map_err(|_| validation("Источник вернул некорректный URL изображения."))?;
    if source.adapter_kind == AdapterKind::Mangadex && is_trusted_mangadex_image_url(&url) {
        return Ok(url);
    }
    let allowed = source
        .config
        .get("allowedDomains")
        .or_else(|| source.config.get("imageOrigins"))
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(serde_json::Value::as_str)
        .any(|origin| {
            HttpPolicy::for_source(origin)
                .and_then(|policy| policy.ensure_allowed(&url))
                .is_ok()
        });
    if !allowed {
        return Err(validation(
            "Изображение находится вне разрешённых origin источника.",
        ));
    }
    Ok(url)
}

pub fn is_trusted_mangadex_image_url(url: &Url) -> bool {
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some_and(|port| port != 443)
        || url.fragment().is_some()
    {
        return false;
    }
    url.host_str().is_some_and(|host| {
        let host = host.to_ascii_lowercase();
        host == "uploads.mangadex.org"
            || host == "mangadex.network"
            || host.ends_with(".mangadex.network")
    })
}

impl HttpPolicy {
    pub fn for_source(raw_url: &str) -> AppResult<Self> {
        let parsed =
            Url::parse(raw_url).map_err(|_| validation("Укажи корректный URL источника."))?;
        if !parsed.username().is_empty() || parsed.password().is_some() {
            return Err(validation(
                "URL источника не должен содержать логин или пароль.",
            ));
        }
        if parsed.query().is_some() || parsed.fragment().is_some() {
            return Err(validation(
                "URL источника не должен содержать query или fragment.",
            ));
        }
        let host = parsed
            .host()
            .ok_or_else(|| validation("В URL источника не найден домен."))?;
        let debug_loopback = cfg!(debug_assertions) && is_loopback_host(&host);
        if parsed.scheme() != "https" && !(parsed.scheme() == "http" && debug_loopback) {
            return Err(validation("Онлайн-источники должны использовать HTTPS."));
        }
        if is_forbidden_host(&host) && !debug_loopback {
            return Err(validation(
                "Локальные и служебные адреса нельзя использовать как источник.",
            ));
        }
        let origin = parsed.origin();
        if matches!(origin, Origin::Opaque(_)) {
            return Err(validation("Источник должен иметь обычный HTTPS origin."));
        }
        let base_url = Url::parse(&format!("{}/", origin.ascii_serialization()))
            .map_err(|_| validation("Не удалось нормализовать URL источника."))?;
        Ok(Self { base_url, origin })
    }

    pub fn base_url(&self) -> &Url {
        &self.base_url
    }

    pub fn resolve(&self, value: &str) -> AppResult<Url> {
        let url = self
            .base_url
            .join(value)
            .map_err(|_| validation("В конфигурации источника найден некорректный URL."))?;
        self.ensure_allowed(&url)?;
        Ok(url)
    }

    pub fn ensure_allowed(&self, url: &Url) -> AppResult<()> {
        if url.origin() != self.origin {
            return Err(validation(
                "Адаптер попытался выйти за origin своего источника.",
            ));
        }
        if url.scheme() != self.base_url.scheme()
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err(validation(
                "URL адаптера нарушает сетевую политику источника.",
            ));
        }
        Ok(())
    }

    pub fn allows_ip(&self, address: IpAddr) -> bool {
        if !is_forbidden_ip(address) {
            return true;
        }
        cfg!(debug_assertions)
            && self
                .base_url
                .host()
                .is_some_and(|host| is_loopback_host(&host))
            && address.is_loopback()
    }
}

fn is_loopback_host(host: &Host<&str>) -> bool {
    match host {
        Host::Domain(domain) => domain.eq_ignore_ascii_case("localhost"),
        Host::Ipv4(address) => address.is_loopback(),
        Host::Ipv6(address) => address.is_loopback(),
    }
}

fn is_forbidden_host(host: &Host<&str>) -> bool {
    match host {
        Host::Domain(domain) => {
            domain.eq_ignore_ascii_case("localhost")
                || domain.ends_with(".local")
                || domain.ends_with(".internal")
        }
        Host::Ipv4(address) => is_forbidden_ip(IpAddr::V4(*address)),
        Host::Ipv6(address) => is_forbidden_ip(IpAddr::V6(*address)),
    }
}

fn is_forbidden_ip(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(value) => {
            value.is_private()
                || value.is_loopback()
                || value.is_link_local()
                || value.is_broadcast()
                || value.is_multicast()
                || value.is_unspecified()
                || value.octets()[0] == 0
        }
        IpAddr::V6(value) => {
            value.is_loopback()
                || value.is_unspecified()
                || value.is_multicast()
                || value.segments()[0] & 0xfe00 == 0xfc00
                || value.segments()[0] & 0xffc0 == 0xfe80
        }
    }
}

fn validation(message: &str) -> AppError {
    AppError::Validation {
        message: message.to_string(),
    }
}
