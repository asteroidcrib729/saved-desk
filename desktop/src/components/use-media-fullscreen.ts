"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { flushSync } from "react-dom";

type Frame={element:HTMLElement;x:number;y:number;width:number};
type Motion={animation:Animation;before:Frame;after:Frame;deadline:number};
function frame(stage:HTMLElement|null):Frame|null{
  const element=stage?.querySelector<HTMLElement>("video,.image-viewport img");
  if(!element)return null;
  const rect=element.getBoundingClientRect();
  let width=rect.width;
  if(element instanceof HTMLVideoElement&&element.videoWidth&&element.videoHeight){
    width=Math.min(rect.width,rect.height*element.videoWidth/element.videoHeight);
  }
  if(!width)return null;
  return {element,x:rect.x+rect.width/2,y:rect.y+rect.height/2,width};
}

// Measure once before/after a fullscreen layout change; animate only the media's
// transform. The same decoder and source survive, without per-frame layout work.
export function useMediaFullscreen(stage:RefObject<HTMLDivElement|null>,changed:(owned:boolean,wasOwned:boolean)=>void){
  const previous=useRef<Frame|null>(null),motion=useRef<Motion|null>(null);
  const shell=useRef<HTMLDialogElement|null>(null),backdrop=useRef<Animation|null>(null);
  const unlockTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const release=useCallback(()=>{
    if(unlockTimer.current!==null)clearTimeout(unlockTimer.current);unlockTimer.current=null;
    if(shell.current){
      delete shell.current.dataset.fullscreenShell;
      for(const key of ["left","top","width","height","slot-height"])shell.current.style.removeProperty(`--viewer-${key}`);
      shell.current=null;
    }
  },[]);
  const freeze=useCallback(()=>{
    if(unlockTimer.current!==null)clearTimeout(unlockTimer.current);unlockTimer.current=null;
    const node=stage.current?.closest("dialog");if(!node||shell.current)return;
    const rect=node.getBoundingClientRect(),slot=node.querySelector(".media-stage-slot")?.getBoundingClientRect();
    for(const [key,value] of Object.entries({left:rect.x,top:rect.y,width:rect.width,height:rect.height,"slot-height":slot?.height??0}))node.style.setProperty(`--viewer-${key}`,`${value}px`);
    shell.current=node;node.dataset.fullscreenShell="true";
  },[stage]);
  const shade=useCallback((entering:boolean)=>{
    backdrop.current?.cancel();backdrop.current=null;
    const node=stage.current?.closest("dialog")??shell.current;
    if(!node||matchMedia("(prefers-reduced-motion: reduce)").matches)return;
    // Fade the modal's existing backdrop, never capture media or allocate a screenshot.
    backdrop.current=node.animate([{opacity:entering?187/255:1},{opacity:entering?1:187/255}],
      {duration:200,easing:"ease-out",pseudoElement:"::backdrop",fill:entering?"forwards":"none"});
  },[stage]);
  const onChanged=useRef(changed);onChanged.current=changed;
  const capture=useCallback(()=>{previous.current=frame(stage.current);},[stage]);
  const toggle=useCallback(async()=>{
    capture();
    const entering=!document.fullscreenElement;
    if(entering){freeze();shade(true);}
    try{
      if(!entering)await document.exitFullscreen();
      else await stage.current?.requestFullscreen();
    }catch(error){if(entering){release();backdrop.current?.cancel();}throw error;}
  },[capture,stage,freeze,release,shade]);
  useEffect(()=>{
    let wasOwned=false;
    const preference=matchMedia("(prefers-reduced-motion: reduce)");
    const cancel=()=>{const running=motion.current;motion.current=null;running?.animation.cancel();};
    const animate=(before:Frame,after:Frame,duration:number)=>{
      const host=stage.current;if(!host)return;
      host.dataset.fullscreenMotion="true";
      const animation=after.element.animate([
        {transform:`translate(${before.x-after.x}px,${before.y-after.y}px) scale(${before.width/after.width})`},
        {transform:"none"},
      ],{duration,easing:"cubic-bezier(.2,.7,.3,1)"});
      motion.current={animation,before,after,deadline:performance.now()+duration};
      const finish=()=>{if(motion.current?.animation===animation){motion.current=null;delete host.dataset.fullscreenMotion;}};
      animation.onfinish=finish;animation.oncancel=finish;
    };
    // WebView2 may resize the window more than once after fullscreenchange.
    // Retarget from the current interpolated image rather than restarting or snapping.
    const settled=()=>{
      if(document.fullscreenElement===stage.current&&stage.current)return;
      if(unlockTimer.current!==null)clearTimeout(unlockTimer.current);
      unlockTimer.current=setTimeout(release,220);
    };
    const resized=()=>{
      if(shell.current&&!document.fullscreenElement)settled();
      const running=motion.current;if(!running)return;
      const progress=running.animation.effect?.getComputedTiming().progress??1;
      const before={element:running.after.element,
        x:running.before.x+(running.after.x-running.before.x)*progress,
        y:running.before.y+(running.after.y-running.before.y)*progress,
        width:running.before.width+(running.after.width-running.before.width)*progress};
      const remaining=running.deadline-performance.now();
      cancel();const after=frame(stage.current);
      if(after&&before.element===after.element&&remaining>0&&!preference.matches)animate(before,after,remaining);
      else if(stage.current)delete stage.current.dataset.fullscreenMotion;
      previous.current=after;
    };
    const reduced=()=>{if(preference.matches){cancel();backdrop.current?.cancel();if(stage.current)delete stage.current.dataset.fullscreenMotion;}};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&document.fullscreenElement===stage.current)capture();};
    const update=()=>{
      const owned=!!stage.current&&document.fullscreenElement===stage.current;
      if(!owned&&!wasOwned)return;
      const before=previous.current;
      if(!owned){shade(false);settled();}
      cancel();
      flushSync(()=>onChanged.current(owned,wasOwned));
      const after=frame(stage.current),host=stage.current;
      if(host&&before&&after&&before.element===after.element&&!preference.matches)animate(before,after,200);
      else if(host)delete host.dataset.fullscreenMotion;
      previous.current=after;wasOwned=owned;
    };
    document.addEventListener("keydown",escape,true);
    document.addEventListener("fullscreenchange",update);
    window.addEventListener("resize",resized);
    preference.addEventListener("change",reduced);
    return()=>{document.removeEventListener("keydown",escape,true);document.removeEventListener("fullscreenchange",update);window.removeEventListener("resize",resized);preference.removeEventListener("change",reduced);cancel();backdrop.current?.cancel();release();if(stage.current)delete stage.current.dataset.fullscreenMotion;};
  },[capture,stage,release,shade]);
  return toggle;
}
