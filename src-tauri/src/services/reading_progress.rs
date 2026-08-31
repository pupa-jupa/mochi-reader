use rusqlite::Connection;

use crate::{
    database::progress_repository::ProgressRepository,
    domain::{
        error::AppResult,
        reader::{ProgressUpdate, ReadingProgress},
    },
};

pub struct ReadingProgressService<'connection> {
    repository: ProgressRepository<'connection>,
}

impl<'connection> ReadingProgressService<'connection> {
    pub fn new(connection: &'connection Connection) -> Self {
        Self {
            repository: ProgressRepository::new(connection),
        }
    }

    pub fn get_for_work(&self, work_id: &str) -> AppResult<Option<ReadingProgress>> {
        self.repository.get(work_id)
    }

    pub fn get_by_content_identity(
        &self,
        content_identity: &str,
    ) -> AppResult<Option<ReadingProgress>> {
        self.repository.get_by_content_identity(content_identity)
    }

    pub fn save(&self, update: &ProgressUpdate) -> AppResult<ReadingProgress> {
        self.repository.save(update)
    }
}
