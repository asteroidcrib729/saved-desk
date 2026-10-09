"use client";
import { platformLabel } from "@/lib/platforms";

import { memo, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { bridge } from "@/lib/desktop-bridge";
import type { LibraryItem, DeletionTarget } from "@/lib/contracts";
import { ContentThumbnail } from "./media-dialog";
import { ScrollArea } from "./scroll-area";
import { Icon } from "./icon";

const ROW_HEIGHT = 88;
const WINDOW_SIZE = 18;
const CACHE_SIZE = 64;
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export const LibraryList = memo(function LibraryList({ items, queryKey, version, native, open, remove }: {
  items: LibraryItem[]; queryKey: string; version: number; native: boolean; open: (item: LibraryItem) => void; remove:(target:DeletionTarget)=>void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const requestBusy = useRef(false);
  const cache = useRef(new Map<number, string>());
  const [start, setStart] = useState(0);
  const [selected,setSelected]=useState<Set<number>>(new Set());
  const anchor=useRef<number|null>(null);
  useEffect(()=>{setSelected(new Set());anchor.current=null;},[queryKey]);
  useEffect(()=>{const current=new Set(items.map(item=>item.id));setSelected(previous=>{const next=new Set([...previous].filter(id=>current.has(id)));return next.size===previous.size?previous:next;});},[items]);
  function toggle(id:number,range:boolean){
    const from=items.findIndex(item=>item.id===anchor.current),to=items.findIndex(item=>item.id===id);
    setSelected(previous=>{const next=new Set(previous),add=!previous.has(id);
      const chosen=range&&from>=0?items.slice(Math.min(from,to),Math.max(from,to)+1).map(item=>item.id):[id];
      for(const key of chosen){if(add)next.add(key);else next.delete(key);}return next;
    });anchor.current=id;
  }
  function reviewSelection(){if(selected.size)remove({kind:"posts",id:[...selected].sort((a,b)=>a-b)});}

  const [previews, setPreviews] = useState<Record<string, string>>({});
  const startIndex = Math.min(start, Math.max(0, items.length - 1));
  const visible = items.slice(startIndex, startIndex + WINDOW_SIZE);
  const idsKey = visible.filter(item => item.available && !item.prototype && item.kind !== "text" && item.kind !== "audio").map(item => item.id).join(",");

  useEffect(() => {
    if (list.current) list.current.scrollTop = 0;
    setStart(0);
  }, [queryKey]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const ids = idsKey.split(",").filter(Boolean).map(Number);
    async function load(attempt = 0) {
      const missing = ids.filter(id => !cache.current.has(id));
      if (!native || !missing.length || disposed) return;
      // Debounce scrolling, retain cached images, and never overlap batches.
      if (requestBusy.current) { timer = setTimeout(() => load(attempt), 150); return; }
      requestBusy.current = true;
      try {
        const values = await bridge.thumbnails(missing);
        for (const [id, value] of Object.entries(values)) if (value) {
          cache.current.delete(Number(id));
          cache.current.set(Number(id), value);
        }
        while (cache.current.size > CACHE_SIZE) cache.current.delete(cache.current.keys().next().value!);
        if (!disposed) {
          setPreviews(Object.fromEntries(cache.current));
          if (attempt < 2 && missing.some(id => !cache.current.has(id))) timer = setTimeout(() => load(attempt + 1), 3000);
        }
      } catch { if (!disposed && attempt < 2) timer = setTimeout(() => load(attempt + 1), 3000); }
      finally { requestBusy.current = false; }
    }
    timer = setTimeout(() => load(), 120);
    return () => { disposed = true; clearTimeout(timer); };
  }, [idsKey, native, version]);

  function scroll() {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const next = Math.max(0, Math.floor((list.current?.scrollTop ?? 0) / ROW_HEIGHT) - 3);
      setStart(previous => previous === next ? previous : next);
    });
  }
  function focusPost(index:number){
    const bounded=Math.max(0,Math.min(items.length-1,index));
    const element=list.current;if(!element||!items.length)return;
    const top=bounded*ROW_HEIGHT;
    if(top<element.scrollTop)element.scrollTop=top;
    else if(top+ROW_HEIGHT>element.scrollTop+element.clientHeight)element.scrollTop=top+ROW_HEIGHT-element.clientHeight;
    // Commit the bounded row window before the next key event can read focus.
    flushSync(()=>setStart(Math.max(0,Math.floor(element.scrollTop/ROW_HEIGHT)-3)));
    element.querySelector<HTMLButtonElement>(`button[data-index="${bounded}"]`)?.focus({preventScroll:true});
  }
  function key(event:React.KeyboardEvent<HTMLDivElement>){
    if(native&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="a"){event.preventDefault();setSelected(new Set(items.map(item=>item.id)));return;}
    if(native&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      if(event.key==="Delete"&&selected.size){event.preventDefault();reviewSelection();return;}
      if(event.key==="Escape"&&selected.size){event.preventDefault();setSelected(new Set());anchor.current=null;return;}
    }
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>("button[data-index]");
    if(!button)return;
    const index=Number(button.dataset.index);
    const jump:Record<string,number>={ArrowDown:index+1,ArrowUp:index-1,Home:0,End:items.length-1,PageDown:index+Math.max(1,Math.floor((list.current?.clientHeight??360)/ROW_HEIGHT)),PageUp:index-Math.max(1,Math.floor((list.current?.clientHeight??360)/ROW_HEIGHT))};
    if(event.key in jump){event.preventDefault();focusPost(jump[event.key]);}
    else if(event.key==="Tab"){
      const next=index+(event.shiftKey?-1:1);
      if(next>=0&&next<items.length&&(next<startIndex||next>=startIndex+visible.length)){event.preventDefault();focusPost(next);}
    }
  }
  return <>
    {native&&<div className="selection-toolbar" role="group" aria-label="Post selection">
      <span role="status" aria-live="polite">{selected.size} {selected.size===1?"post":"posts"} selected</span>
      <button className="secondary" onClick={()=>{setSelected(selected.size===items.length?new Set():new Set(items.map(item=>item.id)));anchor.current=null;}}>{selected.size===items.length?"Deselect this page":"Select this page"}</button>
      <button className="text-button" disabled={!selected.size} onClick={()=>{setSelected(new Set());anchor.current=null;}}>Clear selection</button>
      <button className="danger-button" disabled={!selected.size} onClick={reviewSelection}>Delete selected ({selected.size})</button>
      <p className="selection-hint">Select posts using their checkboxes; Shift-click selects a range. Selection clears when the page or filters change.</p>
    </div>}
    <div className="list-head"><span>CONTENT</span><span>COLLECTION</span><span>SAVED</span><span /></div>
    <ScrollArea viewportRef={list} className="library-scroll" viewportClassName="virtual-list" label="Saved posts" role="list" aria-label="Saved posts on this page" aria-describedby="library-keyboard-help" onKeyDown={key} onScroll={scroll} data-testid="library-list">
    <div role="presentation" style={{ height: items.length * ROW_HEIGHT, position: "relative" }}>
      {visible.map((item, index) => <article key={item.id} className={`library-row${native?" selectable-row":""}${selected.has(item.id)?" selected-row":""}`} role="listitem" aria-posinset={startIndex+index+1} aria-setsize={items.length} style={{ position: "absolute", top: (startIndex + index) * ROW_HEIGHT, width: "100%" }}>
        <div className="row-content">{native&&<label className="post-select"><input type="checkbox" checked={selected.has(item.id)} onChange={()=>{}} onClick={event=>toggle(item.id,event.shiftKey)} aria-label={`Select post by ${item.creator}`} aria-describedby={`post-description-${item.id}`}/></label>}<ContentThumbnail item={item} preview={previews[item.id]} /><div className="content-copy" id={`post-description-${item.id}`}>
          <strong title={item.creator}>{item.creator}</strong><p title={item.caption}>{item.caption}</p>
          <span className="source-label"><Icon name={item.source} size={12} />{platformLabel(item.source)}{item.prototype && " \u00b7 Test content"}</span>
        </div></div>
        <span className="collection-tag" title={item.collection}>{item.available?item.collection:"Files missing in save folder"}</span>
        <span className="saved-date">{dateFormatter.format(new Date(item.savedAt))}</span>
        <div className="row-actions">{native&&<button className="row-delete" title="Delete post and all saved copies" aria-label={`Delete post by ${item.creator}`} onClick={()=>remove({kind:"post",id:item.id})}><Icon name="trash" size={18}/></button>}
        <button className="row-open" data-index={startIndex+index} onClick={() => open(item)} aria-label="View saved files" aria-describedby={`post-description-${item.id}`}><Icon name="arrow" size={18} /></button></div>
      </article>)}
    </div>
  </ScrollArea></>;
});
