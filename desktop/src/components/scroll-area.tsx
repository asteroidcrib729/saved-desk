"use client";

import { useEffect, useId, useRef, useState, type HTMLAttributes, type ReactNode, type RefObject } from "react";

type Geometry={x:number;y:number;width:number;height:number;fullWidth:number;fullHeight:number};
// Keep browser scrolling/virtualization; paint only the lightweight rails ourselves.
export function ScrollArea({children,className="",viewportClassName="",as:Tag="div",viewportRef,label="Content",axis="both",...props}:HTMLAttributes<HTMLElement>&{
  children:ReactNode;viewportClassName?:string;as?:"div"|"main"|"aside"|"pre";viewportRef?:RefObject<HTMLElement|null>;label?:string;axis?:"both"|"vertical"|"horizontal";
}){
  const local=useRef<HTMLElement|null>(null),ref=viewportRef??local,id=useId();
  const [geometry,setGeometry]=useState<Geometry>({x:0,y:0,width:0,height:0,fullWidth:0,fullHeight:0});
  const drag=useRef<{axis:"x"|"y";start:number;scroll:number;travel:number;max:number}|null>(null);
  const [dragging,setDragging]=useState(false);
  useEffect(()=>{
    const element=ref.current;if(!element)return;let frame:number|null=null;
    const read=()=>{frame=null;const next={x:element.scrollLeft,y:element.scrollTop,width:element.clientWidth,height:element.clientHeight,fullWidth:element.scrollWidth,fullHeight:element.scrollHeight};setGeometry(previous=>Object.keys(next).every(key=>previous[key as keyof Geometry]===next[key as keyof Geometry])?previous:next);};
    const schedule=()=>{if(frame===null)frame=requestAnimationFrame(read);};
    const resize=new ResizeObserver(schedule);resize.observe(element);if(element.firstElementChild)resize.observe(element.firstElementChild);
    const mutation=new MutationObserver(schedule);mutation.observe(element,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["style","hidden"]});
    element.addEventListener("scroll",schedule,{passive:true});read();
    return()=>{resize.disconnect();mutation.disconnect();element.removeEventListener("scroll",schedule);if(frame!==null)cancelAnimationFrame(frame);};
  },[ref]);
  function rail(axis:"x"|"y"){
    const vertical=axis==="y",client=vertical?geometry.height:geometry.width,full=vertical?geometry.fullHeight:geometry.fullWidth,scroll=vertical?geometry.y:geometry.x,max=full-client;
    if(max<=1||client<=24)return null;
    const track=Math.max(0,client-16),length=Math.min(track,Math.max(28,track*client/full)),travel=track-length,position=max?scroll/max*travel:0;
    const set=(value:number)=>{const element=ref.current;if(element){if(vertical)element.scrollTop=Math.max(0,Math.min(max,value));else element.scrollLeft=Math.max(0,Math.min(max,value));}};
    return <div className={`scroll-rail scroll-${axis}`} role="scrollbar" tabIndex={0} aria-label={`${label}: ${vertical?"vertical":"horizontal"} scrollbar`} aria-controls={props.id??id} aria-orientation={vertical?"vertical":"horizontal"} aria-valuemin={0} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(Math.min(max,scroll))}
      onKeyDown={event=>{const key=event.key,steps:Record<string,number>=vertical?{ArrowUp:-60,ArrowDown:60,PageUp:-client*.9,PageDown:client*.9}:{ArrowLeft:-60,ArrowRight:60,PageUp:-client*.9,PageDown:client*.9};if(key in steps){event.preventDefault();set(scroll+steps[key]);}else if(key==="Home"||key==="End"){event.preventDefault();set(key==="Home"?0:max);}}}
      onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.focus({preventScroll:true});const bounds=event.currentTarget.getBoundingClientRect(),coordinate=vertical?event.clientY:event.clientX;const onThumb=(event.target as HTMLElement).classList.contains("scroll-thumb");const value=onThumb?scroll:(coordinate-(vertical?bounds.top:bounds.left)-length/2)/Math.max(1,travel)*max;set(value);drag.current={axis,start:coordinate,scroll:Math.max(0,Math.min(max,value)),travel,max};event.currentTarget.setPointerCapture(event.pointerId);setDragging(true);}}
      onPointerMove={event=>{const gesture=drag.current;if(gesture?.axis===axis)set(gesture.scroll+((vertical?event.clientY:event.clientX)-gesture.start)/Math.max(1,gesture.travel)*gesture.max);}}
      onPointerUp={event=>{drag.current=null;setDragging(false);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
      onLostPointerCapture={()=>{drag.current=null;setDragging(false);}}>
      <span className="scroll-thumb" style={vertical?{height:length,transform:`translateY(${position}px)`}:{width:length,transform:`translateX(${position}px)`}}/>
    </div>;
  }
  return <div className={`scroll-area ${className} ${dragging?"scroll-dragging":""}`}><Tag {...props} id={props.id??id} ref={(node:HTMLElement|null)=>{ref.current=node;}} className={`scroll-viewport ${viewportClassName}`}>{children}</Tag>{(geometry.fullHeight>geometry.height+1||geometry.fullWidth>geometry.width+1)&&<div role={Tag==="main"||Tag==="aside"?"navigation":undefined} aria-label={Tag==="main"||Tag==="aside"?`${label} scroll controls`:undefined}>{axis!=="horizontal"&&rail("y")}{axis!=="vertical"&&rail("x")}</div>}</div>;
}
