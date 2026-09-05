//! App-owned media. Chunks avoid sending whole videos across IPC or keeping
//! them in JS memory. A staging file is renamed only after its contents sync.
use std::{fs::{self, File, OpenOptions}, io::{Read, Seek, SeekFrom, Write}, path::{Path, PathBuf}};
use tauri::Manager;

fn path(root: &Path, id: &str, staging: bool) -> Result<PathBuf, String> {
    if id.len() != 36 || !id.bytes().all(|c| c.is_ascii_hexdigit() || c == b'-') {
        return Err("invalid: Invalid media identifier".into());
    }
    Ok(root.join(format!("{}.{}", id, if staging { "part" } else { "bin" })))
}

fn root<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let root = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("media");
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root)
}

fn write_chunk(root: &Path, id: &str, offset: u64, bytes: &[u8]) -> Result<(), String> {
    if bytes.is_empty() || bytes.len() > 1024 * 1024 { return Err("invalid: Invalid chunk size".into()); }
    let mut file = if offset == 0 {
        OpenOptions::new().create_new(true).write(true).open(path(root, id, true)?)
    } else {
        OpenOptions::new().write(true).open(path(root, id, true)?)
    }.map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() != offset { return Err("invalid: Unexpected chunk offset".into()); }
    file.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())
}

fn commit(root: &Path, id: &str, size: u64) -> Result<(), String> {
    let source = path(root, id, true)?;
    let file = OpenOptions::new().write(true).open(&source).map_err(|e| e.to_string())?;
    if size == 0 || file.metadata().map_err(|e| e.to_string())?.len() != size { return Err("invalid: Incomplete media copy".into()); }
    file.sync_all().map_err(|e| e.to_string())?;
    fs::rename(source, path(root, id, false)?).map_err(|e| e.to_string())?;
    File::open(root).and_then(|dir| dir.sync_all()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn media_write<R: tauri::Runtime>(app: tauri::AppHandle<R>, id: String, offset: u64, bytes: Vec<u8>) -> Result<(), String> {
    write_chunk(&root(&app)?, &id, offset, &bytes)
}

#[tauri::command]
pub async fn media_commit<R: tauri::Runtime>(app: tauri::AppHandle<R>, id: String, size: u64) -> Result<(), String> {
    commit(&root(&app)?, &id, size)
}

#[tauri::command]
pub async fn media_read<R: tauri::Runtime>(app: tauri::AppHandle<R>, id: String, offset: u64, length: usize) -> Result<tauri::ipc::Response, String> {
    if length == 0 || length > 16 * 1024 * 1024 { return Err("invalid: Invalid read size".into()); }
    let mut file = File::open(path(&root(&app)?, &id, false)?).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound { "MEDIA_NEEDS_RESELECT: Saved media is missing".into() } else { e.to_string() }
    })?;
    file.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
    let mut bytes = vec![0; length];
    file.read_exact(&mut bytes).map_err(|_| "MEDIA_NEEDS_RESELECT: Saved media is incomplete".to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub async fn media_remove<R: tauri::Runtime>(app: tauri::AppHandle<R>, id: String) -> Result<(), String> {
    let root = root(&app)?;
    for staging in [true, false] {
        if let Err(error) = fs::remove_file(path(&root, &id, staging)?) {
            if error.kind() != std::io::ErrorKind::NotFound { return Err(error.to_string()); }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn media_prune<R: tauri::Runtime>(app: tauri::AppHandle<R>, retained_ids: Vec<String>) -> Result<(), String> {
    let root = root(&app)?;
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())?.flatten() {
        let entry_path = entry.path();
        let Some(id) = entry_path.file_stem().and_then(|name| name.to_str()) else { continue };
        let extension = entry_path.extension().and_then(|name| name.to_str());
        if !matches!(extension, Some("part" | "bin")) || path(&root, id, false).is_err() || retained_ids.iter().any(|kept| kept == id) { continue; }
        if entry.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok()).is_some_and(|age| age.as_secs() > 86400) {
            let _ = fs::remove_file(entry_path);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    const ID: &str = "12345678-1234-1234-1234-123456789abc";
    #[test]
    fn rejects_paths_and_commits_only_complete_media() {
        let root = std::env::temp_dir().join(format!("pointfinder-media-test-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        assert!(path(&root, "../../secret", false).is_err());
        write_chunk(&root, ID, 0, b"first").unwrap();
        assert!(!path(&root, ID, false).unwrap().exists());
        assert!(commit(&root, ID, 10).is_err());
        assert!(write_chunk(&root, ID, 2, b"bad").is_err());
        write_chunk(&root, ID, 5, b"last").unwrap();
        commit(&root, ID, 9).unwrap();
        assert_eq!(fs::read(path(&root, ID, false).unwrap()).unwrap(), b"firstlast");
        fs::remove_dir_all(root).unwrap();
    }
}
