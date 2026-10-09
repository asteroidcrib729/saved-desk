import type { AuthenticationReport, DeletionTarget, DeletionSummary, DownloadMode, DownloadPreparation, DownloadRequest, LibraryItem, LibraryPage, LibraryRepair, ReadinessReport, Preflight, Query, SavedFile, Settings, Snapshot, Source, WorkerEvent } from "./contracts";

import { defaultAdvancedVideo } from "./contracts";

// Native commands are loaded only after mounting. No prerendering or server APIs.
const isNative = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
let previewItems: LibraryItem[] = [];
let previewSnapshot: Snapshot = {
  total: 0, images: 0, videos: 0, jobs: [], native: false,
  liveDownloads: false, browserConnection: false,
  accounts: [], collections: [],
  settings: { downloadFolder: "Choose a folder in the desktop app", lowResource: true, quality: "original", profile: "original", advanced: { ...defaultAdvancedVideo } },
};
let pendingToken: string | null = null;
let playerWrites:Promise<void>=Promise.resolve();

async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(name, args);
}

export const bridge = {
  async authentication():Promise<AuthenticationReport> {return isNative()?command('get_authentication'):{providers:[{source:'facebook',identityFlow:'optional',privateMedia:'excluded',requirement:'Public video and Reel links need no new OAuth registration. Private content is outside the supported scope.'},{source:'tiktok',identityFlow:'optional',privateMedia:'excluded',requirement:'Public video and photo links need no Login Kit setup. Private and followers-only content is outside the supported scope.'},{source:'pinterest',identityFlow:'public_links',privateMedia:'excluded',requirement:'Public pin and board links need no developer app or OAuth setup. Secret boards are outside the supported scope.'},{source:'discord',identityFlow:'optional',privateMedia:'attachment_link',requirement:'Fresh CDN attachments work without sign-in.'}],google:{clientId:'',state:'setup_required',displayName:null,accountKey:null,expiresAt:null,grantedScopes:[],message:''}};},
  async resetGoogleIdentity():Promise<void>{return command('reset_google_identity');},
  async configureGoogleIdentity(clientId:string):Promise<void>{return command('configure_google_identity',{clientId});},
  async importGoogleIdentity():Promise<boolean>{return command('import_google_identity');},
  async beginGoogleIdentity():Promise<void>{return command('begin_google_identity');},
  async cancelGoogleIdentity():Promise<void>{return command('cancel_google_identity');},
  async checkGoogleIdentity():Promise<void>{return command('check_google_identity');},
  async disconnectGoogleIdentity(revoke:boolean):Promise<void>{return command('disconnect_google_identity',{revoke});},
  async externalTools():Promise<{galleryPython:string;ffmpeg:string}>{return isNative()?command("get_external_tools"):{galleryPython:"",ffmpeg:""};},
  async saveExternalTools(config:{galleryPython:string;ffmpeg:string}):Promise<{galleryPython:string;ffmpeg:string}>{return command("save_external_tools",{config});},
  async chooseExternalTool():Promise<string|null>{return command("choose_external_tool");},
  async playerPreferences():Promise<{volume:number;muted:boolean}|null> {if(!isNative())return null;await playerWrites.catch(()=>{});return command("get_player_preferences");},
  savePlayerPreferences(preferences:{volume:number;muted:boolean}):Promise<void> {if(!isNative())return Promise.resolve();const task=playerWrites.catch(()=>{}).then(()=>command<void>("save_player_preferences",{preferences}));playerWrites=task;return task;},
  async prepareDeletion(target:DeletionTarget):Promise<DeletionSummary> { if(!isNative())throw new Error("Delete saved content in the desktop app.");return command("prepare_deletion",{target}); },
  async deleteSavedContent(token:string):Promise<void> { return command("delete_saved_content",{token}); },
  async setInterfaceScale(scale:number):Promise<void> {
    if(![1,1.25,1.5,1.75,2].includes(scale))throw new Error("Choose an interface size between 100% and 200%.");
    if(!isNative())return;
    const { getCurrentWebview }=await import("@tauri-apps/api/webview");
    await getCurrentWebview().setZoom(scale);
  },
  async openSourcePost(id:number):Promise<void> { return command("open_source_post",{id}); },
  async checkReadiness(browser:string):Promise<ReadinessReport> { if(!isNative()) throw new Error("Check your setup in the Windows desktop app."); return command("check_readiness",{browser}); },
  async repairLibrary():Promise<LibraryRepair> { return isNative() ? command("repair_library") : {relinked:0,available:0,missing:0,ambiguous:0}; },
  async thumbnails(ids:number[]):Promise<Record<string,string|null>> { return isNative() ? command("thumbnails",{ids}) : {}; },
  async mediaSource(id:number):Promise<string> { if(!isNative()) throw new Error("Open downloaded content in the desktop app."); const {convertFileSrc}=await import("@tauri-apps/api/core");return convertFileSrc(String(id),"savedmedia"); },
  async videoSource(id:number,force=false,playback?:"original"|"cached"):Promise<string> {const converted=!force&&playback?playback==="cached":await command<boolean>("prepare_video",{id,force});const {convertFileSrc}=await import("@tauri-apps/api/core");const base=convertFileSrc(String(id),"savedmedia");return converted?`${base}/playback`:base;},
  async postFiles(id:number):Promise<SavedFile[]> { return isNative() ? command("post_files",{id}) : []; },
  async thumbnail(id:number):Promise<string|null> { return isNative() ? command("thumbnail",{id}) : null; },
  async openMediaFile(id:number):Promise<void> { return command("open_media_file",{id}); },
  async firefoxProfiles(): Promise<{id: string; name: string}[]> { if (!isNative()) return []; return command("firefox_profiles"); },
  async connectFirefox(source: Source, profileId: string): Promise<void> { return command("connect_firefox", { source, profileId }); },
  async setupConnector(browser: string): Promise<void> { if (!isNative()) throw new Error("Connect accounts in the Windows desktop app."); return command("setup_connector", { browser }); },
  async connect(source: Source, browser: string): Promise<void> { if (!isNative()) throw new Error("Connect accounts in the Windows desktop app."); return command("begin_connection", { source, browser }); },
  async cancelConnection(): Promise<void> { return command("cancel_connection"); },
  async disconnect(source: Source): Promise<void> { return command("disconnect_account", { source }); },
  async openBrowser(source: Source, browser: string): Promise<void> { return command("open_browser", { source, browser }); },
  async prepareDownload(request: DownloadRequest): Promise<DownloadPreparation> { if (!isNative()) throw new Error("Real downloads are available in the Windows desktop app."); return command("prepare_download", { request }); },
  async startDownload(token: string, mode: DownloadMode): Promise<string> { return command("start_download", { token, mode }); },
  async stopDownload(id: string, pause: boolean): Promise<void> { return command("stop_download", { id, pause }); },
  async resumeDownload(id: string): Promise<void> { return command("resume_download", { id }); },
  async snapshot(): Promise<Snapshot> {
    return isNative() ? command("get_snapshot") : structuredClone(previewSnapshot);
  },
  async library(query: Query): Promise<LibraryPage> {
    if (isNative()) return command("query_library", { query });
    const normalized = query.search.toLocaleLowerCase();
    const matches = previewItems.filter(item =>
      (!query.source || query.source === item.source) && (!query.kind || query.kind === item.kind) &&
      `${item.creator} ${item.caption} ${item.collection}`.toLocaleLowerCase().includes(normalized));
    const remaining = matches.filter(item => query.cursor === null || item.id < query.cursor);
    const items = remaining.slice(0, 100);
    return { items, total: matches.length, nextCursor: remaining.length > 100 ? items[99].id : null };
  },
  async preflight(): Promise<Preflight> {
    if (isNative()) return command("prepare_prototype");
    pendingToken = crypto.randomUUID();
    return { token: pendingToken, existing: Math.min(previewItems.length, 3), missing: 0, items: 3 };
  },
  async runPrototype(token: string, mode: DownloadMode): Promise<Snapshot> {
    if (isNative()) return command("run_prototype", { token, mode });
    if (token !== pendingToken) throw new Error("This decision has expired. Try again.");
    pendingToken = null;
    const existing = previewItems.length > 0;
    if (!existing) {
      previewItems = [
        { id: 3, source: "instagram", nativeId: "fixture-3", creator: "Studio Notes", caption: "Small spaces, thoughtful details.", kind: "image", collection: "Sample collection", savedAt: new Date().toISOString(), available: true, prototype: true },
        { id: 2, source: "instagram", nativeId: "fixture-2", creator: "Everyday Kitchen", caption: "A recipe worth keeping for the weekend.", kind: "image", collection: "Sample collection", savedAt: new Date().toISOString(), available: true, prototype: true },
        { id: 1, source: "instagram", nativeId: "fixture-1", creator: "Outside Journal", caption: "A little inspiration from the outdoors.", kind: "image", collection: "Sample collection", savedAt: new Date().toISOString(), available: true, prototype: true },
      ];
    }
    previewSnapshot = { ...previewSnapshot, total: 3, images: 3,
      jobs: [{ id: crypto.randomUUID(), title: "Sample collection", state: "completed", saved: existing && mode === "new_only" ? 0 : 3,
        skipped: existing && mode === "new_only" ? 3 : 0, failed: 0, mode, createdAt: new Date().toISOString() }, ...previewSnapshot.jobs].slice(0, 20) };
    return structuredClone(previewSnapshot);
  },
  async saveSettings(settings: Settings): Promise<void> {
    if (isNative()) return command("save_settings", { settings });
    previewSnapshot.settings = settings;
  },
  async chooseFolder(): Promise<string | null> {
    if (!isNative()) throw new Error("Folder selection is available in the desktop app.");
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false, title: "Choose where to save your content" });
    return typeof selected === "string" ? selected : null;
  },
  async openItem(id: number): Promise<void> {
    if (!isNative()) throw new Error("The browser preview contains sample records only. Files are created by the desktop test job.");
    return command("open_item", { id });
  },
  async openJobFolder(id: string): Promise<void> {
    if (!isNative()) throw new Error("Open folder is available after a desktop test download.");
    return command("open_job_folder", { id });
  },
  async listen(handler: (event: WorkerEvent) => void): Promise<() => void> {
    if (!isNative()) return () => {};
    const { listen } = await import("@tauri-apps/api/event");
    return listen<WorkerEvent>("worker-event", event => handler(event.payload));
  },
};
