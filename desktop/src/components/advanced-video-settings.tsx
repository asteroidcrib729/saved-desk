"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { AdvancedVideoSettings } from "@/lib/contracts";
import { Icon } from "./icon";
import { ScrollArea } from "./scroll-area";

export function VideoSetting({label, explanation, disabled, value, onChange, children}: {
  label:string; explanation:string; disabled?:boolean; value:string|number; onChange:(value:string)=>void; children:ReactNode;
}) {
  const id=useId(),[help,setHelp]=useState(false);
  const popup=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!help)return;
    const dialog=popup.current;dialog?.showModal();
    return()=>{dialog?.close();if(trigger.current?.isConnected)trigger.current.focus({preventScroll:true});};
  },[help]);
  return <div className="video-setting"><div className="setting-label"><label htmlFor={id}>{label}</label><button ref={trigger} type="button" className="setting-info" aria-label={`About ${label}`} title={`About ${label}`} aria-haspopup="dialog" aria-expanded={help} aria-controls={help?`${id}-popup`:undefined} onClick={()=>setHelp(true)}><Icon name="info" size={18}/></button></div>
    <select id={id} disabled={disabled} value={value} onChange={e=>onChange(e.target.value)}>{children}</select>
    {help&&createPortal(<dialog ref={popup} id={`${id}-popup`} className="setting-popup" aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`}
      onCancel={event=>{event.preventDefault();event.stopPropagation();setHelp(false);}}
      onClose={event=>{event.stopPropagation();setHelp(false);}}
      onClick={event=>{if(event.target===event.currentTarget){const b=event.currentTarget.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)setHelp(false);}}}>
      <ScrollArea className="dialog-scroll" label="Setting information"><div className="dialog-content"><div className="media-heading"><h2 id={`${id}-title`}>About {label}</h2><button type="button" autoFocus className="secondary" aria-label="Close information" title="Close information" onClick={()=>setHelp(false)}><Icon name="close" size={18}/></button></div><p id={`${id}-help`} className="setting-explanation">{explanation}</p></div></ScrollArea>
    </dialog>,document.body)}
  </div>;
}

export function AdvancedVideoControls({value,onChange,disabled}: {value:AdvancedVideoSettings;onChange:(value:AdvancedVideoSettings)=>void;disabled?:boolean}) {
  return <div className="advanced-video-controls"><p className="help-note">These settings apply only when a video needs conversion. Playable video and compatible AAC audio are kept unchanged.</p><div className="settings-fields">
    <VideoSetting label="Encoding method" value={value.encoder} disabled={disabled} onChange={encoder=>onChange({...value,encoder:encoder as AdvancedVideoSettings["encoder"]})} explanation="Automatic uses a tested hardware encoder when available and falls back to software if it fails. Software uses your CPU only, with the speed and quality below. Both produce playable H.264 MP4; already compatible video is never re-encoded."><option value="auto">Automatic (hardware preferred)</option><option value="software">Software (CPU)</option></VideoSetting>
    <VideoSetting label="Software encoding speed" value={value.preset} disabled={disabled} onChange={preset=>onChange({...value,preset:preset as AdvancedVideoSettings["preset"]})} explanation="Very fast finishes sooner but usually creates larger files. Balanced and Smaller files spend more CPU time compressing the video. This affects software conversion only, including automatic fallback. Two encoder threads limit CPU use."><option value="superfast">Very fast</option><option value="fast">Balanced</option><option value="slow">Smaller files (slower)</option></VideoSetting>
    <VideoSetting label="Software video quality" value={value.crf} disabled={disabled} onChange={crf=>onChange({...value,crf:Number(crf) as AdvancedVideoSettings["crf"]})} explanation="High (CRF 18) retains more detail and uses more storage. Balanced (CRF 23) is the default. Compact (CRF 28) uses less storage with more visible compression. This applies to software conversion only; hardware uses its own balanced quality. Conversion cannot recover detail missing from the source."><option value={18}>High quality (CRF 18)</option><option value={23}>Balanced (CRF 23)</option><option value={28}>Compact (CRF 28)</option></VideoSetting>
    <VideoSetting label="Converted audio bitrate" value={value.audioBitrate} disabled={disabled} onChange={audioBitrate=>onChange({...value,audioBitrate:Number(audioBitrate) as AdvancedVideoSettings["audioBitrate"]})} explanation="Sets AAC audio bitrate only when the original audio needs conversion. A higher bitrate can preserve more detail and increases file size. Compatible AAC is copied without conversion. This setting does not improve the original recording or affect standalone audio downloads.">{[96,128,192,256].map(n=><option key={n} value={n}>{n} kbps{n===128?" (default)":""}</option>)}</VideoSetting>
  </div></div>;
}
