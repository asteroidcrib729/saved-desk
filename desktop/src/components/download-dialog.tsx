"use client";
import { useEffect, useRef, useState } from "react";
import { bridge } from "@/lib/desktop-bridge";
import type { DownloadMode, DownloadPreparation, Snapshot, Source } from "@/lib/contracts";
import { VideoSetting } from "./advanced-video-settings";
import { defaultAdvancedVideo, type AdvancedVideoSettings } from "@/lib/contracts";
import { ScrollArea } from "./scroll-area";
import { platform, platforms } from "@/lib/platforms";

export function DownloadDialog({ open, snapshot, initial, close, accounts, refresh, report }: { open: boolean; snapshot: Snapshot | null; initial?: {source: Source; target: string; title: string} | null; close: () => void; accounts: () => void; refresh: () => Promise<void>; report: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [source,setSource] = useState<Source>("instagram");
  const [target,setTarget] = useState(""); const [title,setTitle] = useState("");
  const [quality,setQuality] = useState("original"); const [profile,setProfile] = useState("original");
  const [advanced,setAdvanced]=useState<AdvancedVideoSettings>({...defaultAdvancedVideo});
  const [prepared,setPrepared] = useState<DownloadPreparation | null>(null); const [busy,setBusy] = useState(false); const [error,setError] = useState("");
  useEffect(() => {
    if (open) {
      setPrepared(null); setError(""); setTarget(initial?.target ?? ""); setTitle(initial?.title ?? ""); setSource(initial?.source ?? "instagram");
      setAdvanced({...snapshot?.settings.advanced??defaultAdvancedVideo});
      setQuality(snapshot?.settings.quality ?? "original"); setProfile(snapshot?.settings.profile ?? "original");
      dialog.current?.showModal();
    } else dialog.current?.close();
    // Snapshot polling must not reset an open draft or its confirmation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);
  const selected = platform(source);
  const connected = !selected.account || snapshot?.accounts.some(account => account.source === source && account.state === "connected");
  const start = async (draft: DownloadPreparation, mode: DownloadMode) => {
    setBusy(true); setError("");
    try { await bridge.startDownload(draft.token,mode); close(); await refresh(); report(""); }
    catch (failure) { setError(typeof failure === "string" ? failure : failure instanceof Error ? failure.message : "The download could not be queued."); setPrepared(null); }
    finally { setBusy(false); }
  };
  const prepare = async () => {
    setBusy(true); setError("");
    try { const draft = await bridge.prepareDownload({source,target,title,quality,profile,advanced}); if (draft.existing) setPrepared(draft); else await start(draft,"new_only"); }
    catch (failure) { setError(typeof failure === "string" ? failure : failure instanceof Error ? failure.message : "The download could not be prepared."); }
    finally { setBusy(false); }
  };
  return <dialog ref={dialog} aria-labelledby="live-download-title" onCancel={event => { if (busy) event.preventDefault(); else close(); }} onClose={close}><ScrollArea className="dialog-scroll" label="Post details" ><div className="dialog-content">
    <h2 id="live-download-title">{prepared ? prepared.collection ? "You have saved this collection before" : "You have saved this post before" : "Add download"}</h2>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {prepared ? <><p>Choose what to save from {prepared.title}. Existing files are preserved.</p><div className="choice-explanation"><strong>Download new items</strong><p>Skip available files. Save newly added content and restore missing files.</p><strong>Download everything again</strong><p>Create another copy in a separate job folder.</p></div><div className="dialog-actions"><button autoFocus disabled={busy} className="secondary" onClick={close}>Cancel</button><button disabled={busy} className="secondary" onClick={() => start(prepared,"all_again")}>Download everything again</button><button disabled={busy} className="primary" onClick={() => start(prepared,"new_only")}>Download new items</button></div></> : <>
      {!snapshot?.native ? <p>Real downloads are available in the Windows desktop app. This browser preview contains sample records only.</p> : <>
        <div className="settings-fields"><label>Platform<select disabled={busy} value={source} onChange={event => {setSource(event.target.value as Source);setTarget("");setError("");}}>{platforms.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div>
        {!connected ? <p className="help-note">Connect your {selected.label} account before downloading.</p> : <>
          <label className="form-field">{source==="discord"?"Media attachment link":"Post or collection link"}<input disabled={busy} aria-label={source==="discord"?"Media attachment link":"Post or collection link"} type="url" value={target} onChange={event => setTarget(event.target.value)} placeholder={selected.placeholder} /></label>
          <p className="help-note">{selected.help}</p>
          {source==="youtube" && <p className="help-note">{snapshot?.accounts.some(a=>a.source===source && a.state==="session_ready") ? "Using your approved YouTube browser session. Google identity is a separate connection." : <>For Watch Later, Liked videos or account playlists, <button className="text-button" onClick={()=>{close();accounts();}}>approve a YouTube browser session in Accounts</button>.</>}</p>}{["facebook","tiktok","pinterest"].includes(source) && snapshot?.accounts.some(a=>a.source===source && a.state==="session_ready") && <p className="help-note">Using your existing browser approval for supported public links. Private content is outside the supported scope.</p>}
          <label className="form-field">{source==="discord"?"Download name (optional)":"Collection name (optional)"}<input disabled={busy} aria-label={source==="discord"?"Download name":"Collection name"} value={title} maxLength={120} onChange={event => setTitle(event.target.value)} placeholder="A name you will recognize" /></label>
          {selected.video && <><div className="settings-fields"><VideoSetting label="Video quality" disabled={busy} value={quality} onChange={setQuality} explanation="Prefer source streams up to this resolution. Best available has no resolution cap. Smaller resolutions usually reduce download size. Resize fallback can resize a larger source when a stream within the cap is unavailable.">{[["original","Best available"],["1080","Up to 1080p"],["720","Up to 720p"],["480","Up to 480p"],["360","Up to 360p"],["1440","Up to 1440p"],["2160","Up to 2160p"]].map(([value,label])=><option value={value} key={value}>{label}</option>)}</VideoSetting><VideoSetting label="Output profile" disabled={busy} value={profile} onChange={setProfile} explanation="Both profiles keep only the playable MP4. Without resize fallback, a download stops if no source meets the resolution cap. With resize fallback, a larger source can be resized when necessary, which requires encoding."><option value="original">MP4 without resize fallback</option><option value="compatible_mp4">MP4 with resize fallback</option></VideoSetting></div>
          <p className="help-note">Only the playable MP4 is kept. Compatible source streams avoid re-encoding. Resize fallback allows a larger source to be resized if no stream meets your resolution cap. Video choices are saved with this job.</p></>}
        </>}
      </>}
      <div className="dialog-actions"><button autoFocus disabled={busy} className="secondary" onClick={close}>Cancel</button>{connected && snapshot?.native ? <button disabled={busy || (!selected.account && !target.trim())} className="primary" onClick={prepare}>{busy ? "Checking…" : "Start download"}</button> : <button className="primary" onClick={() => { close(); accounts(); }}>View accounts</button>}</div>
    </>}
  </div></ScrollArea></dialog>;
}
