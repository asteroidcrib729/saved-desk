"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { ScrollArea } from "./scroll-area";
import { Icon } from "./icon";
import { bridge } from "@/lib/desktop-bridge";

function clock(seconds:number){
  if(!Number.isFinite(seconds))return "0:00";
  const value=Math.max(0,Math.floor(seconds)),hours=Math.floor(value/3600),minutes=Math.floor(value/60)%60;
  return `${hours?`${hours}:`:""}${hours?String(minutes).padStart(2,"0"):minutes}:${String(value%60).padStart(2,"0")}`;
}

// Native HTML video decoding with a small, keyboard-accessible control surface.
// Fullscreen targets the persistent post frame so navigation survives file changes.
export function VideoPlayer({source,name,playerRef,fullscreenTrigger,fullscreen,toggleFullscreen,failed}:{
  source:string;name:string;playerRef:RefObject<HTMLMediaElement|null>;fullscreenTrigger:RefObject<HTMLButtonElement|null>;
  fullscreen:boolean;toggleFullscreen:()=>void;failed:()=>void;
}){
  const video=useRef<HTMLVideoElement>(null);
  const controls=useRef<HTMLDivElement>(null);
  const hideTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const fullscreenActive=useRef(fullscreen);fullscreenActive.current=fullscreen;
  const keyboard=useRef(false);
  const interacting=useRef(false);
  const menuOpen=useRef(false);
  const [hidden,setHidden]=useState(false);
  const [repeat,setRepeat]=useState(false);
  useEffect(()=>{try{setRepeat(localStorage.getItem("saveddesk.video.repeat")==="true");}catch{}},[]);
  function toggleRepeat(){setRepeat(value=>{const next=!value;try{localStorage.setItem("saveddesk.video.repeat",String(next));}catch{}return next;});reveal();}
  const volumeReady=useRef(false),volumeEpoch=useRef(0);
  const currentVolume=useRef({volume:1,muted:false});
  const pendingVolume=useRef<{volume:number;muted:boolean}|null>(null);
  const volumeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  function flushVolume(){if(volumeTimer.current!==null){clearTimeout(volumeTimer.current);volumeTimer.current=null;}const pending=pendingVolume.current;pendingVolume.current=null;if(pending)void bridge.savePlayerPreferences(pending).catch(()=>{});}
  useEffect(()=>{
    const value=video.current;if(!value)return;volumeReady.current=false;let cancelled=false;const epoch=volumeEpoch.current;
    const apply=(saved:{volume:number;muted:boolean})=>{currentVolume.current=saved;value.volume=saved.volume;value.muted=saved.muted;volumeReady.current=true;update();};
    let volume=1,muted=false;
    try{const saved=JSON.parse(localStorage.getItem("saveddesk.video.volume")??"null");if(saved){if(typeof saved.volume==="number"&&Number.isFinite(saved.volume)&&saved.volume>=0&&saved.volume<=1)volume=saved.volume;muted=saved.muted===true;}}catch{}
    apply({volume,muted});
    void bridge.playerPreferences().then(saved=>{if(saved&&!cancelled&&volumeEpoch.current===epoch)apply(saved);}).catch(()=>{});
    return()=>{cancelled=true;flushVolume();volumeReady.current=false;};
  },[source]);
  function rememberVolume(){const value=video.current;if(value&&volumeReady.current){const saved={volume:value.volume,muted:value.muted};if(saved.volume!==currentVolume.current.volume||saved.muted!==currentVolume.current.muted){currentVolume.current=saved;volumeEpoch.current++;try{localStorage.setItem("saveddesk.video.volume",JSON.stringify(saved));}catch{}pendingVolume.current=saved;if(volumeTimer.current!==null)clearTimeout(volumeTimer.current);volumeTimer.current=setTimeout(flushVolume,100);}}update();}
  const reveal=useCallback(()=>{
    setHidden(false);
    if(hideTimer.current!==null)clearTimeout(hideTimer.current);
    if(!fullscreenActive.current)return;
    hideTimer.current=setTimeout(()=>{
      hideTimer.current=null;
      const active=document.activeElement;
      if(interacting.current||menuOpen.current||(keyboard.current&&!!active&&controls.current?.parentElement?.contains(active)))return;
      // Never leave mouse-focused controls hidden with keyboard focus inside.
      if(active&&controls.current?.parentElement?.contains(active)){video.current?.focus({preventScroll:true});}
      setHidden(true);
    },3000);
  },[]);
  useEffect(()=>{
    keyboard.current=false;interacting.current=false;menuOpen.current=false;reveal();
    if(!fullscreen)return()=>{if(hideTimer.current!==null)clearTimeout(hideTimer.current);};
    const move=(event:PointerEvent)=>{if(event.pointerType==="mouse"){keyboard.current=false;reveal();}};
    const release=()=>{if(interacting.current){interacting.current=false;reveal();}};
    window.addEventListener("pointermove",move);
    window.addEventListener("pointerup",release);
    window.addEventListener("pointercancel",release);
    return()=>{if(hideTimer.current!==null)clearTimeout(hideTimer.current);window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",release);window.removeEventListener("pointercancel",release);};
  },[fullscreen,reveal]);
  const [state,setState]=useState({time:0,duration:0,playing:false,muted:false,volume:1,speed:1});
  function update(){const value=video.current;if(value)setState({time:value.currentTime,duration:Number.isFinite(value.duration)?value.duration:0,playing:!value.paused,muted:value.muted,volume:value.volume,speed:value.playbackRate});}
  function seek(time:number){const value=video.current;if(value&&state.duration>0){value.currentTime=Math.max(0,Math.min(state.duration,time));update();}}
  async function play(){const value=video.current;if(!value)return;try{if(value.paused)await value.play();else value.pause();}catch(error){if(!(error instanceof DOMException&&error.name==="AbortError"))failed();}}
  function surface(target:EventTarget){
    return target instanceof Element&&!target.closest('button,input,select,option,[role="scrollbar"]');
  }
  function key(event:React.KeyboardEvent<HTMLVideoElement>){
    if(event.altKey||event.ctrlKey||event.metaKey)return;
    const value=video.current;if(!value)return;
    if(["ArrowLeft","ArrowRight"].includes(event.key)){event.preventDefault();seek(value.currentTime+(event.key==="ArrowLeft"?-5:5));}
    else if(["ArrowUp","ArrowDown"].includes(event.key)){event.preventDefault();value.volume=Math.max(0,Math.min(1,value.volume+(event.key==="ArrowUp"?.1:-.1)));update();}
    else if(event.key===" "){event.preventDefault();if(!event.repeat)void play();}
  }
  return <div className={`video-player ${fullscreen&&hidden?"controls-hidden":""}`} role="group" aria-label="Video player controls"
    onPointerDownCapture={event=>{keyboard.current=false;interacting.current=true;menuOpen.current=event.target instanceof HTMLSelectElement;reveal();}}
    onPointerUpCapture={event=>{
      interacting.current=false;reveal();
    }}
    onClick={event=>{
      if(event.button===0&&surface(event.target)){
        keyboard.current=false;video.current?.focus({preventScroll:true});void play();
      }
    }}
    onPointerCancel={()=>{interacting.current=false;reveal();}}
    onContextMenuCapture={event=>{event.preventDefault();}}
    onKeyDownCapture={event=>{keyboard.current=true;flushSync(()=>reveal());}}
    onFocusCapture={event=>{if(controls.current?.parentElement?.contains(event.target as Node))reveal();}}
    onBlurCapture={event=>{if(!controls.current?.parentElement?.contains(event.relatedTarget as Node|null)){menuOpen.current=false;interacting.current=false;reveal();}}}>

    <video ref={node=>{video.current=node;playerRef.current=node;}} src={source} tabIndex={0} playsInline loop={repeat} preload="metadata" aria-label={name} onKeyDown={key}
      onLoadedMetadata={update} onTimeUpdate={update} onDurationChange={update} onPlay={()=>{update();reveal();}} onPause={()=>{update();reveal();}} onEnded={()=>{update();reveal();}} onVolumeChange={rememberVolume} onRateChange={update} onError={failed}/>
    <ScrollArea viewportRef={controls} className="video-controls-shell" viewportClassName="video-controls" label="Playback controls" hidden={fullscreen&&hidden} role="group" aria-label="Playback controls">
      <button className="secondary" onClick={()=>void play()} aria-label={state.playing?"Pause video":"Play video"} title={state.playing?"Pause (K)":"Play (K)"}><Icon name={state.playing?"pause":"play"} size={20}/></button>
      <button className="secondary" disabled={!state.duration||state.time<=0} onClick={()=>seek(state.time-10)} aria-label="Back 10 seconds" title="Back 10 seconds">-10s</button>
      <button className="secondary" disabled={!state.duration||state.time>=state.duration} onClick={()=>seek(state.time+10)} aria-label="Forward 10 seconds" title="Forward 10 seconds">+10s</button>
      <button className="secondary" onClick={()=>{if(video.current)video.current.muted=!video.current.muted;}} aria-label={state.muted?"Unmute video":"Mute video"} title={state.muted?"Unmute (M)":"Mute (M)"}><Icon name={state.muted?"muted":"volume"} size={20}/></button>
      <input className="player-volume" type="range" aria-label="Video volume" aria-valuetext={state.muted?"Muted":`${Math.round(state.volume*100)}%`} min={0} max={100} value={state.muted?0:Math.round(state.volume*100)} onChange={event=>{if(video.current){video.current.volume=Number(event.target.value)/100;video.current.muted=false;update();}}}/>
      <button className="secondary player-repeat" onClick={toggleRepeat} aria-label="Repeat video" aria-pressed={repeat} title={repeat?"Repeat on":"Repeat off"}><Icon name="refresh" size={20}/></button>
      <select aria-label="Playback speed" value={state.speed} onChange={event=>{if(video.current){video.current.playbackRate=Number(event.target.value);update();}menuOpen.current=false;interacting.current=false;reveal();}}>{[.5,1,1.25,1.5,2].map(speed=><option key={speed} value={speed}>{speed}x</option>)}</select>
      <span className="player-time" aria-hidden="true">{clock(state.time)}</span><input className="player-position" type="range" aria-label="Video position" aria-valuetext={`${clock(state.time)} of ${clock(state.duration)}`} min={0} max={state.duration||1} step={.1} value={Math.min(state.time,state.duration)} disabled={!state.duration} onChange={event=>seek(Number(event.target.value))}/><span className="player-time" aria-hidden="true">{clock(state.duration)}</span>
      <button ref={fullscreenTrigger} className="secondary player-fullscreen" aria-label={fullscreen?"Exit fullscreen":"Enter fullscreen"} title={fullscreen?"Exit fullscreen (Escape)":"Fullscreen (F)"} onClick={toggleFullscreen}><Icon name="fullscreen" size={22}/></button>
    </ScrollArea>
  </div>;
}
