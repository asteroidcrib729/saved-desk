"use client";

import { useEffect, useRef, useState } from "react";
import { bridge } from "@/lib/desktop-bridge";
import type { LibraryItem, SavedFile, DeletionTarget } from "@/lib/contracts";
import { ScrollArea } from "./scroll-area";
import { Icon } from "./icon";
import { VideoPlayer } from "./video-player";
import { useMediaFullscreen } from "./use-media-fullscreen";

export function ContentThumbnail({ item, preview }: { item: LibraryItem; preview?:string|null }) {
  return <div className={`content-thumbnail thumbnail-${item.nativeId.slice(-1)}`}>
    {preview ? <img src={preview} alt="" width={60} height={60} loading="lazy" decoding="async" /> : <Icon name={item.kind} size={27} />}
  </div>;
}

export function MediaDialog({ item, native, close, settings, remove }: { item:LibraryItem|null;native:boolean;close:()=>void;settings:()=>void;remove:(target:DeletionTarget)=>void }) {
  const dialog=useRef<HTMLDialogElement>(null);
  const stage=useRef<HTMLDivElement>(null);
  const playerRef=useRef<HTMLMediaElement>(null);
  const fullscreenTrigger=useRef<HTMLButtonElement>(null);
  const fullscreenCancel=useRef<HTMLButtonElement>(null);
  const [fullscreen,setFullscreen]=useState(false);
  const [files,setFiles]=useState<SavedFile[]>([]);
  const [selected,setSelected]=useState<number|null>(null);
  const [source,setSource]=useState("");
  const [text,setText]=useState("");
  const [zoom,setZoom]=useState(1);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [preparingVideo,setPreparingVideo]=useState(false);
  const [playbackRequest,setPlaybackRequest]=useState<{id:number}|null>(null);
  const file=files.find(value=>value.id===selected);
  const playable=files.filter(value=>value.available);
  const toggleFullscreen=useMediaFullscreen(stage,(owned,wasOwned)=>{
    setFullscreen(owned);
    // Move focus without scrolling the modal behind the fullscreen top layer.
    requestAnimationFrame(()=>{
      if(owned&&document.fullscreenElement===stage.current){
        if(playerRef.current instanceof HTMLVideoElement)playerRef.current.focus({preventScroll:true});
        else fullscreenCancel.current?.focus({preventScroll:true});
      }else if(wasOwned&&!document.fullscreenElement)(fullscreenTrigger.current??playerRef.current)?.focus({preventScroll:true});
    });
  });
  useEffect(()=>{
    let disposed=false;
    setFiles([]);setSelected(null);setError("");setSource("");
    if(item){
      setLoading(true);dialog.current?.showModal();
      bridge.postFiles(item.id).then(value=>{if(!disposed){setFiles(value);setSelected(value.find(f=>f.available)?.id??null);}})
        .catch(failure=>{if(!disposed)setError(String(failure));}).finally(()=>{if(!disposed)setLoading(false);});
    }else{dialog.current?.close();setLoading(false);}
    return ()=>{disposed=true;};
  },[item]);
  useEffect(()=>{
    let disposed=false;const abort=new AbortController();
    setSource("");setText("");setZoom(1);setError("");
    setPreparingVideo(false);
    const preparingTimer=setTimeout(()=>{if(!disposed&&item&&file?.available&&file.kind==="video")setPreparingVideo(true);},150);
    if(item&&file?.available) (file.kind==="video"?bridge.videoSource(file.id,playbackRequest?.id===file.id,file.playback).catch(async failure=>{if(!disposed)setError(String(failure));return bridge.mediaSource(file.id);}):bridge.mediaSource(file.id)).then(async value=>{
      if(disposed)return;
      if(file.kind==="text"){
        if(file.bytes>1024*1024)throw new Error("This text file is too large to display.");
        const response=await fetch(value,{signal:abort.signal});if(!response.ok)throw new Error("This file could not be read inside the selected save folder.");
        const body=await response.text();if(!disposed)setText(body);
      }else setSource(value);
    }).catch(failure=>{if(!disposed)setError(String(failure));}).finally(()=>{clearTimeout(preparingTimer);if(!disposed)setPreparingVideo(false);});
    return ()=>{disposed=true;clearTimeout(preparingTimer);abort.abort();};
  },[file,item,playbackRequest]);
  useEffect(()=>{const player=playerRef.current;return ()=>{player?.pause();player?.removeAttribute("src");player?.load();};},[source]);
  function move(direction:number){const index=playable.findIndex(f=>f.id===selected);const next=playable[index+direction];if(next)setSelected(next.id);}
  async function act(work:()=>Promise<void>){try{await work();}catch(failure){setError(String(failure));}}
  function shortcut(event:React.KeyboardEvent<HTMLDialogElement>) {
    if(event.key==="Tab"&&stage.current&&document.fullscreenElement===stage.current&&file?.kind!=="audio"){
      const controls=Array.from(stage.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')).filter(element=>element.getClientRects().length>0);
      const index=controls.indexOf(document.activeElement as HTMLElement);
      if(controls.length&&((event.shiftKey&&index<=0)||(!event.shiftKey&&(index<0||index===controls.length-1)))){
        event.preventDefault();controls[event.shiftKey?controls.length-1:0].focus();
      }
      return;
    }
    if(!item||!file?.available||event.ctrlKey||event.metaKey||event.repeat)return;
    const target=event.target as HTMLElement;
    if(target.closest("input,select,textarea,[contenteditable=true]"))return;
    if((event.altKey||(file.kind==="image"&&!target.closest("video,audio")&&!(zoom>1&&target.closest(".image-viewport"))))&&["ArrowLeft","ArrowRight"].includes(event.key)) {
      event.preventDefault();move(event.key==="ArrowLeft"?-1:1);return;
    }
    if(event.altKey)return;
    const key=event.key.toLowerCase();
    if(file.kind==="image"&&["+","=","-","0"].includes(key)) {
      event.preventDefault();setZoom(value=>key==="0"?1:Math.max(1,Math.min(4,value+(key==="-"?-0.5:0.5))));
    }else if(key==="f"&&(file.kind!=="text"||fullscreen)){
      event.preventDefault();act(toggleFullscreen);
    }else if(["video","audio"].includes(file.kind)&&["k","m"].includes(key)) {
      event.preventDefault();const player=playerRef.current;if(!player)return;
      if(key==="m")player.muted=!player.muted;else act(async()=>{if(player.paused)await player.play();else player.pause();});
    }
  }
  return <dialog ref={dialog} className="media-dialog" aria-labelledby="media-title" onCancel={event=>{if(fullscreen||(stage.current&&document.fullscreenElement===stage.current)){event.preventDefault();if(document.fullscreenElement)act(toggleFullscreen);}else close();}} onClose={close} onKeyDown={shortcut}>
    <ScrollArea className="dialog-scroll" label="Post details" ><div className="dialog-content">
      <div className="media-heading"><div><h2 id="media-title">{item?.creator}</h2><p>{item?.caption}</p>{native&&item&&!item.prototype&&item.source!=="discord"&&<button className="text-button" onClick={()=>act(()=>bridge.openSourcePost(item.id))}>Open original post in browser</button>}</div><div className="control-actions">{native&&item&&<button className="text-button delete-action" onClick={()=>remove({kind:"post",id:item.id})}>Delete post</button>}<button autoFocus className="secondary" onClick={close}>Close</button></div></div>
      {error&&!fullscreen&&<p className="error-banner" role="alert">{error}</p>}
      {!native&&<p className="help-note">The browser preview contains sample records only. Desktop downloads create real files.</p>}
      {loading&&<p className="help-note">Loading saved files...</p>}
      {preparingVideo&&<p className="help-note" role="status">Preparing compatible playback. Creating a playback copy can take time; the original is preserved.</p>}
      {item&&file?.available&&<>
        <div className="media-stage-slot"><div ref={stage} className="media-stage" aria-label={file.kind==="video"?"Video player":"Content viewer"}>
          <div className="media-surface">
          {source&&file.kind==="image"&&<ScrollArea className="media-scroll" viewportClassName="image-viewport" label="Image" tabIndex={0} role="region" aria-label="Image; scroll to pan when zoomed"><img src={source} alt={item.caption||file.name} style={zoom===1?undefined:{maxWidth:"none",maxHeight:"none",width:`${zoom*100}%`}} onError={()=>setError("This image could not be displayed. Check its location in Settings, or open it with Windows.")} /></ScrollArea>}
          {source&&file.kind==="video"&&<VideoPlayer key={source} source={source} name={file.name} playerRef={playerRef} fullscreenTrigger={fullscreenTrigger} fullscreen={fullscreen} toggleFullscreen={()=>void act(toggleFullscreen)} failed={()=>setError("This video could not be played. Its codec may be unsupported by Windows WebView2, or the file may have moved. Check Settings or use Open with Windows.")}/>}
          {source&&file.kind==="audio"&&<audio ref={node=>{playerRef.current=node;}} key={source} src={source} controls preload="metadata" aria-label={file.name} onError={()=>setError("This audio file could not be played. Try Open with Windows.")} />}
          {file.kind==="text"&&<ScrollArea as="pre" className="media-scroll" viewportClassName="text-viewer" label="Saved text">{text||"Loading text..."}</ScrollArea>}
          </div>
          {error&&fullscreen&&<ScrollArea className="fullscreen-error-scroll" viewportClassName="error-banner" label="Playback error" role="alert">{error}</ScrollArea>}
          <div className="fullscreen-controls" role="group" aria-label="Fullscreen viewer controls">
            <button className="fullscreen-edge fullscreen-previous" aria-label="Previous" title="Previous file (Alt + Left)" disabled={playable.findIndex(f=>f.id===selected)<=0} onClick={()=>move(-1)}><Icon name="chevron-left" size={28}/></button>
            <span className="sr-only" aria-live="polite">{playable.findIndex(f=>f.id===selected)+1} of {playable.length} - {file.name}</span>
            <button className="fullscreen-edge fullscreen-next" aria-label="Next" title="Next file (Alt + Right)" disabled={playable.findIndex(f=>f.id===selected)>=playable.length-1} onClick={()=>move(1)}><Icon name="chevron-right" size={28}/></button>
            {file.kind!=="video"&&<button ref={fullscreenCancel} className="fullscreen-edge fullscreen-close" aria-label="Close fullscreen" title="Exit fullscreen (Escape)" onClick={()=>act(toggleFullscreen)}><Icon name="close" size={24}/></button>}
          </div>
        </div>
        </div>
        <div className="viewer-controls"><button className="secondary" disabled={playable.findIndex(f=>f.id===selected)<=0} onClick={()=>move(-1)}>Previous file</button><span aria-live="polite">{playable.findIndex(f=>f.id===selected)+1} of {playable.length} · {file.name}</span><button className="secondary" disabled={playable.findIndex(f=>f.id===selected)>=playable.length-1} onClick={()=>move(1)}>Next file</button></div>
        <div className="control-actions">
          {file.kind==="image"&&<><button className="secondary" disabled={zoom<=1} onClick={()=>setZoom(value=>Math.max(1,value-0.5))} aria-label="Zoom out">-</button><span aria-live="polite">{Math.round(zoom*100)}%</span><button className="secondary" disabled={zoom>=4} onClick={()=>setZoom(value=>Math.min(4,value+0.5))} aria-label="Zoom in">+</button><button className="text-button" onClick={()=>setZoom(1)}>Fit image</button></>}
          {!["text","video"].includes(file.kind)&&<button ref={fullscreenTrigger} className="secondary" onClick={()=>act(toggleFullscreen)}>Fullscreen</button>}
          {file.kind==="video"&&<button className="text-button" disabled={preparingVideo} onClick={()=>{setPreparingVideo(true);setPlaybackRequest({id:file.id});}}>Use compatible playback</button>}
          <button className="text-button" onClick={()=>act(()=>bridge.openMediaFile(file.id))}>Open with Windows</button>
        </div>
      </>}
      {file?.available&&<p className="help-note">Keyboard: Alt + Left/Right for saved files, F for fullscreen.{file.kind==="image"?" Images: Left/Right, + / - to zoom, 0 to fit.":file.kind==="video"||file.kind==="audio"?" Playback: K to play/pause, M to mute. Video: left-click the video or player background or press Space to play/pause; focused video arrows seek or change volume. Seek/volume sliders also accept arrow keys.":""} Escape closes the viewer or exits fullscreen.</p>}
      {native&&(files.some(saved=>!saved.available)||!!error)&&<div className="media-recovery"><p>Missing or moved files? Check your selected save folder and use Find moved files. For an unsupported video, try Open with Windows or the Compatible MP4 download profile.</p><button className="secondary" onClick={settings}>Open save location settings</button></div>}
      <h3>Saved files and copies</h3>
      {native&&!loading&&!files.length&&<p className="help-note">No saved copies are recorded for this post.</p>}
      <div className="saved-files">{files.map(saved=><article key={saved.id} className={selected===saved.id?"selected-file":""}>
        <div><strong>{saved.name}</strong><p>{(saved.bytes/1024/1024).toFixed(2)} MB · {saved.profile==="original"?"Default profile":"Resize fallback"} · {saved.quality==="original"?"Best available":`${saved.quality}p cap`}
        {!saved.available&&" · Not found in the selected save folder — choose Find moved files in Settings"}</p></div>
        <div className="control-actions"><button className="secondary" disabled={!saved.available} aria-pressed={selected===saved.id} onClick={()=>setSelected(saved.id)}>{saved.kind==="video"?"View video":saved.kind==="audio"?"View audio":"View file"}</button><button className="text-button" disabled={!saved.available} onClick={()=>act(()=>bridge.openMediaFile(saved.id))}>Open file</button><button className="text-button" disabled={!saved.available} onClick={()=>act(()=>bridge.openJobFolder(saved.jobId))}>Open folder</button>{native&&<button className="text-button delete-action" onClick={()=>remove({kind:"file",id:saved.id})}>Delete file</button>}</div>
      </article>)}</div>
      <p className="help-note">Only files inside your selected save folder can be viewed. Up to 100 recent files and copies are shown.</p>
    </div></ScrollArea>
  </dialog>;
}
