use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

use reqwest::{Client, header};
use url::Url;

use crate::{
    domain::error::{AppError, AppResult},
    sources::http_policy::HttpPolicy,
};

#[derive(Debug, Clone, Copy)]
pub enum ExpectedContent {
    Json,
    Html,
    Image,
}

pub struct SourceHttpClient {
    policy: HttpPolicy,
    client: Client,
}

impl SourceHttpClient {
    pub async fn new(policy: HttpPolicy) -> AppResult<Self> {
        let host = policy
            .base_url()
            .host_str()
            .ok_or_else(|| validation("В URL источника отсутствует домен."))?
            .to_string();
        let port = policy.base_url().port_or_known_default().unwrap_or(443);
        let mut addresses = tokio::net::lookup_host((host.as_str(), port))
            .await
            .map_err(|_| validation("Не удалось определить адрес источника."))?
            .filter(|address| policy.allows_ip(address.ip()))
            .collect::<Vec<SocketAddr>>();
        addresses.sort_unstable();
        addresses.dedup();
        if addresses.is_empty() {
            return Err(validation(
                "Источник указывает на локальный или служебный адрес.",
            ));
        }

        let redirect_policy = policy.clone();
        let client = Client::builder()
            .no_proxy()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(15))
            .user_agent("MochiReader/0.1 (+local desktop reader)")
            .redirect(reqwest::redirect::Policy::custom(move |attempt| {
                if attempt.previous().len() >= 3 {
                    return attempt.stop();
                }
                if redirect_policy.ensure_allowed(attempt.url()).is_ok() {
                    attempt.follow()
                } else {
                    attempt.stop()
                }
            }))
            .resolve_to_addrs(&host, &addresses)
            .build()
            .map_err(|_| validation("Не удалось подготовить безопасное подключение."))?;
        Ok(Self { policy, client })
    }

    pub async fn get(
        &self,
        url: &Url,
        expected: ExpectedContent,
        max_bytes: usize,
    ) -> AppResult<(Vec<u8>, String)> {
        self.policy.ensure_allowed(url)?;
        rate_limit(self.policy.base_url().origin().ascii_serialization()).await;
        let accept = match expected {
            ExpectedContent::Json => "application/json",
            ExpectedContent::Html => "text/html,application/xhtml+xml",
            ExpectedContent::Image => "image/avif,image/webp,image/png,image/jpeg",
        };
        let response = self
            .client
            .get(url.clone())
            .header(header::ACCEPT, accept)
            .send()
            .await
            .map_err(|_| validation("Источник не ответил вовремя или недоступен."))?;
        if !response.status().is_success() {
            return Err(validation(&format!(
                "Источник вернул HTTP {}.",
                response.status().as_u16()
            )));
        }
        if response
            .content_length()
            .is_some_and(|length| length > max_bytes as u64)
        {
            return Err(validation("Ответ источника превышает допустимый размер."));
        }
        let media_type = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .split(';')
            .next()
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase();
        validate_media_type(&media_type, expected)?;
        let bytes = response
            .bytes()
            .await
            .map_err(|_| validation("Не удалось прочитать ответ источника."))?;
        if bytes.len() > max_bytes {
            return Err(validation("Ответ источника превышает допустимый размер."));
        }
        Ok((bytes.to_vec(), media_type))
    }
}

fn validate_media_type(media_type: &str, expected: ExpectedContent) -> AppResult<()> {
    let valid = match expected {
        ExpectedContent::Json => media_type == "application/json" || media_type.ends_with("+json"),
        ExpectedContent::Html => media_type == "text/html" || media_type == "application/xhtml+xml",
        ExpectedContent::Image => media_type.starts_with("image/"),
    };
    if !valid {
        return Err(validation("Источник вернул неожиданный Content-Type."));
    }
    Ok(())
}

async fn rate_limit(origin: String) {
    static LAST_REQUESTS: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
    const INTERVAL: Duration = Duration::from_millis(250);
    let registry = LAST_REQUESTS.get_or_init(|| Mutex::new(HashMap::new()));
    let wait = {
        let mut values = registry
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let now = Instant::now();
        let earliest = values.get(&origin).copied().unwrap_or(now);
        let scheduled = earliest.max(now);
        values.insert(origin, scheduled + INTERVAL);
        scheduled.saturating_duration_since(now)
    };
    if !wait.is_zero() {
        tokio::time::sleep(wait).await;
    }
}

fn validation(message: &str) -> AppError {
    AppError::Validation {
        message: message.to_string(),
    }
}
