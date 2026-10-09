"use client";

import { useState } from "react";
import { bridge } from "@/lib/desktop-bridge";
import type { Job, DownloadProgress, DeletionTarget } from "@/lib/contracts";
import { Icon } from "./icon";

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function DownloadHistory({ jobs, native, refresh, report, remove, progress={} }: {
  jobs: Job[];
  progress?: Record<string,DownloadProgress>;
  native: boolean;
  refresh: () => Promise<void>;
  report: (message: string) => void;
  remove:(target:DeletionTarget)=>void;
}) {
  const [working, setWorking] = useState<string | null>(null);
  const [workingLabel, setWorkingLabel] = useState("Working...");
  async function act(job: Job, work: () => Promise<void>, label = "Working...") {
    setWorkingLabel(label);
    setWorking(job.id);
    try {
      await work();
      await refresh();
    } catch (failure) {
      report(typeof failure === "string" ? failure : failure instanceof Error ? failure.message : "The download could not be updated. Try again.");
    } finally {
      setWorking(null);
    }
  }
  return <section className="panel">
    <div className="section-top"><h2>Download history</h2></div>
    {!!jobs.length && <p className="help-note">Queued and running downloads appear first, followed by recent history. Up to 100 jobs are shown.</p>}
    {!jobs.length && <div className="empty-state"><div className="empty-icon"><Icon name="download" size={30} /></div><h3>No downloads yet</h3><p>Downloads and their results will appear here.</p></div>}
    {jobs.map(job => {
      const active = job.state === "running" || job.state === "queued";
      const resumable = job.supported!==false && ["paused", "interrupted", "failed"].includes(job.state);
      const disabled = working !== null;
      const current=progress[job.id];
      const percent=current?.phase==="downloading" && current.total ? Math.min(100,Math.floor(current.received/current.total*100)) : null;
      const bytes=(value:number)=>value<1024?`${value} B`:value<1024**2?`${(value/1024).toFixed(1)} KB`:`${(value/1024**2).toFixed(1)} MB`;
      const label=job.state==="queued"?"Waiting in queue":current?.phase==="processing"?"Checking and preparing the downloaded file":current?`Current file: ${bytes(current.received)}${current.total?` of ${bytes(current.total)} (${percent}%)`:" downloaded"}`:"Finding the next item or waiting for the platform";
      return <article className="job-card" key={job.id} aria-busy={working === job.id}>
        <div className={`job-icon ${job.state === "completed" ? "success" : ""}`}><Icon name={job.state === "completed" ? "check" : "download"} /></div>
        <div className="job-copy">
          <h3>{job.title}</h3>
          <p>{job.saved} saved · {job.skipped} already available · {job.failed} failed</p>
          <span>{dateFormatter.format(new Date(job.createdAt))} · {job.mode === "all_again" ? "Another copy" : "New items"} · {job.state.replaceAll("_", " ")}</span>
          {active && <div className="download-progress"><span>{label}</span><progress aria-label={`${job.title}: ${label}`} max={100} value={percent??undefined}/><small>{job.saved+job.skipped} files finished. {job.source==="discord"?"One selected media attachment.":"The collection total is not yet known."}</small></div>}
          {job.error && <p className="job-error" role="alert">{job.error}</p>}
        </div>
        <div className="control-actions">
          {native && active && <>
          <button className="secondary" disabled={disabled} onClick={() => act(job, () => bridge.stopDownload(job.id, true))}>Pause</button>
            <button className="text-button" disabled={disabled} onClick={() => act(job, () => bridge.stopDownload(job.id, false))}>Cancel download</button>
          </>}
          {native && resumable && <button className="primary" disabled={disabled} onClick={() => act(job, () => bridge.resumeDownload(job.id), "Resuming...")}>{working === job.id ? workingLabel : job.state === "failed" ? "Retry unfinished items" : "Resume"}</button>}
            {native&&!active&&<><button className="text-button delete-action" disabled={disabled} onClick={()=>remove({kind:"download",id:job.id})}>Delete download</button>{job.collection&&<button className="text-button delete-action" disabled={disabled} onClick={()=>remove({kind:"collection",id:job.id})}>Delete collection</button>}</>}
          <button className="secondary" disabled={disabled} onClick={() => act(job, () => bridge.openJobFolder(job.id))}><Icon name="folder" size={16} />Open folder</button>
        </div>
      </article>;
    })}
  </section>;
}
