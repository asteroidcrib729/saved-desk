"use client";
import {useEffect,useRef,useState} from "react";
import {bridge} from "@/lib/desktop-bridge";
type Status={ffmpegReady:boolean;galleryReady:boolean};
export function DownloadToolsNotice({native,settings}:{native:boolean;settings:()=>void}){
 const [status,setStatus]=useState<Status|null>(null);
 const ready=useRef(false);
 useEffect(()=>{
  if(!native)return;
  let stopped=false,last=0;
  const update=()=>{
   if(ready.current||Date.now()-last<10000)return;
   last=Date.now();
   void bridge.downloadToolsStatus().then(value=>{if(!stopped&&value){ready.current=value.ffmpegReady&&value.galleryReady;setStatus(value);}}).catch(()=>{});
  };
  const changed=(event:Event)=>{const value=(event as CustomEvent<Status>).detail;if(value&&typeof value.ffmpegReady==="boolean"&&typeof value.galleryReady==="boolean"){ready.current=value.ffmpegReady&&value.galleryReady;setStatus(value);}};
  update();window.addEventListener("focus",update);window.addEventListener("download-tools-changed",changed);
  return()=>{stopped=true;window.removeEventListener("focus",update);window.removeEventListener("download-tools-changed",changed);};
 },[native]);
 if(!status||status.ffmpegReady&&status.galleryReady)return null;
 return <aside className="panel setup-notice" aria-label="Download setup"><div><strong>{status.ffmpegReady?"Public video downloads are ready":"Video tools need attention"}</strong><p className="help-note">{status.ffmpegReady?"YouTube, Facebook and TikTok video links and Discord attachments do not require account connection. Set up separate gallery tools for Instagram, X, Pinterest and TikTok photos.":"Repair the included video tools or select a working FFmpeg installation before starting a video download."}</p></div><button className="secondary" onClick={settings}>Open download tools</button></aside>;
}
