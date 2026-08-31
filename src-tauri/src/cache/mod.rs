use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use rusqlite::Connection;
use serde::Serialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    database::cache_repository::{CacheRecord, CacheRepository},
    domain::error::{AppError, AppResult},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CachedImage {
    pub bytes: Vec<u8>,
    pub media_type: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheStats {
    pub total_bytes: u64,
    pub pinned_bytes: u64,
    pub entry_count: usize,
}

pub struct CacheManager<'connection> {
    repository: CacheRepository<'connection>,
    root: PathBuf,
}

impl<'connection> CacheManager<'connection> {
    pub fn new(connection: &'connection Connection, root: &Path) -> AppResult<Self> {
        fs::create_dir_all(root)?;
        Ok(Self {
            repository: CacheRepository::new(connection),
            root: root.to_path_buf(),
        })
    }

    pub fn get(&self, source_id: &str, page_url: &str) -> AppResult<Option<CachedImage>> {
        let Some(record) = self.repository.get(source_id, page_url)? else {
            return Ok(None);
        };
        let path = self.record_path(&record)?;
        let bytes = match fs::read(path) {
            Ok(bytes) if bytes.len() as u64 == record.size_bytes => bytes,
            _ => {
                self.repository.remove(&record.cache_key)?;
                return Ok(None);
            }
        };
        self.repository.touch(&record.cache_key)?;
        Ok(Some(CachedImage {
            bytes,
            media_type: record.media_type,
        }))
    }

    #[allow(clippy::too_many_arguments)]
    pub fn store(
        &self,
        source_id: &str,
        page_url: &str,
        bytes: &[u8],
        media_type: &str,
        pinned: bool,
        limit_bytes: Option<u64>,
    ) -> AppResult<()> {
        let cache_key = cache_key(source_id, page_url);
        let extension = media_extension(media_type)?;
        let file_name = format!("{cache_key}-{}.{}", Uuid::new_v4(), extension);
        let destination = self.root.join(&file_name);
        let temporary = self.root.join(format!(".{file_name}.tmp"));
        let mut temporary_guard = TemporaryFileGuard::new(temporary.clone());
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        fs::rename(&temporary, &destination)?;
        temporary_guard.disarm();

        let now = chrono::Utc::now().to_rfc3339();
        let record = CacheRecord {
            cache_key,
            source_id: source_id.to_string(),
            page_url: page_url.to_string(),
            file_name,
            media_type: media_type.to_string(),
            size_bytes: bytes.len() as u64,
            pinned,
            created_at: now.clone(),
            last_accessed_at: now,
        };
        match self.repository.upsert(&record) {
            Ok(previous) => {
                if let Some(previous) = previous.filter(|value| value != &record.file_name) {
                    remove_file_if_present(&self.root.join(previous))?;
                }
            }
            Err(error) => {
                remove_file_if_present(&destination)?;
                return Err(error);
            }
        }
        self.enforce_quota(limit_bytes, Some(&record.cache_key))
    }

    pub fn stats(&self) -> AppResult<CacheStats> {
        let (total_bytes, pinned_bytes, entry_count) = self.repository.totals()?;
        Ok(CacheStats {
            total_bytes,
            pinned_bytes,
            entry_count,
        })
    }

    pub fn pin(&self, source_id: &str, page_url: &str) -> AppResult<bool> {
        let Some(record) = self.repository.get(source_id, page_url)? else {
            return Ok(false);
        };
        if !self.record_path(&record)?.is_file() {
            self.repository.remove(&record.cache_key)?;
            return Ok(false);
        }
        self.repository.set_pinned(&record.cache_key)
    }

    pub fn clear_transient(&self) -> AppResult<()> {
        for record in self.repository.records(true)? {
            remove_file_if_present(&self.record_path(&record)?)?;
            self.repository.remove(&record.cache_key)?;
        }
        Ok(())
    }

    pub fn clear_all(&self) -> AppResult<()> {
        for record in self.repository.records(false)? {
            remove_file_if_present(&self.record_path(&record)?)?;
            self.repository.remove(&record.cache_key)?;
        }
        Ok(())
    }

    pub fn clear_source(&self, source_id: &str) -> AppResult<()> {
        for record in self.repository.records_for_source(source_id)? {
            remove_file_if_present(&self.record_path(&record)?)?;
            self.repository.remove(&record.cache_key)?;
        }
        Ok(())
    }

    fn enforce_quota(&self, limit_bytes: Option<u64>, active_key: Option<&str>) -> AppResult<()> {
        let Some(limit_bytes) = limit_bytes else {
            return Ok(());
        };
        let mut total = self.repository.totals()?.0;
        if total <= limit_bytes {
            return Ok(());
        }
        for record in self.repository.records(true)? {
            if total <= limit_bytes {
                break;
            }
            if active_key.is_some_and(|key| key == record.cache_key) {
                continue;
            }
            remove_file_if_present(&self.record_path(&record)?)?;
            self.repository.remove(&record.cache_key)?;
            total = total.saturating_sub(record.size_bytes);
        }
        if total > limit_bytes {
            for record in self.repository.records(true)? {
                if total <= limit_bytes {
                    break;
                }
                remove_file_if_present(&self.record_path(&record)?)?;
                self.repository.remove(&record.cache_key)?;
                total = total.saturating_sub(record.size_bytes);
            }
        }
        Ok(())
    }

    fn record_path(&self, record: &CacheRecord) -> AppResult<PathBuf> {
        let file_name = Path::new(&record.file_name);
        if file_name.file_name() != Some(file_name.as_os_str()) {
            return Err(validation("Индекс кэша содержит небезопасный путь."));
        }
        Ok(self.root.join(file_name))
    }
}

struct TemporaryFileGuard {
    path: PathBuf,
    armed: bool,
}

impl TemporaryFileGuard {
    fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for TemporaryFileGuard {
    fn drop(&mut self) {
        if self.armed {
            let _ = fs::remove_file(&self.path);
        }
    }
}

fn cache_key(source_id: &str, page_url: &str) -> String {
    let mut hash = Sha256::new();
    hash.update(source_id.as_bytes());
    hash.update([0]);
    hash.update(page_url.as_bytes());
    hash.finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn media_extension(media_type: &str) -> AppResult<&'static str> {
    match media_type {
        "image/jpeg" => Ok("jpg"),
        "image/png" => Ok("png"),
        "image/webp" => Ok("webp"),
        "image/avif" => Ok("avif"),
        "image/gif" => Ok("gif"),
        _ => Err(validation("Неподдерживаемый формат изображения для кэша.")),
    }
}

fn remove_file_if_present(path: &Path) -> AppResult<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn validation(message: &str) -> AppError {
    AppError::Validation {
        message: message.to_string(),
    }
}
