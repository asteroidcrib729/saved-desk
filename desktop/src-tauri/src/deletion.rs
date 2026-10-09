//! Confirmed ID-only deletion. Files are staged reversibly before the catalog commits.
use crate::{catalog::{self, Result}, storage, AppState};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{collections::{BTreeMap, HashSet}, path::{Path, PathBuf}, sync::Arc, time::{Duration, Instant}};
use tauri::State;

#[derive(Clone, Deserialize, Serialize, PartialEq)]
#[serde(tag="kind", content="id", rename_all="snake_case", deny_unknown_fields)]
pub enum Target { Post(i64), Posts(Vec<i64>), File(i64), Download(String), Collection(String) }
#[derive(Clone, Serialize)]
#[serde(rename_all="camelCase")]
pub struct Summary { pub token: String, pub files: usize, pub stored_files: usize, pub unavailable: usize, pub outside_folder: usize, pub downloads: usize, pub bytes: u64 }
#[derive(Clone, Serialize, PartialEq)]
struct Row { id:i64, post:i64, job:String, path:String, original:String, key:String }
#[derive(Clone, Serialize, PartialEq)]
struct Plan { target:Target, root:PathBuf, rows:Vec<Row>, jobs:Vec<String>, paths:BTreeMap<PathBuf,(String,u64,u128)>, outside:usize, unavailable:usize }
pub struct Pending { at:Instant, plan:Plan }
fn check_idle(db:&Connection)->Result<()> {
    let busy:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM download_jobs WHERE state IN ('queued','running'))",[],|r|r.get(0)).map_err(|_|"The queue could not be checked.")?;
    if busy {return Err("Pause or finish downloads before deleting saved content.".into());} Ok(())
}
fn plan(db:&Connection,target:Target)->Result<Plan> {
    check_idle(db)?;
    let root=storage::root(db)?;
    let target=match target {
        Target::Posts(mut ids)=>{
            if ids.is_empty() || ids.len()>100 || ids.iter().any(|id|*id<1) {return Err("Select between 1 and 100 posts on the current page.".into());}
            ids.sort_unstable();ids.dedup();Target::Posts(ids)
        },
        Target::Post(id)|Target::File(id) if id<1=>return Err("Choose a valid saved item.".into()),
        target=>target,
    };
    let (clause,value,jobs)=match &target {
        Target::Post(id)=> ("post_id=?1",id.to_string(),vec![]),
        Target::Posts(ids)=>{
            let value=serde_json::to_string(ids).map_err(|_|"Selected posts unavailable.")?;
            let count:i64=db.query_row("SELECT count(*) FROM posts WHERE id IN (SELECT value FROM json_each(?1))",[&value],|r|r.get(0)).map_err(|_|"Selected posts unavailable.")?;
            if count!=ids.len() as i64 {return Err("One of the selected posts is no longer in the library. Refresh and select again; nothing was deleted.".into());}
            ("post_id IN (SELECT value FROM json_each(?1))",value,vec![])
        },
        Target::File(id)=> ("id=?1",id.to_string(),vec![]),
        Target::Download(id)=> {
            let exists:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM download_jobs WHERE id=?1)",[id],|r|r.get(0)).map_err(|_|"Download unavailable.")?;
            if !exists {return Err("This download is no longer in your history.".into());}
            ("job_id=?1",id.clone(),vec![id.clone()])
        },
        Target::Collection(id)=> {
            let (source,account,target):(Option<String>,Option<String>,Option<String>)=db.query_row("SELECT source,account_id,target FROM download_jobs WHERE id=?1",[id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(|_|"Collection unavailable.")?;
            let (Some(source),Some(account),Some(target))=(source,account,target) else {return Err("Delete this test download individually.".into());};
            let mut stmt=db.prepare("SELECT id FROM download_jobs WHERE source=?1 AND account_id=?2 AND target=?3 ORDER BY id").map_err(|_|"Collection unavailable.")?;
            let jobs=stmt.query_map(params![source,account,target],|r|r.get::<_,String>(0)).map_err(|_|"Collection unavailable.")?.collect::<std::result::Result<Vec<_>,_>>().map_err(|_|"Collection unavailable.")?;
            ("job_id IN (SELECT b.id FROM download_jobs a JOIN download_jobs b ON a.source=b.source AND a.account_id=b.account_id AND a.target=b.target WHERE a.id=?1)",id.clone(),jobs)
        }
    };
    let mut stmt=db.prepare(&format!("SELECT id,post_id,job_id,path,original_path,file_key FROM media_files WHERE {clause} ORDER BY id LIMIT 10001")).map_err(|_|"Saved files unavailable.")?;
    let rows=stmt.query_map([value],|r|Ok(Row{id:r.get(0)?,post:r.get(1)?,job:r.get(2)?,path:r.get(3)?,original:r.get(4)?,key:r.get(5)?})).map_err(|_|"Saved files unavailable.")?.collect::<std::result::Result<Vec<_>,_>>().map_err(|_|"Saved files unavailable.")?;
    if rows.len()>10000 {return Err("Delete smaller downloads first; one deletion can contain up to 10,000 saved files.".into());}
    if rows.is_empty() && jobs.is_empty() {return Err("This saved item is no longer in the library.".into());}
    let selected:HashSet<i64>=rows.iter().map(|r|r.id).collect();
    let mut result=Plan{target,root,rows,jobs,paths:BTreeMap::new(),outside:0,unavailable:0};
    for row in &result.rows {
        for raw in [&row.path,&row.original] {
            if raw.is_empty() {continue;}
            // Preserve an original referenced by a different saved copy.
            let mut refs=db.prepare("SELECT id FROM media_files WHERE path=?1 OR original_path=?1").map_err(|_|"File ownership unavailable.")?;
            let shared=refs.query_map([raw],|r|r.get::<_,i64>(0)).map_err(|_|"File ownership unavailable.")?.any(|id|id.map_or(true,|id|!selected.contains(&id)));
            if shared {continue;}
            let candidate=Path::new(raw);
            if !candidate.exists() {result.unavailable+=1;continue;}
            let Ok(path)=storage::contained(&result.root,candidate) else {result.outside+=1;continue;};
            safe_directory(&result.root,path.parent().ok_or("A saved folder could not be checked.")?)?;
            if std::fs::symlink_metadata(candidate).map_err(|_|"A saved file could not be checked.")?.file_type().is_symlink(){return Err("File links cannot be deleted through the library. No files were deleted.".into());}
            let metadata=std::fs::metadata(&path).map_err(|_|"A saved file could not be checked.")?;
            if !metadata.is_file() {return Err("A saved path is not a file. Nothing was deleted.".into());}
            let stamp=metadata.modified().ok().and_then(|v|v.duration_since(std::time::UNIX_EPOCH).ok()).map(|v|v.as_nanos()).unwrap_or(0);
            result.paths.insert(path.clone(),(row.path.clone(),metadata.len(),stamp));
            if let Some(parent)=path.parent() {
                let name=path.file_name().unwrap().to_string_lossy();
                let mut extras=vec![parent.join(".previews").join(format!("{name}.jpg"))];
                let cache=parent.join(".playback");
                if cache.exists() {
                    let safe=storage::contained(&result.root,&cache)?;
                    for entry in std::fs::read_dir(safe).map_err(|_|"Playback copies could not be checked.")? {
                        let entry=entry.map_err(|_|"Playback copies could not be checked.")?;
                        let filename=entry.file_name().to_string_lossy().into_owned();
                        let fingerprint=|prefix:String|filename.strip_prefix(&prefix).and_then(|v|v.strip_suffix(".mp4")).is_some_and(|tail|{let parts:Vec<_>=tail.split('-').collect();parts.len()==2&&parts.iter().all(|p|!p.is_empty()&&p.bytes().all(|b|b.is_ascii_digit()))});
                        if fingerprint(format!("{}-",row.id)) || fingerprint(format!("{name}-")) {extras.push(entry.path());}
                    }
                }
                for extra in extras {
                    if !extra.exists(){continue;}
                    let extra=storage::contained(&result.root,&extra)?;
                    let meta=std::fs::metadata(&extra).map_err(|_|"A playback copy could not be checked.")?;
                    if !meta.is_file(){return Err("An associated cache path is not a file.".into());}
                    let stamp=meta.modified().ok().and_then(|v|v.duration_since(std::time::UNIX_EPOCH).ok()).map(|v|v.as_nanos()).unwrap_or(0);
                    result.paths.insert(extra,(row.path.clone(),meta.len(),stamp));
                }
            }
        }
    }
    if result.paths.len()>30000 {return Err("Too many associated files for one deletion. Delete smaller downloads first.".into());}
    Ok(result)
}
#[derive(Serialize,Deserialize)]
struct Entry { owner:String, relative:PathBuf, staged:String }
fn safe_directory(root:&Path,path:&Path)->Result<PathBuf> { storage::ensure_destination(root,path) }
// A interrupted pre-commit operation is restored; a committed deletion is completed.
pub fn recover(db:&Connection,root:&Path)->Result<()> {
    let base=root.join(".saveddesk-delete");
    if !base.exists(){return Ok(());}
    let base=safe_directory(root,&base)?;
    for directory in std::fs::read_dir(&base).map_err(|_|"Deletion recovery is unavailable.")? {
        let directory=directory.map_err(|_|"Deletion recovery is unavailable.")?;
        if uuid::Uuid::parse_str(&directory.file_name().to_string_lossy()).is_err(){continue;}
        let dir=safe_directory(root,&directory.path())?;
        let manifest=dir.join("manifest.json");
        if !manifest.exists(){continue;}
        let manifest=storage::contained(root,&manifest)?;
        if std::fs::metadata(&manifest).map_err(|_|"Deletion recovery unavailable.")?.len()>8*1024*1024{return Err("Deletion journal too large.".into());}
        let entries:Vec<Entry>=serde_json::from_slice(&std::fs::read(&manifest).map_err(|_|"Deletion recovery unavailable.")?).map_err(|_|"Deletion journal unreadable.")?;
        for entry in entries {
            if Path::new(&entry.staged).components().count()!=1 || !entry.staged.chars().all(|c|c.is_ascii_digit()) || entry.relative.is_absolute() || entry.relative.components().any(|c|!matches!(c,std::path::Component::Normal(_))) {return Err("Unsafe deletion journal rejected.".into());}
            let staged=dir.join(entry.staged);if !staged.exists(){continue;}
            let staged=storage::contained(root,&staged)?;
            let destination=root.join(&entry.relative);
            safe_directory(root,destination.parent().ok_or("Recovery folder unavailable.")?)?;
            let keep:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM media_files WHERE path=?1)",[entry.owner],|r|r.get(0)).map_err(|_|"Recovery history unavailable.")?;
            if keep {
                if destination.exists(){return Err("A recovery file already exists. No file was overwritten.".into());}
                std::fs::rename(staged,destination).map_err(|_|"Close the player or other apps using these files, then try deletion again to restore the interrupted operation.")?;
            } else {std::fs::remove_file(staged).map_err(|_|"The library was updated, but storage cleanup is pending. Close other apps using these files, then try again.")?;}
        }
        std::fs::remove_file(manifest).map_err(|_|"Deletion journal cleanup failed.")?;
        std::fs::remove_dir(dir).map_err(|_|"Deletion staging folder cleanup failed.")?;
    }
    let _=std::fs::remove_dir(base);Ok(())
}
fn remove(db:&mut Connection,expected:&Plan)->Result<()> {
    let current=plan(db,expected.target.clone())?;
    if current!=*expected {return Err("The files or save folder changed. Review deletion again; nothing was deleted.".into());}
    let dir=if current.paths.is_empty(){None}else{Some(safe_directory(&current.root,&current.root.join(".saveddesk-delete").join(uuid::Uuid::new_v4().to_string()))?)};
    if let Some(dir)=&dir {
        let entries:Vec<Entry>=current.paths.iter().enumerate().map(|(i,(path,(owner,_,_)))|Entry{owner:owner.clone(),relative:path.strip_prefix(&current.root).unwrap().to_path_buf(),staged:i.to_string()}).collect();
        let manifest=serde_json::to_vec(&entries).map_err(|_|"Deletion journal unavailable.")?;
        if manifest.len()>8*1024*1024 {let _=std::fs::remove_dir(dir);return Err("This deletion is too large to journal safely. Delete smaller downloads first; nothing was deleted.".into());}
        std::fs::write(dir.join("manifest.json"),manifest).map_err(|_|"Deletion journal could not be saved. Nothing was deleted.")?;
        for (i,path) in current.paths.keys().enumerate() {
            if std::fs::rename(path,dir.join(i.to_string())).is_err() {
                recover(db,&current.root)?;return Err("Close any viewer or other app using these files, then retry. Your library and files were preserved.".into());
            }
        }
    }
    let update=(||->Result<()>{
        let tx=db.transaction().map_err(|_|"The library is busy.")?;
        for row in &current.rows {
            tx.execute("DELETE FROM media_files WHERE id=?1",[row.id]).map_err(|_|"The saved file could not be removed.")?;
            tx.execute("DELETE FROM download_items WHERE job_id=?1 AND native_id=?2",params![row.job,row.key]).map_err(|_|"Download results could not be updated.")?;
            tx.execute("UPDATE download_jobs SET saved=(SELECT count(*) FROM media_files WHERE job_id=?1) WHERE id=?1",[&row.job]).map_err(|_|"Download history could not be updated.")?;
            tx.execute("DELETE FROM posts WHERE id=?1 AND NOT EXISTS(SELECT 1 FROM media_files WHERE post_id=?1)",[row.post]).map_err(|_|"The post could not be removed.")?;
            tx.execute("UPDATE posts SET collection=(SELECT j.title FROM media_files m JOIN download_jobs j ON j.id=m.job_id WHERE m.post_id=?1 ORDER BY j.created_at DESC,j.id DESC LIMIT 1),kind=CASE WHEN EXISTS(SELECT 1 FROM media_files WHERE post_id=?1 AND (lower(path) LIKE '%.mp4' OR lower(path) LIKE '%.mkv' OR lower(path) LIKE '%.webm')) THEN 'video' WHEN EXISTS(SELECT 1 FROM media_files WHERE post_id=?1 AND (lower(path) LIKE '%.m4a' OR lower(path) LIKE '%.mp3' OR lower(path) LIKE '%.wav' OR lower(path) LIKE '%.ogg' OR lower(path) LIKE '%.opus' OR lower(path) LIKE '%.flac' OR lower(path) LIKE '%.aac')) THEN 'audio' WHEN EXISTS(SELECT 1 FROM media_files WHERE post_id=?1 AND lower(path) NOT LIKE '%.txt' AND lower(path) NOT LIKE '%.m4a') THEN 'image' ELSE 'text' END WHERE id=?1",[row.post]).map_err(|_|"Post availability could not be updated.")?;
        }
        for job in &current.jobs {
            tx.execute("DELETE FROM download_items WHERE job_id=?1",[job]).map_err(|_|"Download results could not be removed.")?;
            tx.execute("DELETE FROM download_jobs WHERE id=?1",[job]).map_err(|_|"Download history could not be removed.")?;
        }
        tx.commit().map_err(|_|"The deletion could not be committed.".to_string())
    })();
    if update.is_err(){recover(db,&current.root)?;return update;}
    recover(db,&current.root)?;
    // Remove only empty parents, never a recursive collection folder deletion.
    let mut directories=HashSet::new();
    for path in current.paths.keys(){let mut parent=path.parent();while let Some(dir)=parent {if dir==current.root||!dir.starts_with(&current.root){break;}directories.insert(dir.to_path_buf());parent=dir.parent();}}
    let mut directories:Vec<_>=directories.into_iter().collect();directories.sort_by_key(|dir|std::cmp::Reverse(dir.components().count()));
    for dir in directories {let _=std::fs::remove_dir(dir);}Ok(())
}
#[tauri::command]
pub async fn prepare_deletion(target:Target,state:State<'_,Arc<AppState>>)->Result<Summary> {
    let state=state.inner().clone();tauri::async_runtime::spawn_blocking(move||{
        let _gate=state.worker_gate.try_lock().map_err(|_|"Pause or finish downloads and video preparation before deleting content.")?;
        let db=catalog::open(&state.database)?;let root=storage::root(&db)?;recover(&db,&root)?;
        let plan=plan(&db,target)?;
        let token=uuid::Uuid::new_v4().to_string();
        let summary=Summary{token:token.clone(),files:plan.rows.len(),stored_files:plan.paths.len(),unavailable:plan.unavailable,outside_folder:plan.outside,downloads:plan.jobs.len(),bytes:plan.paths.values().map(|(_,size,_)|*size).sum()};
        let mut pending=state.deletions.lock().map_err(|_|"Deletion confirmation unavailable.")?;
        pending.retain(|_,p|p.at.elapsed()<Duration::from_secs(300));if pending.len()>=16{pending.clear();}
        pending.insert(token,Pending{at:Instant::now(),plan});Ok(summary)
    }).await.map_err(|_|"The deletion could not be checked.".to_string())?
}
#[tauri::command]
pub async fn delete_saved_content(token:String,state:State<'_,Arc<AppState>>)->Result<()> {
    let state=state.inner().clone();tauri::async_runtime::spawn_blocking(move||{
        let _gate=state.worker_gate.try_lock().map_err(|_|"Pause or finish downloads and video preparation before deleting content.")?;
        let pending=state.deletions.lock().map_err(|_|"Deletion confirmation unavailable.")?.remove(&token).ok_or("This deletion confirmation expired. Review it again.")?;
        if pending.at.elapsed()>Duration::from_secs(300){return Err("This deletion confirmation expired. Review it again.".into());}
        let mut db=catalog::open(&state.database)?;remove(&mut db,&pending.plan)?;
        for job in &pending.plan.jobs {if uuid::Uuid::parse_str(job).is_ok(){if let Some(parent)=state.database.parent(){let secret=parent.join(format!("attachment-{job}.dpapi"));if secret.exists(){std::fs::remove_file(secret).map_err(|_|"Saved content was deleted, but its protected attachment access could not be cleaned up.")?;}}}}
        Ok(())
    }).await.map_err(|_|"Deletion could not finish.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture()->(tempfile::TempDir,Connection,PathBuf,i64,i64){
        let dir=tempfile::tempdir().unwrap();let root=dir.path().join("saved");std::fs::create_dir(&root).unwrap();let root=root.canonicalize().unwrap();
        let database=dir.path().join("catalog.db");catalog::initialize(&database,root.to_str().unwrap()).unwrap();let mut db=catalog::open(&database).unwrap();
        for (job,target) in [("first","target"),("second","target"),("other","another")]{db.execute("INSERT INTO download_jobs(id,title,mode,state,destination,created_at,source,account_id,target) VALUES(?1,'Collection','new_only','completed',?2,'now','instagram','42',?3)",params![job,root.to_string_lossy(),target]).unwrap();}
        let mut ids=vec![];
        for job in ["first","second"]{let file=root.join(format!("{job}.mp4"));std::fs::write(&file,b"video").unwrap();let detail=serde_json::json!({"item_id":job,"native_id":"post","kind":"video"});catalog::record_live(&mut db,job,"instagram","42",&detail,&file,5,"original","original").unwrap();ids.push(db.last_insert_rowid());}
        let post=db.query_row("SELECT id FROM posts",[],|r|r.get::<_,i64>(0)).unwrap();let first=db.query_row("SELECT id FROM media_files WHERE job_id='first'",[],|r|r.get::<_,i64>(0)).unwrap();
        std::fs::write(root.join("unrelated.txt"),b"keep").unwrap();(dir,db,root,post,first)
    }
    #[test] fn individual_file_keeps_other_copy_and_unrelated_storage(){let (_d,mut db,root,post,id)=fixture();let p=plan(&db,Target::File(id)).unwrap();remove(&mut db,&p).unwrap();assert!(!root.join("first.mp4").exists());assert!(root.join("second.mp4").exists());assert!(root.join("unrelated.txt").exists());assert_eq!(db.query_row("SELECT count(*) FROM posts WHERE id=?1",[post],|r|r.get::<_,i64>(0)).unwrap(),1);assert_eq!(db.query_row("SELECT saved FROM download_jobs WHERE id='first'",[],|r|r.get::<_,i64>(0)).unwrap(),0);}
    #[test] fn collection_deletes_all_its_jobs_but_not_other_history(){let (_d,mut db,root,_,_)=fixture();let p=plan(&db,Target::Collection("first".into())).unwrap();assert_eq!(p.jobs.len(),2);remove(&mut db,&p).unwrap();assert!(!root.join("first.mp4").exists());assert!(!root.join("second.mp4").exists());assert_eq!(db.query_row("SELECT count(*) FROM download_jobs",[],|r|r.get::<_,i64>(0)).unwrap(),1);assert_eq!(db.query_row("SELECT count(*) FROM posts",[],|r|r.get::<_,i64>(0)).unwrap(),0);assert!(root.join("unrelated.txt").exists());}
    #[test] fn post_removes_originals_and_caches_only_for_selected_copies(){let (_d,mut db,root,post,id)=fixture();let original=root.join("raw.webm");std::fs::write(&original,b"raw").unwrap();db.execute("UPDATE media_files SET original_path=?1 WHERE id=?2",params![original.to_string_lossy(),id]).unwrap();std::fs::create_dir(root.join(".previews")).unwrap();std::fs::write(root.join(".previews/first.mp4.jpg"),b"preview").unwrap();std::fs::create_dir(root.join(".playback")).unwrap();std::fs::write(root.join(format!(".playback/{id}-5-1.mp4")),b"cache").unwrap();std::fs::write(root.join(".playback/unrelated.mp4"),b"keep").unwrap();let p=plan(&db,Target::Post(post)).unwrap();assert_eq!(p.paths.len(),5);remove(&mut db,&p).unwrap();assert!(!original.exists());assert!(!root.join(".previews/first.mp4.jpg").exists());assert!(root.join(".playback/unrelated.mp4").exists());}
    #[test] fn active_queue_and_stale_confirmation_are_rejected(){let (_d,mut db,root,post,_)=fixture();let p=plan(&db,Target::Post(post)).unwrap();std::fs::write(root.join("first.mp4"),b"changed").unwrap();assert!(remove(&mut db,&p).unwrap_err().contains("changed"));assert!(root.join("second.mp4").exists());db.execute("UPDATE download_jobs SET state='running' WHERE id='first'",[]).unwrap();assert!(plan(&db,Target::Post(post)).err().unwrap().contains("Pause"));}
    #[test] fn batch_posts_remove_only_selected_posts_with_one_transaction(){
        let (_dir,mut db,root,post,_)=fixture();
        let other=post+100;db.execute("INSERT INTO posts(id,source,account_id,native_id,creator,caption,kind,collection,saved_at) SELECT ?1,source,account_id,'other-batch',creator,caption,kind,collection,saved_at FROM posts WHERE id=?2",params![other,post]).unwrap();
        std::fs::write(root.join("other.mp4"),b"keep").unwrap();
        db.execute("INSERT INTO media_files(post_id,job_id,path,bytes,file_key,quality,profile) SELECT ?1,job_id,?2,4,'other-batch',quality,profile FROM media_files LIMIT 1",params![other,root.join("other.mp4").to_string_lossy()]).unwrap();
        let p=plan(&db,Target::Posts(vec![post,post])).unwrap();assert_eq!(p.rows.len(),2);
        assert!(p.target==Target::Posts(vec![post]));remove(&mut db,&p).unwrap();
        assert_eq!(db.query_row("SELECT count(*) FROM posts",[],|r|r.get::<_,i64>(0)).unwrap(),1);assert!(root.join("other.mp4").is_file());
    }
    #[test] fn batch_input_and_stale_selection_fail_before_staging(){
        let (_dir,db,root,post,_)=fixture();
        for ids in [vec![],vec![0],vec![-1],vec![post;101],vec![post,post+999]] {assert!(plan(&db,Target::Posts(ids)).is_err());}
        assert!(root.join("first.mp4").exists());assert!(!root.join(".saveddesk-delete").exists());
    }
    #[test] fn batch_spans_posts_and_rolls_back_all_files_on_catalog_failure(){
        let (_dir,mut db,root,post,_)=fixture();let second=post+100;
        db.execute("INSERT INTO posts(id,source,account_id,native_id,creator,caption,kind,collection,saved_at) SELECT ?1,source,account_id,'second-batch',creator,caption,kind,collection,saved_at FROM posts WHERE id=?2",params![second,post]).unwrap();
        db.execute("UPDATE media_files SET post_id=?1 WHERE path=?2",params![second,root.join("second.mp4").to_string_lossy()]).unwrap();
        let p=plan(&db,Target::Posts(vec![second,post])).unwrap();assert_eq!(p.rows.len(),2);
        db.execute_batch("CREATE TRIGGER deny_batch BEFORE DELETE ON media_files BEGIN SELECT RAISE(ABORT,'fixture failure'); END;").unwrap();assert!(remove(&mut db,&p).is_err());
        assert!(root.join("first.mp4").is_file());assert!(root.join("second.mp4").is_file());
        assert_eq!(db.query_row("SELECT count(*) FROM posts",[],|r|r.get::<_,i64>(0)).unwrap(),2);
        db.execute_batch("DROP TRIGGER deny_batch").unwrap();let p=plan(&db,Target::Posts(vec![post,second])).unwrap();remove(&mut db,&p).unwrap();assert_eq!(db.query_row("SELECT count(*) FROM posts",[],|r|r.get::<_,i64>(0)).unwrap(),0);
    }
    #[test] fn outside_folder_files_are_retained_and_missing_records_can_be_deleted(){let (dir,mut db,root,post,id)=fixture();let outside=dir.path().join("outside.mp4");std::fs::write(&outside,b"keep").unwrap();db.execute("UPDATE media_files SET path=?1 WHERE id=?2",params![outside.to_string_lossy(),id]).unwrap();std::fs::remove_file(root.join("second.mp4")).unwrap();let p=plan(&db,Target::Post(post)).unwrap();assert_eq!(p.outside,1);assert_eq!(p.unavailable,1);remove(&mut db,&p).unwrap();assert_eq!(std::fs::read(outside).unwrap(),b"keep");}
    #[test] fn catalog_failure_restores_staged_files(){let (_d,mut db,root,post,_)=fixture();db.execute_batch("CREATE TRIGGER deny_deletion BEFORE DELETE ON media_files BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();let p=plan(&db,Target::Post(post)).unwrap();assert!(remove(&mut db,&p).is_err());assert_eq!(std::fs::read(root.join("first.mp4")).unwrap(),b"video");assert_eq!(std::fs::read(root.join("second.mp4")).unwrap(),b"video");assert!(!root.join(".saveddesk-delete").exists());}
    #[test] fn interrupted_staging_recovers_before_commit_and_purges_after_commit(){let (_d,db,root,_,id)=fixture();for committed in [false,true]{let dir=safe_directory(&root,&root.join(".saveddesk-delete").join(uuid::Uuid::new_v4().to_string())).unwrap();let source=root.join("first.mp4");let entry=Entry{owner:source.to_string_lossy().into(),relative:"first.mp4".into(),staged:"0".into()};std::fs::write(dir.join("manifest.json"),serde_json::to_vec(&vec![entry]).unwrap()).unwrap();std::fs::rename(&source,dir.join("0")).unwrap();if committed {db.execute("DELETE FROM media_files WHERE id=?1",[id]).unwrap();}recover(&db,&root).unwrap();assert_eq!(source.exists(),!committed);assert!(!dir.exists());}}
    #[test] fn moved_conversion_original_is_relinked_and_deleted_with_its_output(){
        let (dir,mut db,root,_,id)=fixture();let payload=b"\0\0\0\x18ftypisom00000000";
        for name in ["first.mp4","second.mp4","raw.mp4"]{std::fs::write(root.join(name),payload).unwrap();}
        db.execute("UPDATE media_files SET bytes=?1",[payload.len() as i64]).unwrap();
        db.execute("UPDATE media_files SET original_path=?1,original_bytes=?2 WHERE id=?3",params![root.join("raw.mp4").to_string_lossy(),payload.len() as i64,id]).unwrap();
        let moved=dir.path().join("moved");std::fs::rename(&root,&moved).unwrap();let moved=moved.canonicalize().unwrap();let mut settings=catalog::settings(&db).unwrap();settings.download_folder=moved.to_string_lossy().into();db.execute("UPDATE settings SET value=?1",[serde_json::to_string(&settings).unwrap()]).unwrap();
        assert_eq!(storage::repair(&mut db).unwrap().relinked,2);
        assert_eq!(db.query_row("SELECT original_path FROM media_files WHERE id=?1",[id],|r|r.get::<_,String>(0)).unwrap(),moved.join("raw.mp4").to_string_lossy());
        let p=plan(&db,Target::File(id)).unwrap();remove(&mut db,&p).unwrap();assert!(!moved.join("raw.mp4").exists());assert!(moved.join("second.mp4").exists());
    }
    #[cfg(windows)] #[test] fn locked_file_rolls_back_other_staged_files(){use std::os::windows::fs::OpenOptionsExt;let (_d,mut db,root,post,_)=fixture();let locked=std::fs::OpenOptions::new().read(true).share_mode(0).open(root.join("second.mp4")).unwrap();let p=plan(&db,Target::Post(post)).unwrap();assert!(remove(&mut db,&p).is_err());assert!(root.join("first.mp4").exists());drop(locked);assert!(root.join("second.mp4").exists());assert_eq!(db.query_row("SELECT count(*) FROM media_files",[],|r|r.get::<_,i64>(0)).unwrap(),2);}
}
