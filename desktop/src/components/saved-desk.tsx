"use client";

import type { DownloadProgress } from "@/lib/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { bridge } from "@/lib/desktop-bridge";
import type { DeletionTarget, DownloadMode, LibraryPage, Preflight, Settings, Snapshot, Source, LibraryItem } from "@/lib/contracts";
import { ScrollArea } from "./scroll-area";
import { Icon } from "./icon";
import { platforms } from "@/lib/platforms";
import { AccountsPanel } from "./accounts-panel";
import { AdvancedVideoControls, VideoSetting } from "./advanced-video-settings";
import { defaultAdvancedVideo } from "@/lib/contracts";
import { Switch } from "./switch";
import { DownloadDialog } from "./download-dialog";
import { MediaDialog } from "./media-dialog";
import { DownloadHistory } from "./download-history";
import { ExternalToolsPanel } from "./external-tools-panel";
import { ReadinessPanel } from "./readiness-panel";
import { DeleteContentDialog } from "./delete-content-dialog";
import { LibraryList } from "./library-list";

type Screen = "library" | Source | "downloads" | "accounts" | "settings";
const navigation: { id: Screen; label: string; icon: string }[] = [
  { id: "library", label: "Library", icon: "library" },
  { id: "youtube", label: "YouTube", icon: "youtube" },
  { id: "facebook", label: "Facebook", icon: "facebook" },
  { id: "instagram", label: "Instagram", icon: "instagram" },
  { id: "discord", label: "Discord", icon: "discord" },
  { id: "tiktok", label: "TikTok", icon: "tiktok" },
  { id: "pinterest", label: "Pinterest", icon: "pinterest" },
  { id: "x", label: "X (F.K.A. Twitter)", icon: "x" },
  { id: "downloads", label: "Downloads", icon: "download" },
  { id: "accounts", label: "Accounts", icon: "account" },
  { id: "settings", label: "Settings", icon: "settings" },
];
const emptyPage: LibraryPage = { items: [], total: 0, nextCursor: null };


export function SavedDesk() {
  const [deleteTarget,setDeleteTarget]=useState<DeletionTarget|null>(null);
  const [screen, setScreen] = useState<Screen>("library");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [downloadProgress,setDownloadProgress]=useState<Record<string,DownloadProgress>>({});
  const [page, setPage] = useState(emptyPage);
  const [search, setSearch] = useState("");
  const [platformFilter,setPlatformFilter]=useState<Source|null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Opening your library…");
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedItem,setSelectedItem] = useState<LibraryItem | null>(null);
  const [initialDownload, setInitialDownload] = useState<{ source: Source; target: string; title: string } | null>(null);
  const [interfaceScale,setInterfaceScale]=useState(1);
  const scaleValue=useRef(1);
  const scaleBusy=useRef(false);
  const [scaling,setScaling]=useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [sidebarPinned,setSidebarPinned]=useState(true);
  const [sidebarCompact,setSidebarCompact]=useState(false);
  const sidebarRestored=useRef(false);
  const sidebarDocked=sidebarPinned&&!sidebarCompact;
  const sidebarExpanded=sidebarPinned;
  useEffect(()=>{
    const compact=matchMedia("(max-width: 640px)");const changed=()=>setSidebarCompact(compact.matches);
    changed();compact.addEventListener("change",changed);return()=>compact.removeEventListener("change",changed);
  },[]);
  useEffect(()=>{if(!snapshot||sidebarRestored.current)return;sidebarRestored.current=true;
    if(snapshot.native&&typeof snapshot.settings.sidebarExpanded==="boolean")setSidebarPinned(snapshot.settings.sidebarExpanded);
    else try{const saved=localStorage.getItem("saveddesk-sidebar");setSidebarPinned(saved?saved==="open":window.innerWidth>900);}catch{setSidebarPinned(window.innerWidth>900);}
  },[snapshot]);
  function toggleSidebar(){const next=!sidebarPinned;setSidebarPinned(next);try{localStorage.setItem("saveddesk-sidebar",next?"open":"closed");}catch{/* Native settings remain authoritative. */}if(snapshot?.native)void updateSettings({sidebarExpanded:next});}



  const [repairing,setRepairing] = useState(false);
  const [repairResult,setRepairResult] = useState("");
  const [revision, setRevision] = useState(0);
  const [mediaRevision, setMediaRevision] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const confirmTrigger = useRef<HTMLButtonElement | null>(null);
  const helpRef=useRef<HTMLDialogElement>(null);
  const [helpOpen,setHelpOpen]=useState(false);
  const headingRef=useRef<HTMLHeadingElement>(null);
  const navigationFocus=useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  const settingsDraft = useRef<Settings | null>(null);
  const settingsWrites = useRef(0);
  const settingsQueue = useRef<Promise<void>>(Promise.resolve());
  const refreshTask = useRef<Promise<void> | null>(null);
  const contentSignature = useRef("");
  const platformScreen = platforms.find(item=>item.id===screen)?.id ?? null;
  const libraryScreen = screen === "library" || platformScreen !== null;
  const source: Source | null = platformScreen ?? (screen === "library" ? platformFilter : null);
  const applySnapshot = useCallback((incoming: Snapshot) => {
    const signature = JSON.stringify([incoming.total, incoming.images, incoming.videos, incoming.settings.downloadFolder,
      incoming.jobs.map(job => [job.id, job.state, job.saved, job.skipped, job.failed])]);
    if (signature !== contentSignature.current) { contentSignature.current = signature; setRevision(value => value + 1); }
    const value = settingsWrites.current && settingsDraft.current ? { ...incoming, settings: settingsDraft.current } : incoming;
    setSnapshot(previous => JSON.stringify(previous) === JSON.stringify(value) ? previous : value);
  }, []);
  const refresh = useCallback(async () => {
    if (refreshTask.current) return refreshTask.current;
    const task = bridge.snapshot().then(applySnapshot);
    refreshTask.current = task;
    try { await task; } finally { if (refreshTask.current === task) refreshTask.current = null; }
  }, [applySnapshot]);
  const attention = snapshot?.native && (snapshot.jobs.some(job => job.state === "running" || job.state === "queued") || snapshot.accounts.some(account => account.state === "awaiting_permission" || account.state === "connecting"));
  useEffect(() => {
    if (!attention) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (stopped) return;
      try { await refresh(); } catch { /* Keep the last usable snapshot. */ }
      if (!stopped) timer = setTimeout(poll, 1000);
    }
    timer = setTimeout(poll, 1000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [attention, refresh]);
  const resizeInterface=useCallback(async(value:number)=>{
    if(scaleBusy.current)return;
    scaleBusy.current=true;setScaling(true);
    try{await bridge.setInterfaceScale(value);scaleValue.current=value;setInterfaceScale(value);try{localStorage.setItem("saveddesk-interface-scale",String(value));}catch{/* Session preference remains usable. */}setStatus(`Interface size ${Math.round(value*100)}%.`);}
    catch{setError("The interface size could not be changed. Try again.");}
    finally{scaleBusy.current=false;setScaling(false);}
  },[]);
  useEffect(()=>{if(!snapshot?.native)return;try{const value=Number(localStorage.getItem("saveddesk-interface-scale"));if([1.25,1.5,1.75,2].includes(value))void resizeInterface(value);}catch{/* Default size remains usable. */}},[snapshot?.native,resizeInterface]);
  const newDownload = useCallback(() => { setInitialDownload(null); setAddOpen(true); }, []);

  useEffect(() => {
    let disposed = false;
    let unsubscribe = () => {};
    bridge.snapshot().then(value => {
      if (disposed) return;
      applySnapshot(value); setStatus("Your library is ready.");
      // Render first. Folder scanning must not hold up navigation or settings.
      if (!value.jobs.some(job => job.state === "running" || job.state === "queued")) {
        bridge.repairLibrary().then(result => { if (!disposed && result.relinked) { setMediaRevision(value => value + 1); setRevision(value => value + 1); return refresh(); } }).catch(() => {});
      }
    }).catch(() => { if (!disposed) setError("Your library could not be opened. Restart the app to try again."); });
    bridge.listen(event => {
      if (disposed) return;
      if (event.job_id && event.event === "download_progress") {
        const data=event.data;
        if((data.phase==="downloading"||data.phase==="processing") && typeof data.received==="number" && Number.isFinite(data.received) && data.received>=0 && (data.total===null || (typeof data.total==="number" && Number.isFinite(data.total) && data.total>0 && data.received<=data.total))) {
          const id=event.job_id;setDownloadProgress(previous=>Object.fromEntries([...Object.entries(previous).filter(([key])=>key!==id).slice(-99),[id,data as DownloadProgress]]));
        }
      }
      if(event.job_id && ["started","item_completed","item_skipped","item_failed","completed","failed"].includes(event.event)){const id=event.job_id;setDownloadProgress(previous=>{const next={...previous};delete next[id];return next;});}
      if (event.event === "started") setStatus("Discovering and saving content...");
      if (event.event === "item_completed") setStatus("Content saved. Updating your library...");
    }).then(stop => { if (disposed) stop(); else unsubscribe = stop; }).catch(() => {});
    return () => { disposed = true; unsubscribe(); };
  }, [applySnapshot, refresh]);

  useEffect(() => {
    if (!libraryScreen || !snapshot) return;
    let disposed = false;
    setLibraryLoading(true);
    const timer = setTimeout(() => {
      bridge.library({ search, kind, source, cursor }).then(value => {
        if (!disposed) setPage(previous => JSON.stringify(previous) === JSON.stringify(value) ? previous : value);
      }).catch(() => { if (!disposed) setError("Search could not be completed. Your saved files are unchanged."); })
        .finally(() => { if (!disposed) setLibraryLoading(false); });
    }, search ? 200 : 0);
    return () => { disposed = true; clearTimeout(timer); };
  }, [search, kind, source, cursor, revision, libraryScreen, !!snapshot]);

  useEffect(()=>{if(mainRef.current)mainRef.current.scrollTop=0;if(navigationFocus.current){navigationFocus.current=false;headingRef.current?.focus();}},[screen]);
  useEffect(()=>{if(helpOpen&&!helpRef.current?.open)helpRef.current?.showModal();else if(!helpOpen)helpRef.current?.close();},[helpOpen]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if(["+","=","-","0"].includes(event.key)&&!document.fullscreenElement){
        event.preventDefault();const sizes=[1,1.25,1.5,1.75,2],index=sizes.indexOf(scaleValue.current);
        void resizeInterface(event.key==="0"?1:sizes[Math.max(0,Math.min(sizes.length-1,index+(event.key==="-"?-1:1)))]);return;
      }
      if (event.key === "f" || event.key === "n") {
        event.preventDefault();
        if (document.querySelector("dialog[open]")) return;
        if (event.key === "f") { setScreen("library"); setCursor(null); searchRef.current?.focus(); }
        else newDownload();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newDownload,resizeInterface]);
  useEffect(() => {
    if (preflight && !confirmRef.current?.open) confirmRef.current?.showModal();
    else if (!preflight && confirmRef.current?.open) confirmRef.current?.close();
  }, [preflight]);


  const run = useCallback(async (prepared: Preflight, mode: DownloadMode) => {
    setPreflight(null); setBusy(true); setError(""); setStatus("Starting the local test job…");
    try {
      const result = await bridge.runPrototype(prepared.token, mode);
      setSnapshot(result);
      setRevision(v => v + 1); setStatus(result.jobs[0]?.saved === 0 ? "No new sample items found. Existing files are available." : "Test job complete. Your sample library is ready.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The test job failed. Existing files are unchanged."); setStatus("Test job needs attention."); }
    finally { setBusy(false); confirmTrigger.current?.focus(); }
  }, []);
  const prepare = async (trigger: HTMLButtonElement) => {
    confirmTrigger.current = trigger; setError(""); setBusy(true);
    try { const value = await bridge.preflight(); if (value.existing) setPreflight(value); else await run(value, "new_only"); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The test job could not be prepared."); }
    finally { setBusy(false); }
  };
  const updateSettings = (changes: Partial<Settings>): Promise<void> => {
    if (!snapshot) return Promise.resolve();
    const settings = { ...(settingsDraft.current ?? snapshot.settings), ...changes };
    settingsDraft.current = settings; settingsWrites.current += 1;
    setSnapshot(previous => previous ? { ...previous, settings } : previous);
    const changingFolder = changes.downloadFolder !== undefined;
    if (changingFolder) setRepairing(true);
    const write = async () => {
      try {
        await bridge.saveSettings(settings);
        if (changingFolder) setRepairResult("Save folder updated. Matching moved files have been relinked. Files outside this folder are not opened.");
        setStatus("Settings saved.");
      } catch (failure) { setError(String(failure)); }
      finally {
        settingsWrites.current -= 1;
        if (!settingsWrites.current) {
          settingsDraft.current = null;
          await refreshTask.current?.catch(() => {});
          await refresh().catch(() => {});
        }
        if (changingFolder) setRepairing(false);
      }
    };
    settingsQueue.current = settingsQueue.current.then(write, write);
    return settingsQueue.current;
  };
  const go = (value: Screen) => { navigationFocus.current=value!==screen; setScreen(value); setCursor(null); setKind(null); setPlatformFilter(null); setSearch(""); setError(""); };
  const clearFilters=()=>{setSearch("");setKind(null);setPlatformFilter(null);setCursor(null);searchRef.current?.focus();};
  const activeNav = navigation.find(item => item.id === screen)!;
  const queryKey = JSON.stringify([screen, source, search, kind, platformFilter, cursor]);
  useEffect(() => { setSelectedItem(null); }, [snapshot?.settings.downloadFolder]);
  async function repairFiles(){
    setRepairing(true);setError("");setRepairResult("");
    try{const result=await bridge.repairLibrary();setMediaRevision(value=>value+1);setRevision(value=>value+1);await refresh();setRepairResult(`${result.relinked} files relinked. ${result.available} available, ${result.missing} missing, ${result.ambiguous} ambiguous. Ambiguous matches are left unchanged.`);setStatus("Save folder checked.");}
    catch(failure){setError(String(failure));}finally{setRepairing(false);}
  }


  return <div className={`app-frame ${snapshot?.settings.lowResource ? "low-resource" : ""}`}>
    <a className="skip-link" href="#main">Skip to content</a>
    <div className={`sidebar-shell ${sidebarDocked?"pinned":""} ${sidebarExpanded?"expanded":"collapsed"}`}>
    <ScrollArea className="sidebar-scroll" axis="vertical" as="aside" viewportClassName="sidebar" label="Sidebar" aria-label="Main navigation">
      <div className="brand"><button className="brand-mark sidebar-toggle" disabled={!snapshot} aria-label={sidebarPinned?"Collapse sidebar":"Expand sidebar"} aria-expanded={sidebarExpanded} aria-controls="sidebar-navigation" onClick={toggleSidebar} title={sidebarPinned?"Collapse sidebar":"Expand sidebar"}><Icon name="bookmark" size={23} /></button><span>SavedDesk<span className="brand-caption">A place for your saves</span></span></div>
      <span className="nav-caption">YOUR SPACE</span>
      <nav id="sidebar-navigation" aria-label="Library and downloads">{navigation.filter(item=>item.id!=="accounts"&&item.id!=="settings").map(item => <button key={item.id} title={item.label} aria-label={item.label} onClick={() => go(item.id)} className={`nav-item ${screen === item.id ? "selected" : ""}`} aria-current={screen === item.id ? "page" : undefined}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
      <div className="sidebar-bottom">{navigation.filter(item=>item.id==="accounts"||item.id==="settings").map(item => <button key={item.id} title={item.label} aria-label={item.label} onClick={() => go(item.id)} className={`nav-item ${screen === item.id ? "selected" : ""}`} aria-current={screen === item.id ? "page" : undefined}><Icon name={item.icon} /><span>{item.label}</span></button>)}</div>
    </ScrollArea>
    </div>
    <div className="workspace">
      <header className="topbar"><div className="search-field"><Icon name="search" /><input ref={searchRef} aria-label="Search your library" placeholder="Search your library" value={search} onChange={event => { setSearch(event.target.value); setCursor(null); if (!libraryScreen) { setScreen("library"); setKind(null); } }} /><button className="search-clear" disabled={!search} tabIndex={search?0:-1} aria-label="Clear search" title="Clear search" onClick={()=>{setSearch("");setCursor(null);searchRef.current?.focus();}}><Icon name="close" size={16}/></button><kbd>Ctrl F</kbd></div><div className="topbar-actions"><button className="primary" onClick={newDownload}><Icon name="plus" size={18} /><span>Add download</span></button><button className="secondary" onClick={()=>setHelpOpen(true)}>Help & shortcuts</button></div></header>
      <ScrollArea as="main" viewportRef={mainRef} className="main-scroll" label="Page" id="main" tabIndex={-1}>
        {snapshot && !snapshot.native && <div className="preview-note">Browser preview · Sample records stay in this tab. Use the Windows app to connect accounts and save real files.</div>}
        {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss message" onClick={() => setError("")}><Icon name="close" size={16} /></button></div>}
        <div className="page-heading"><div><div className="eyebrow">YOUR CONTENT, WITH YOU</div><h1 ref={headingRef} tabIndex={-1}>{activeNav.label}</h1><p>{screen === "library" ? "Everything you saved. Easy to find, ready to revisit." : screen === "downloads" ? "See what was saved and what needs your attention." : screen === "accounts" ? "Connect the browser where you are already signed in." : screen === "settings" ? "Make SavedDesk work comfortably on your computer." : "Keep the things you want to come back to."}</p></div><span className="local-chip"><Icon name="check" size={15} />Local library</span></div>
        {libraryScreen && <>
          <div className="stats-grid"><Stat label="Saved posts" value={snapshot?.total ?? 0} icon="bookmark" /><Stat label="Images" value={snapshot?.images ?? 0} icon="image" /><Stat label="Videos" value={snapshot?.videos ?? 0} icon="video" /></div>
          <section className="library-section" aria-label="Saved content" aria-busy={libraryLoading}>
            <div className="section-top"><h2>{search ? "Search results" : "Recently saved"}<span className="muted">{page.total} posts</span></h2><div className="library-filters">{screen==="library"&&<label className="platform-filter">Platform<select aria-label="Library platform" value={platformFilter??""} onChange={event=>{setPlatformFilter((event.target.value||null) as Source|null);setCursor(null);}}><option value="">All platforms</option>{platforms.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</select></label>}<div className="filter-tabs" role="group" aria-label="Content type">{[[null, "All content"], ["image", "Images"], ["video", "Videos"], ["audio", "Audio"], ["text", "Text"]].map(([value, label]) => <button key={label} aria-pressed={kind === value} className={kind === value ? "active" : ""} onClick={() => { setKind(value); setCursor(null); }}>{label}</button>)}</div></div></div>
            {(search||kind||platformFilter)&&<div className="control-actions"><button className="text-button" onClick={clearFilters}>Clear search and filters</button></div>}
            <p id="library-keyboard-help" className="library-keyboard-help">Click a post to view it. Keyboard: Up/Down, Home/End or Page Up/Down to browse; Enter to open.</p>
            <span className="sr-only" role="status" aria-live="polite">{libraryLoading?"Searching saved posts...":`${page.total} matching posts. ${page.items.length} on this page.`}</span>
            {!snapshot || (libraryLoading && !page.items.length) ? <div className="empty-state" role="status"><p>Loading your library...</p></div> : page.items.length ? <><LibraryList key={`${snapshot?.settings.downloadFolder}:${mediaRevision}`} items={page.items} queryKey={queryKey} version={revision} native={snapshot?.native ?? false} open={setSelectedItem} remove={setDeleteTarget}/><div className="pagination"><span>Showing up to 100 matching posts</span>{cursor !== null && <button className="secondary" onClick={() => setCursor(null)}>Back to newest</button>}{page.nextCursor !== null && <button className="secondary" onClick={() => setCursor(page.nextCursor)}>Next page</button>}</div></> : <div className="empty-state"><div className="empty-icon"><Icon name={search || kind || platformFilter ? "search" : "bookmark"} size={34} /></div><h3>{search || kind || platformFilter ? "No matching content" : source === "x" ? "Your bookmarks belong here" : "Your library starts with a save"}</h3><p>{search || kind || platformFilter ? "Try another search or choose All content." : "Bring your saved posts together in one quiet, organized place."}</p>{!search && !kind && !platformFilter && <button className="primary" onClick={newDownload}><Icon name="plus" size={17} />Add your first download</button>}</div>}
          </section>
          {!snapshot?.total && <div className="getting-started"><div><Icon name="folder" size={24} /></div><div><strong>Take a look around first</strong><p>Try a small sample collection without connecting an account.</p></div><button className="secondary" disabled={busy || !snapshot} onClick={event => prepare(event.currentTarget)}>{busy ? "Preparing…" : "Try sample collection"}<Icon name="arrow" size={16} /></button></div>}
        </>}
        {screen === "downloads" && <DownloadHistory progress={downloadProgress} jobs={snapshot?.jobs ?? []} native={snapshot?.native ?? false} refresh={refresh} report={setError} remove={setDeleteTarget} />}
        {screen === "accounts" && <AccountsPanel snapshot={snapshot} refresh={refresh} report={setError} downloadDiscord={()=>{setInitialDownload({source:"discord",target:"",title:""});setAddOpen(true);}} />}
        {screen === "settings" && snapshot && <>
          <ReadinessPanel native={snapshot.native} folder={snapshot.settings.downloadFolder} folderBusy={repairing||!!attention} chooseFolder={async()=>{try{const folder=await bridge.chooseFolder();if(folder)await updateSettings({downloadFolder:folder});}catch{setError("The folder could not be selected. Try again.");}}} accounts={()=>go("accounts")} />
          <section className="panel settings-panel"><h2>Save location</h2><p className="muted">SavedDesk views and saves content only inside this folder. After moving your downloads here, choose Find moved files. Keeping the original subfolders helps identify each copy.</p><div className="folder-setting"><Icon name="folder" /><code>{snapshot.settings.downloadFolder}</code><button className="secondary" disabled={!snapshot.native || repairing || !!attention} onClick={async () => { try { const folder = await bridge.chooseFolder(); if (folder) await updateSettings({ downloadFolder: folder }); } catch { setError("The folder could not be selected. Try again."); } }}>Choose folder</button><button className="secondary" disabled={!snapshot.native || repairing || !!attention} onClick={repairFiles}>{repairing ? "Checking folder..." : "Find moved files"}</button></div>{!!attention&&<p className="help-note">Folder changes and Find moved files are available when the current download or account connection finishes.</p>}{repairResult && <p className="help-note" role="status">{repairResult}</p>}<p className="help-note">Files are relinked in place. This does not move, delete, or download your content. Thumbnails for visible posts are restored as you browse.</p></section>
          <ExternalToolsPanel native={snapshot.native}/>
          <section className="panel settings-panel"><h2>Video defaults</h2><p className="muted">Save playable H.264/AAC MP4 videos. Compatible source streams are preferred to avoid conversion.</p><div className="settings-fields">
            <VideoSetting label="Video quality" disabled={repairing} value={snapshot.settings.quality} onChange={quality=>updateSettings({quality})} explanation="Prefer source streams up to the selected resolution. Best available has no resolution cap. Smaller resolutions usually reduce download size. The resize fallback profile can resize a larger source when a stream within the cap is unavailable.">{[["original","Best available"],["2160","Up to 2160p"],["1440","Up to 1440p"],["1080","Up to 1080p"],["720","Up to 720p"],["480","Up to 480p"],["360","Up to 360p"]].map(([v,label])=><option value={v} key={v}>{label}</option>)}</VideoSetting>
            <VideoSetting label="Output profile" disabled={repairing} value={snapshot.settings.profile} onChange={profile=>updateSettings({profile})} explanation="Both profiles keep only the playable MP4. Without resize fallback, a download stops if no source meets your resolution cap. With resize fallback, a larger source may be downloaded and resized when necessary, which requires encoding."><option value="original">MP4 without resize fallback</option><option value="compatible_mp4">MP4 with resize fallback</option></VideoSetting>
          </div><div className="setting-actions"><button className="text-button" aria-expanded={advanced} aria-controls="default-advanced-video" onClick={()=>setAdvanced(v=>!v)}>Advanced video settings</button><button className="secondary" disabled={repairing} onClick={()=>updateSettings({quality:"original",profile:"original",advanced:{...defaultAdvancedVideo}})}>Restore default video settings</button></div>
          {advanced&&<div id="default-advanced-video"><AdvancedVideoControls value={snapshot.settings.advanced??defaultAdvancedVideo} disabled={repairing} onChange={value=>updateSettings({advanced:value})}/></div>}</section>
          <section className="panel settings-panel"><h2>Accessibility and appearance</h2><div className="appearance-row"><label className="setting-field" htmlFor="interface-size">Interface size<select id="interface-size" aria-label="Interface size" disabled={!snapshot.native||scaling} value={interfaceScale} onChange={event=>void resizeInterface(Number(event.target.value))}>{[1,1.25,1.5,1.75,2].map(value=><option value={value} key={value}>{Math.round(value*100)}%</option>)}</select></label><p className="help-note">Enlarge text and controls together. Ctrl + Plus/Minus adjusts the size; Ctrl + 0 restores 100%. Your selected size is remembered on this PC. Windows high contrast and reduced motion preferences are respected.</p></div></section>
          <section className="panel settings-panel"><h2>Keep your computer responsive</h2><label className="toggle-row"><Switch disabled={repairing} checked={snapshot.settings.lowResource} onChange={event => updateSettings({ lowResource: event.target.checked })} /><span><strong>Low-resource mode</strong><small>Reduce motion and decorative effects. Downloads always run one at a time.</small></span></label></section>
          <section className="panel settings-panel"><h2>Privacy and local data</h2><div className="setting-row"><div className="setting-copy"><p className="muted">Account sessions are protected for your Windows user on this PC. Disconnecting in Accounts removes SavedDesk's session access and keeps your downloads and history.</p><p className="help-note">Catalog encryption is not enabled yet. Library captions, account names, history, and stored paths are currently in an unencrypted local SQLite catalog. Downloaded files and thumbnails are also unencrypted. Protect access to your Windows account and storage; database encryption and portable encrypted recovery are planned together.</p></div><button className="secondary" onClick={()=>go("accounts")}>Manage connected accounts</button></div></section>
          <section className="panel settings-panel"><h2>Local connection test</h2><div className="setting-row"><p className="muted">Run three local test transfers to check the worker, library history, and repeat-download confirmation. These files use a separate test folder and never contact any platform.</p><button className="secondary" disabled={busy} onClick={event => prepare(event.currentTarget)}><Icon name="refresh" size={16} />{busy ? "Working…" : "Run local test job"}</button></div></section>
        </>}
      </ScrollArea>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{status}</div>
    </div>
    <dialog ref={confirmRef} aria-labelledby="repeat-title" onCancel={() => { setPreflight(null); confirmTrigger.current?.focus(); }} onClose={() => setPreflight(null)}><ScrollArea className="dialog-scroll" label="Dialog"><div className="dialog-content"><span className="dialog-icon"><Icon name="refresh" size={26} /></span><h2 id="repeat-title">You have saved this collection before</h2><p>{preflight?.existing} sample posts already have download history. {preflight?.missing ? `${preflight.missing} files are missing and will be restored.` : "What would you like to save?"}</p><div className="choice-explanation"><strong>Download new items</strong><p>Keep your existing files and save only missing content.</p><strong>Download everything again</strong><p>Create another copy in a separate folder. Existing files are preserved.</p></div><div className="dialog-actions"><button autoFocus className="secondary" onClick={() => { setPreflight(null); confirmTrigger.current?.focus(); }}>Cancel</button><button className="secondary" onClick={() => preflight && run(preflight, "all_again")}>Download everything again</button><button className="primary" onClick={() => preflight && run(preflight, "new_only")}>Download new items</button></div></div></ScrollArea></dialog>
    <MediaDialog item={selectedItem} native={snapshot?.native ?? false} close={() => setSelectedItem(null)} settings={()=>{setSelectedItem(null);go("settings");}} remove={setDeleteTarget}/>
    <DeleteContentDialog target={deleteTarget} close={()=>setDeleteTarget(null)} refresh={refresh} report={setStatus} beforeDelete={async()=>{
      if(document.fullscreenElement)await document.exitFullscreen();
      document.querySelectorAll<HTMLMediaElement>(".media-dialog video,.media-dialog audio").forEach(player=>{player.pause();player.removeAttribute("src");player.load();});
      setSelectedItem(null);
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    }}/>
    <dialog ref={helpRef} className="help-dialog" aria-labelledby="help-title" onCancel={()=>setHelpOpen(false)} onClose={()=>setHelpOpen(false)}><ScrollArea className="dialog-scroll" label="Dialog"><div className="dialog-content"><div className="media-heading"><h2 id="help-title">Help & shortcuts</h2><button autoFocus className="secondary" aria-label="Close help" title="Close help" onClick={()=>setHelpOpen(false)}><Icon name="close" size={18}/></button></div><p>Browse your saved posts, open a post to see all its files, and use Downloads to check progress or retry unfinished items.</p><dl><dt>Ctrl + F</dt><dd>Search the library</dd><dt>Ctrl + Plus/Minus/0</dt><dd>Enlarge/reduce the interface or restore 100% (outside fullscreen)</dd><dt>Ctrl + N</dt><dd>Add a download</dd><dt>Up/Down, Home/End</dt><dd>Browse posts in the library; Enter opens the focused post</dd><dt>Post selection</dt><dd>Use post checkboxes or Select this page; Shift-click selects a range. Ctrl + A selects this page when the saved-post list has focus; Delete reviews selected posts; Escape clears selection. Page/filter changes clear it.</dd><dt>Alt + Left/Right</dt><dd>Previous/next available file within an open post</dd><dt>F / Escape</dt><dd>Enter/exit fullscreen; Escape closes the post when outside fullscreen</dd><dt>+ / - / 0</dt><dd>Zoom an image in/out or fit it</dd><dt>K / M</dt><dd>Play/pause or mute video/audio</dd></dl><h3>Moved files or missing thumbnails?</h3><p>Choose your current folder in Settings, then Find moved files. SavedDesk only opens content inside that folder and does not move or delete it.</p><h3>Video does not play?</h3><p>Try Open with Windows. New downloads prefer compatible streams and keep only a playable MP4. Conversion is needed only when the source cannot be played directly or must be resized.</p><h3>More platforms</h3><p>Choose a platform in Add download. YouTube, Facebook, TikTok and Pinterest accept full public links. Discord downloads image, video and audio attachment links without an account connection or server setup. Use the Library platform filter to find each service's content. Facebook, TikTok and Pinterest support public links only. YouTube Watch Later and Liked videos need separate browser approval; Google identity alone does not supply it.</p><h3>Connect an account</h3><p>In Accounts, select the browser where you are signed in and follow the browser connector instructions. Passwords are never requested.</p></div></ScrollArea></dialog>
    <DownloadDialog open={addOpen} snapshot={snapshot} initial={initialDownload} close={() => setAddOpen(false)} accounts={() => go("accounts")} refresh={refresh} report={setError} />
  </div>;
}

function Stat({ label, value, icon }: { label: string; value: number; icon: string }) {
  return <div className="stat-card"><span className="stat-icon"><Icon name={icon} /></span><span><strong>{value.toLocaleString()}</strong><small>{label}</small></span></div>;
}
function Empty({ title, text, icon }: { title: string; text: string; icon: string }) {
  return <div className="empty-state"><div className="empty-icon"><Icon name={icon} size={30} /></div><h3>{title}</h3><p>{text}</p></div>;
}
