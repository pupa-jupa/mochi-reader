use std::path::{Path, PathBuf};

use crate::{
    domain::error::{AppError, AppResult},
    import::detect::{DetectedFormat, detect_format},
};

/// Expands a user-selected path into importable works.
///
/// A directory whose top level contains images is a single manga work. Other
/// directories are treated as library roots and scanned recursively. Symlinks
/// are deliberately ignored so selecting a folder cannot escape into an
/// unrelated tree or recurse through a cycle.
pub fn expand_import_path(path: &Path) -> AppResult<Vec<PathBuf>> {
    if !path.exists() || path.is_file() {
        return Ok(vec![path.to_path_buf()]);
    }

    if matches!(detect_format(path), Ok(DetectedFormat::ImageFolder)) {
        return Ok(vec![path.to_path_buf()]);
    }

    let mut paths = Vec::new();
    scan_directory(path, &mut paths)?;
    paths.sort();
    paths.dedup();
    Ok(paths)
}

fn scan_directory(directory: &Path, paths: &mut Vec<PathBuf>) -> AppResult<()> {
    let mut entries = std::fs::read_dir(directory)?.collect::<Result<Vec<_>, _>>()?;
    entries.sort_by_key(std::fs::DirEntry::path);

    for entry in entries {
        let file_type = entry.file_type()?;
        if file_type.is_symlink() {
            continue;
        }

        let path = entry.path();
        if file_type.is_dir() {
            if matches!(detect_format(&path), Ok(DetectedFormat::ImageFolder)) {
                paths.push(path);
            } else {
                scan_directory(&path, paths)?;
            }
        } else if file_type.is_file() && detect_format(&path).is_ok() {
            paths.push(path);
        }
    }

    Ok(())
}

pub fn empty_folder_error(path: &Path) -> AppError {
    AppError::Validation {
        message: format!(
            "В папке «{}» не найдено поддерживаемых файлов.",
            path.display()
        ),
    }
}
