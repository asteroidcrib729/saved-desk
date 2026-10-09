//! Resolve and relink catalogued media only inside the user-selected folder.
use crate::catalog::{self, Result};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
};

pub fn root(db: &Connection) -> Result<PathBuf> {
    let selected = catalog::settings(db)?.download_folder;
    if !Path::new(&selected).is_absolute() {
        return Err("Choose a save folder in Settings.".into());
    }
    let root = PathBuf::from(selected).canonicalize().map_err(|_| "The selected save folder is unavailable. Reconnect the drive or choose its new location in Settings.")?;
    if !root.is_dir() {
        return Err("The selected save location is not a folder.".into());
    }
    Ok(root)
}
pub fn contained(root: &Path, path: &Path) -> Result<PathBuf> {
    let resolved = path.canonicalize().map_err(|_| "This file is missing. Move it into the selected save folder, then choose Find moved files in Settings.")?;
    if !resolved.starts_with(root) {
        return Err("Access is limited to the selected save folder. Move this content there and choose Find moved files in Settings.".into());
    }
    Ok(resolved)
}
pub fn ensure_destination(root: &Path, path: &Path) -> Result<PathBuf> {
    let relative=path.strip_prefix(root).map_err(|_| "This job points outside the selected save folder. Find moved files in Settings before retrying.")?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        let std::path::Component::Normal(name) = component else {
            return Err("This job has an unsafe folder path.".into());
        };
        current.push(name);
        if current.exists() {
            let meta = std::fs::symlink_metadata(&current)
                .map_err(|_| "The job folder could not be checked.")?;
            if meta.file_type().is_symlink() {
                return Err("A job folder link cannot be used safely.".into());
            }
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if meta.file_attributes() & 0x400 != 0 {
                    return Err("A job folder junction cannot be used safely.".into());
                }
            }
            contained(root, &current)?;
        } else {
            std::fs::create_dir(&current).map_err(|_| "The job folder could not be created.")?;
        }
        if !current.is_dir() {
            return Err("The job destination is not a folder.".into());
        }
    }
    contained(root, &current)
}
pub fn available(root: Option<&Path>, path: &str, bytes: i64) -> bool {
    let Some(root) = root else {
        return false;
    };
    bytes > 0
        && contained(root, Path::new(path)).is_ok_and(|p| {
            std::fs::metadata(p).is_ok_and(|m| m.is_file() && m.len() == bytes as u64)
        })
}
#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Repair {
    pub relinked: usize,
    pub available: usize,
    pub missing: usize,
    pub ambiguous: usize,
}

// Bounded, root-only inventory. Junctions/symlinks are never followed.
fn inventory(root: &Path) -> Result<HashMap<String, Vec<PathBuf>>> {
    let mut stack = vec![(root.to_path_buf(), 0)];
    let mut found = HashMap::<String, Vec<PathBuf>>::new();
    let mut count = 0;
    while let Some((directory, depth)) = stack.pop() {
        if depth > 32 {
            return Err("The folder structure is too deep to check safely. Select a more specific content folder.".into());
        }
        for entry in std::fs::read_dir(directory).map_err(|_| {
            "Part of the save folder could not be read. Check folder permissions before repairing."
        })? {
            let entry = entry.map_err(|_| "The save folder could not be checked completely.")?;
            count += 1;
            if count > 100_000 {
                return Err("This folder contains too many entries for one repair. Select a more specific content folder.".into());
            }
            if entry.file_name() == ".previews" || entry.file_name() == ".playback" {
                continue;
            }
            let kind = entry
                .file_type()
                .map_err(|_| "A folder entry could not be checked.")?;
            let Ok(path) = contained(root, &entry.path()) else {
                continue;
            };
            // Windows junctions may report themselves as directories, so require
            // the lexical path to resolve to itself (no directory aliases/cycles).
            if kind.is_symlink() || entry.path().canonicalize().ok() != Some(path.clone()) {
                continue;
            }
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if entry
                    .metadata()
                    .map_err(|_| "A file could not be checked.")?
                    .file_attributes()
                    & 0x400
                    != 0
                {
                    continue;
                }
            }
            if kind.is_dir() {
                stack.push((path, depth + 1));
            } else if kind.is_file() {
                let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                found.entry(name).or_default().push(path);
            }
        }
    }
    Ok(found)
}
pub fn repair(db: &mut Connection) -> Result<Repair> {
    let root = root(db)?;
    let active: i64 = db
        .query_row(
            "SELECT count(*) FROM download_jobs WHERE state IN ('queued','running')",
            [],
            |r| r.get(0),
        )
        .map_err(|_| "The download queue could not be checked.")?;
    if active > 0 {
        return Err(
            "Pause or finish downloads before changing or checking the save folder.".into(),
        );
    }
    let entries = {
        let mut q = db
            .prepare("SELECT m.id,m.path,m.bytes,m.job_id FROM media_files m ORDER BY m.id")
            .map_err(|_| "File history could not be checked.")?;
        let rows = q
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, String>(3)?,
                ))
            })
            .map_err(|_| "File history could not be read.")?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|_| "File history contains an invalid record.")?
    };
    let mut result = Repair::default();
    if entries.is_empty() {
        return Ok(result);
    }
    let inventory = inventory(&root)?;
    let mut reserved = HashSet::new();
    let mut identities = HashMap::new();
    for (_, path, bytes, _) in &entries {
        if let Some(name) = Path::new(path).file_name() {
            *identities
                .entry((name.to_string_lossy().to_ascii_lowercase(), *bytes))
                .or_insert(0usize) += 1;
        }
        if available(Some(&root), path, *bytes) {
            if let Ok(path) = contained(&root, Path::new(path)) {
                reserved.insert(path);
            }
        }
    }
    let transaction = db
        .transaction()
        .map_err(|_| "File repair could not start.")?;
    for (id, old, bytes, job) in &entries {
        if available(Some(&root), old, *bytes) {
            result.available += 1;
            continue;
        }
        let Some(name) = Path::new(old).file_name() else {
            result.missing += 1;
            continue;
        };
        let name = name.to_string_lossy().to_ascii_lowercase();
        let candidates: Vec<_> = inventory
            .get(&name)
            .into_iter()
            .flatten()
            .filter(|p| {
                !reserved.contains(*p)
                    && available(Some(&root), &p.to_string_lossy(), *bytes)
                    && crate::media::supported_content(p).is_ok()
            })
            .collect();
        let scoped: Vec<_> = candidates
            .iter()
            .copied()
            .filter(|p| {
                p.parent()
                    .and_then(Path::file_name)
                    .is_some_and(|v| v.to_string_lossy() == job.as_str())
            })
            .collect();
        let chosen = if scoped.len() == 1 {
            Some(scoped[0])
        } else if candidates.len() == 1 && identities.get(&(name, *bytes)) == Some(&1) {
            Some(candidates[0])
        } else {
            None
        };
        if let Some(path) = chosen {
            transaction
                .execute(
                    "UPDATE media_files SET path=?1 WHERE id=?2 AND path=?3",
                    params![path.to_string_lossy(), id, old],
                )
                .map_err(|_| {
                    "A moved file could not be relinked. No catalog changes were applied."
                })?;
            reserved.insert(path.clone());
            result.relinked += 1;
            result.available += 1;
        } else if candidates.is_empty() {
            result.missing += 1;
        } else {
            result.ambiguous += 1;
        }
    }
    // Rebase a tracked conversion original only alongside its identified output,
    // with matching recorded bytes and a valid video signature. Never scan other roots.
    let originals={
        let mut q=transaction.prepare("SELECT id,path,original_path,original_bytes FROM media_files WHERE original_path<>'' AND original_bytes>0").map_err(|_|"Originals could not be checked.")?;
        let rows=q.query_map([],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,i64>(3)?))).map_err(|_|"Originals could not be checked.")?;
        rows.collect::<std::result::Result<Vec<_>,_>>().map_err(|_|"Originals could not be checked.")?
    };
    for (id,output,old,bytes) in originals {
        if available(Some(&root),&old,bytes){continue;}
        let Ok(output)=contained(&root,Path::new(&output)) else {continue;};
        let Some(name)=Path::new(&old).file_name() else {continue;};
        let Some(parent)=output.parent() else {continue;};
        let candidate=parent.join(name);
        if available(Some(&root),&candidate.to_string_lossy(),bytes) && crate::media::supported_content(&candidate).is_ok_and(|kind|["video/mp4","video/webm"].contains(&kind)) {
            let candidate=contained(&root,&candidate)?;
            transaction.execute("UPDATE media_files SET original_path=?1 WHERE id=?2",params![candidate.to_string_lossy(),id]).map_err(|_|"The moved original could not be relinked.")?;
        }
    }
    // Keep resumed jobs and Open folder in the same authorized tree. A preserved
    // layout is preferred; flat moves work when a job's copies share one parent.
    let jobs = {
        let mut q = transaction
            .prepare("SELECT id,source,mode,destination FROM download_jobs")
            .map_err(|_| "Jobs could not be checked.")?;
        let rows = q
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                ))
            })
            .map_err(|_| "Jobs could not be read.")?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|_| "Job history is invalid.")?
    };
    for (job, source, mode, old) in jobs {
        if contained(&root, Path::new(&old)).is_ok() {
            continue;
        }
        let source = source.unwrap_or_else(|| ".saveddesk-samples".into());
        if !["instagram", "x", ".saveddesk-samples"].contains(&source.as_str())
            || !["new_only", "all_again"].contains(&mode.as_str())
        {
            continue;
        }
        let expected = root
            .join(source)
            .join(if mode == "all_again" {
                "re-downloads"
            } else {
                "downloads"
            })
            .join(&job);
        let mut parents = HashSet::new();
        let mut q = transaction
            .prepare("SELECT path FROM media_files WHERE job_id=?1")
            .map_err(|_| "Job files could not be checked.")?;
        let paths = q
            .query_map([&job], |r| r.get::<_, String>(0))
            .map_err(|_| "Job files could not be read.")?;
        for path in paths {
            if let Ok(path) = contained(
                &root,
                Path::new(&path.map_err(|_| "File history is invalid.")?),
            ) {
                if let Some(p) = path.parent() {
                    parents.insert(p.to_path_buf());
                }
            }
        }
        let destination = contained(&root, &expected).ok().or_else(|| {
            if parents.len() == 1 {
                parents.into_iter().next()
            } else {
                None
            }
        });
        if let Some(destination) = destination {
            transaction
                .execute(
                    "UPDATE download_jobs SET destination=?1 WHERE id=?2",
                    params![destination.to_string_lossy(), job],
                )
                .map_err(|_| "Job locations could not be updated.")?;
        }
    }
    transaction
        .commit()
        .map_err(|_| "File repair could not be committed.")?;
    Ok(result)
}

pub const MIN_FREE_BYTES: u64 = 256 * 1024 * 1024;
// Windows reports the bytes available to this user, including quota limits.
#[cfg(windows)]
pub fn free_bytes(folder: &Path) -> Result<u64> {
    let mut available = 0u64;
    let path = crate::platform::wide(&format!(
        "{}\\",
        crate::platform::shell_path(folder).trim_end_matches('\\')
    ));
    let ok = unsafe {
        windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW(
            path.as_ptr(),
            &mut available,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if ok == 0 {
        return Err("Free space could not be checked. Reconnect the drive or check folder permissions in Settings.".into());
    }
    Ok(available)
}
#[cfg(not(windows))]
pub fn free_bytes(_folder: &Path) -> Result<u64> {
    Err("Free-space checks require the Windows desktop app.".into())
}
pub fn require_space(bytes: u64) -> Result<()> {
    if bytes < MIN_FREE_BYTES {
        return Err("The selected save folder has less than 256 MiB free. Free some space or choose another folder in Settings, then retry. Completed files are preserved.".into());
    }
    Ok(())
}
pub fn download_ready(db: &Connection) -> Result<PathBuf> {
    let root = root(db)?;
    require_space(free_bytes(&root)?)?;
    Ok(root)
}
#[cfg(test)]
mod space_tests {
    use super::*;
    #[test]
    fn user_space_policy_handles_zero_boundary_and_large_volumes() {
        assert!(require_space(0).is_err());
        assert!(require_space(MIN_FREE_BYTES - 1).is_err());
        assert!(require_space(MIN_FREE_BYTES).is_ok());
        assert!(require_space(8 * 1024 * 1024 * 1024u64).is_ok());
    }
}
