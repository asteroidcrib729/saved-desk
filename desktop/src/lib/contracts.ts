export type Source = "instagram" | "x" | "youtube" | "facebook" | "tiktok" | "pinterest" | "discord";
export type DownloadMode = "new_only" | "all_again";
export type LibraryItem = {
  id: number;
  source: Source;
  nativeId: string;
  creator: string;
  caption: string;
  kind: "image" | "video" | "audio" | "text";
  collection: string;
  savedAt: string;
  available: boolean;
  prototype: boolean;
};
export type LibraryPage = { items: LibraryItem[]; total: number; nextCursor: number | null };
export type Job = {
  id: string;
  title: string;
  state: string;
  saved: number;
  skipped: number;
  failed: number;
  mode: DownloadMode;
  createdAt: string;
  error?: string;
  collection?: boolean;
  source?: string;
  supported?: boolean;
};
export type AdvancedVideoSettings = { encoder: "auto" | "software"; preset: "superfast" | "fast" | "slow"; crf: 18 | 23 | 28; audioBitrate: 96 | 128 | 192 | 256 };
export const defaultAdvancedVideo: AdvancedVideoSettings = { encoder: "auto", preset: "superfast", crf: 23, audioBitrate: 128 };
export type Settings = { downloadFolder: string; lowResource: boolean; quality: string; profile: string; advanced: AdvancedVideoSettings; sidebarExpanded?: boolean };
export type Snapshot = {
  total: number;
  images: number;
  videos: number;
  jobs: Job[];
  settings: Settings;
  liveDownloads: boolean;
  browserConnection: boolean;
  native: boolean;
  accounts: Account[];
  collections: { source: Source; title: string; target: string }[];
};
export type Account = { source: Source; accountId: string; username: string; browser: string; state: string; message: string };
export type DownloadPreparation = { token: string; existing: number; collection: boolean; title: string };
export type DownloadRequest = { source: Source; target: string; title: string; quality: string; profile: string; advanced?: AdvancedVideoSettings };
export type SavedFile = { id:number;name:string;jobId:string;bytes:number;quality:string;profile:string;available:boolean;playback?:"original"|"cached";kind:"image"|"video"|"audio"|"text" };
export type Preflight = { token: string; existing: number; missing: number; items: number };
export type Query = { search: string; source: Source | null; kind: string | null; cursor: number | null };
export type WorkerEvent = { event: string; job_id: string | null; sequence: number; data: Record<string, unknown> };

export type LibraryRepair = { relinked:number;available:number;missing:number;ambiguous:number };

export type ReadinessCheck = { id:string;label:string;state:"ready"|"warning"|"blocked"|"pending";message:string;action:"folder"|"accounts"|"none" };
export type ReadinessReport = { checks:ReadinessCheck[];freeBytes:number|null };

export type DownloadProgress = { phase:"downloading"|"processing";received:number;total:number|null };

export type DeletionTarget = {kind:"post"|"file";id:number}|{kind:"posts";id:number[]}|{kind:"download"|"collection";id:string};
export type DeletionSummary = {token:string;files:number;storedFiles:number;unavailable:number;outsideFolder:number;downloads:number;bytes:number};

export interface AuthenticationReport {
 providers: {source:Source;identityFlow:string;privateMedia:string;requirement:string}[];
 google: {clientId:string;state:"setup_required"|"not_connected"|"waiting_for_browser"|"revoking"|"identity_verified"|"refresh_needed";displayName:string|null;accountKey:string|null;expiresAt:number|null;grantedScopes:string[];message:string};
}
