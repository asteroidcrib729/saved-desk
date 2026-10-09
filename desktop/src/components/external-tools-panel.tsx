"use client";
import {useEffect,useState} from "react";
import {bridge} from "@/lib/desktop-bridge";
type Config={galleryPython:string;ffmpeg:string};
export function ExternalToolsPanel({native}:{native:boolean}){
 const [config,setConfig]=useState<Config>({galleryPython:"",ffmpeg:""}),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{if(native)void bridge.externalTools().then(setConfig).catch(()=>setMessage("Tool settings could not be loaded."));},[native]);
 async function choose(key:keyof Config){setBusy(true);setMessage("");try{const file=await bridge.chooseExternalTool();if(file){const saved=await bridge.saveExternalTools({...config,[key]:file});setConfig(saved);setMessage("Tool selected. Use Check your setup to verify it.");}}catch(e){setMessage(typeof e==="string"?e:"The selected tool could not be saved.");}finally{setBusy(false);}}
 async function clear(key:keyof Config){setBusy(true);try{setConfig(await bridge.saveExternalTools({...config,[key]:""}));setMessage("Tool selection cleared.");}catch(e){setMessage(typeof e==="string"?e:"Tool settings could not be saved.");}finally{setBusy(false);}}
 return <section className="panel settings-panel external-tools-panel"><h2>Download tools</h2>
 <p className="muted">Gallery downloads and video conversion use tools installed separately on your PC. SavedDesk does not bundle gallery-dl or FFmpeg.</p>
 <div className="settings-fields">{([["galleryPython","Gallery Python environment"],["ffmpeg","FFmpeg executable"]] as const).map(([key,label])=><div key={key}><strong>{label}</strong><p className="help-note"><code>{config[key]||"Not selected"}</code></p><div className="control-actions"><button className="secondary" aria-label={`Choose ${label}`} disabled={!native||busy} onClick={()=>void choose(key)}>Choose file</button><button className="secondary" aria-label={`Clear ${label}`} disabled={!native||busy||!config[key]} onClick={()=>void clear(key)}>Clear</button></div></div>)}</div>
 <p className="help-note">Choose the python.exe in an environment containing gallery-dl 1.32.14, Requests 2.34.2 and yt-dlp 2026.8.19. This enables Instagram, X, Pinterest and TikTok photos. FFmpeg enables video preparation and previews; FFprobe in the same folder improves inspection.</p>
 <details><summary>Setup instructions</summary><p className="help-note">Install Python from python.org. In PowerShell, create a separate environment and install the supported packages directly from PyPI:</p><pre className="help-note">{"python -m venv \"$env:LOCALAPPDATA\\SavedDeskTools\"\n& \"$env:LOCALAPPDATA\\SavedDeskTools\\Scripts\\python.exe\" -m pip install gallery-dl==1.32.14 requests==2.34.2 yt-dlp==2026.8.19 yt-dlp-ejs==0.8.0"}</pre><p className="help-note">Choose SavedDeskTools\Scripts\python.exe above. Obtain FFmpeg separately from a supplier linked by ffmpeg.org/download.html and select its ffmpeg.exe. Keep these third-party installations separate from any SavedDesk package you redistribute.</p></details>
 {message&&<p className="help-note" role="status">{message}</p>}
 </section>;
}
