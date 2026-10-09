"use client";
import { useEffect,useRef,useState } from "react";
import { bridge } from "@/lib/desktop-bridge";
import type { DeletionTarget,DeletionSummary } from "@/lib/contracts";
import { ScrollArea } from "./scroll-area";
export function DeleteContentDialog({target,close,beforeDelete,refresh,report}:{target:DeletionTarget|null;close:()=>void;beforeDelete:()=>Promise<void>;refresh:()=>Promise<void>;report:(message:string)=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [summary,setSummary]=useState<DeletionSummary|null>(null);
  const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  useEffect(()=>{let disposed=false;setSummary(null);setError("");
    if(target){dialog.current?.showModal();bridge.prepareDeletion(target).then(value=>{if(!disposed)setSummary(value);}).catch(failure=>{if(!disposed)setError(String(failure));});}
    else dialog.current?.close();return()=>{disposed=true;};
  },[target]);
  async function remove(){if(!summary||busy)return;setBusy(true);setError("");try{
    await beforeDelete();await bridge.deleteSavedContent(summary.token);await refresh();report("Saved content deleted.");close();
  }catch(failure){setError(String(failure));setSummary(null);await refresh().catch(()=>{});}finally{setBusy(false);}}
  const name=target?.kind==="post"?"post and every saved copy":target?.kind==="file"?"saved file":target?.kind==="collection"?"collection and all its downloads":"download and its saved files";
  return <dialog ref={dialog} className="confirm-dialog delete-dialog" aria-labelledby="delete-title" onCancel={event=>{event.preventDefault();if(!busy)close();}}>
    <ScrollArea className="dialog-scroll" label="Deletion confirmation"><div className="dialog-content">
      <h2 id="delete-title">{target?.kind==="posts"?`Delete ${target.id.length} selected ${target.id.length===1?"post":"posts"} and every saved copy?`:`Delete this ${name}?`}</h2>
      {!summary&&!error&&<p role="status">Checking saved files...</p>}
      {summary&&<><p>{summary.files} saved {summary.files===1?"copy":"copies"}, {summary.storedFiles} stored files ({(summary.bytes/1024/1024).toFixed(1)} MB){summary.downloads?` and ${summary.downloads} download history ${summary.downloads===1?"entry":"entries"}`:""} will be removed.</p>
      <p>Stored files include recorded originals, thumbnails, and playback copies. Deletion is permanent. Other posts, downloads, and unrelated files are kept.</p>
      {!!summary.unavailable&&<p>{summary.unavailable} recorded files are missing; their records will be removed.</p>}
      {!!summary.outsideFolder&&<p role="note">{summary.outsideFolder} files are outside your selected save folder or cannot be safely accessed. Their library records will be removed, but these files will stay on disk. To delete them here, cancel and use Find moved files in Settings first.</p>}</>}
      {error&&<p className="error-banner" role="alert">{error}</p>}
      <div className="control-actions"><button autoFocus className="secondary" disabled={busy} onClick={close}>{error?"Close":"Cancel"}</button><button className="danger-button" disabled={!summary||busy} onClick={()=>void remove()}>{busy?"Deleting...":"Delete permanently"}</button></div>
    </div></ScrollArea>
  </dialog>;
}
