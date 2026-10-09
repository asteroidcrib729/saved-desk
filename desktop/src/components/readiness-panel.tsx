"use client";

import { useEffect, useRef, useState } from "react";
import { bridge } from "@/lib/desktop-bridge";
import type { ReadinessReport } from "@/lib/contracts";

export function ReadinessPanel({ native, folder, folderBusy, chooseFolder, accounts }: { native:boolean;folder:string;folderBusy:boolean;chooseFolder:()=>Promise<void>;accounts:()=>void }) {
  const [browser,setBrowser]=useState("chrome");
  const [report,setReport]=useState<ReadinessReport|null>(null);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const generation=useRef(0);
  const flight=useRef(false);
  useEffect(()=>{generation.current++;setReport(null);setError("");return()=>{generation.current++;};},[folder,browser]);
  async function check() {
    if(flight.current)return;
    flight.current=true;setWorking(true);setError("");setReport(null);
    const current=generation.current;
    try { const result=await bridge.checkReadiness(browser);if(current===generation.current)setReport(result); }
    catch { if(current===generation.current)setError("The setup check could not finish. Try again when other app tasks have stopped."); }
    finally {flight.current=false;setWorking(false);}
  }
  return <section className="panel settings-panel">
    <h2>Check your setup</h2>
    <p className="muted">Check your save folder, free space, download engine, video tools, and browser connector. This local check does not contact Instagram or X or read your account sessions.</p>
    <div className="field-action-row"><label className="setting-field">Browser to check<select disabled={working} value={browser} onChange={event=>setBrowser(event.target.value)}>{[["chrome","Google Chrome"],["edge","Microsoft Edge"],["firefox","Firefox"],["brave","Brave"],["vivaldi","Vivaldi"],["chromium","Chromium"]].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <button className="secondary" disabled={!native||working} onClick={check}>{working?"Checking setup...":"Check setup"}</button></div>
    {!native&&<p className="help-note">Open the Windows desktop app to check your installation.</p>}
    {working&&<p className="help-note" role="status">Checking local components. The first engine check may take a little longer.</p>}
    {error&&<p className="error-banner" role="alert">{error}</p>}
    {report&&<><p className="help-note" role="status">{report.checks.some(c=>c.state==="blocked")?"Some checks need attention before downloading.":report.checks.some(c=>c.state!=="ready")?"Setup checked. Review the guidance below.":"All local checks passed. Account permission and network access are checked when you connect or download."}{report.freeBytes!==null&&` ${(report.freeBytes/1024/1024/1024).toFixed(2)} GiB available in your save location.`}</p>
      <ul className="readiness-checks">{report.checks.map(check=><li key={check.id}><div><strong>{check.label}</strong><span className={`check-state check-${check.state}`}>{({ready:"Ready",warning:"Attention",blocked:"Needs action",pending:"Not checked"})[check.state]}</span><p>{check.message}</p></div>{check.action==="folder"&&<button className="secondary" disabled={folderBusy||working} onClick={chooseFolder}>Choose folder</button>}{check.action==="accounts"&&<button className="secondary" onClick={accounts}>View accounts</button>}</li>)}</ul>
      <p className="help-note">Results describe this check only; changes to drives, permissions, or extensions may require another check. Downloads recheck the save folder and space before starting and between assets. Keep at least 256 MiB free; larger files need more.</p></>}
  </section>;
}
