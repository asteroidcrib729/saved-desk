"use client";
import {useEffect,useRef,useState} from "react";
import type {AuthenticationReport} from "@/lib/contracts";
import {bridge} from "@/lib/desktop-bridge";
import {platformLabel} from "@/lib/platforms";
import {Icon} from "./icon";
import {ScrollArea} from "./scroll-area";
const failureMessage=(error:unknown)=>typeof error==="string"?error:error instanceof Error?error.message:"The account operation could not finish.";
export function AccountIdentityPanel({native}:{native:boolean}){
 const [status,setStatus]=useState<AuthenticationReport|null>(null),[error,setError]=useState(""),[client,setClient]=useState(""),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState<"revoke"|"reset"|null>(null);
 const alive=useRef(true),popup=useRef<HTMLDialogElement>(null),confirmTrigger=useRef<HTMLButtonElement>(null),heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{alive.current=true;
 const update=async()=>{try{const value=await bridge.authentication();if(!alive.current)return;setStatus(value);setClient(value.google.clientId);setError("");}catch(e){if(alive.current)setError(failureMessage(e));}};
 void update();return()=>{alive.current=false;};
 },[]);
 useEffect(()=>{if(!confirm)return;popup.current?.showModal();return()=>{popup.current?.close();confirmTrigger.current?.isConnected?confirmTrigger.current.focus({preventScroll:true}):heading.current?.focus({preventScroll:true});};},[confirm]);
 async function action(work:()=>Promise<unknown>){
 if(busy)return;setBusy(true);setError("");
 try{await work();const value=await bridge.authentication();if(alive.current){setStatus(value);setClient(value.google.clientId);}}
 catch(e){if(alive.current){setError(failureMessage(e));try{setStatus(await bridge.authentication());}catch{}}}
 finally{if(alive.current)setBusy(false);}
 }
 // Poll only while authorization is pending, including attempts started in this panel.
 useEffect(()=>{if(!status||!["waiting_for_browser","revoking"].includes(status.google.state))return;
 const timer=setInterval(()=>{bridge.authentication().then(value=>{if(alive.current)setStatus(value);}).catch(e=>{if(alive.current)setError(failureMessage(e));});},1000);
 return()=>clearInterval(timer);},[status?.google.state]);
 const google=status?.google,waiting=google?.state==="waiting_for_browser",connected=!!google?.accountKey;
 return <section className="identity-panel" aria-labelledby="identity-title">
 <h3 id="identity-title" tabIndex={-1} ref={heading}>Verified identity and download access</h3>
 <p className="help-note">Identity, browser approval and permission to download private media are separate. Instagram and X keep their verified private-download connections. Facebook, TikTok and Pinterest support public share links only. Google identity remains separate from YouTube browser approval.</p>
 {error&&<p className="error" role="alert">{error}</p>}
 {native&&(error||google?.clientId)&&<button className="secondary" disabled={busy||google?.state==="revoking"} onClick={e=>{confirmTrigger.current=e.currentTarget;setConfirm("reset");}}>Reset Google identity setup</button>}
 {!status&&<button className="secondary" disabled={busy} onClick={()=>action(async()=>{})}>Reload account setup</button>}
 {google&&<article className="account-card"><div className="account-title"><Icon name="youtube"/><h4>Google identity for YouTube</h4><span className={connected?"success-label":"muted"}>{waiting?"Waiting for browser":google.state==="revoking"?"Revoking access":connected?google.state==="refresh_needed"?"Refresh needed":`Verified: ${google.displayName}`:google.state==="setup_required"?"Developer setup required":"Not connected"}</span></div>
 <p className="help-note">Public YouTube links keep working. Google sign-in requests only your account identity; it does not authorize private-video downloading or turn browser cookies into a verified download account.</p>
 <details className="provider-guide google-setup"><summary>Configure Google Desktop sign-in</summary>
 <p>Register a Desktop OAuth client in Google Auth Platform, then import its downloaded JSON. The file is read only by the Windows app. Web/server credentials are rejected. You can also enter its public client ID.</p>
 <div className="google-config-row"><label className="setting-field">Google Desktop client ID<input type="text" value={client} onChange={e=>setClient(e.target.value)} autoComplete="off" spellCheck={false} disabled={busy||waiting||connected} placeholder="Your client ID ending in .apps.googleusercontent.com"/></label>
 <button className="secondary" disabled={!native||busy||waiting||!client.trim()||connected} onClick={()=>action(()=>bridge.configureGoogleIdentity(client))}>Save client ID</button></div>
 <div className="control-actions"><button className="secondary" disabled={!native||busy||waiting||connected} onClick={()=>action(()=>bridge.importGoogleIdentity())}>Import Desktop OAuth JSON</button></div>
 <p className="help-note">Tokens stay encrypted for your Windows user. No Google API scope for video downloading is requested. Browser-approved YouTube playlists use a separate session. Other public-link platforms do not require new OAuth setup.</p>
 </details>
 {google.message&&<p className="help-note" role="status">{google.message}</p>}
 <div className="control-actions">
 <button className="primary" disabled={!native||busy||waiting||google.state==="revoking"||!google.clientId} onClick={()=>action(()=>bridge.beginGoogleIdentity())}>{connected?"Sign in with another Google account":"Sign in with Google"}</button>
 {waiting&&<button className="secondary" disabled={busy} onClick={()=>action(()=>bridge.cancelGoogleIdentity())}>Cancel Google sign-in</button>}
 {connected&&<><button className="secondary" disabled={busy||waiting} onClick={()=>action(()=>bridge.checkGoogleIdentity())}>Check or refresh identity</button><button className="secondary" disabled={busy} onClick={()=>action(()=>bridge.disconnectGoogleIdentity(false))}>Disconnect Google identity</button><button className="secondary" disabled={busy||waiting} onClick={e=>{confirmTrigger.current=e.currentTarget;setConfirm("revoke");}}>Revoke Google access</button></>}
 </div></article>}
 {status&&<div className="identity-readiness">{status.providers.filter(p=>p.source!=="youtube").map(provider=><div className="account-note" key={provider.source}><p className="identity-provider-name"><strong>{platformLabel(provider.source)}</strong></p><p>{provider.requirement}</p><p className="muted">{provider.source==="discord"?"Attachment downloads available without sign-in.":"Public-link downloads available; private content is outside the supported scope."}</p></div>)}</div>}
 {confirm&&<dialog ref={popup} className="setting-popup" aria-labelledby="revoke-title" onCancel={e=>{e.preventDefault();setConfirm(null);}} onClose={()=>setConfirm(null)}><ScrollArea className="dialog-scroll" label="Google revocation"><div className="dialog-content"><h2 id="revoke-title">{confirm==="revoke"?"Revoke Google access?":"Reset Google identity setup?"}</h2><p className="help-note">{confirm==="revoke"?"Google revocation removes all grants for this Google Cloud project, potentially affecting other clients in that project. Local credentials will be removed even if Google cannot confirm revocation. Downloaded media and browser approvals are preserved.":"Remove the local Google identity, tokens and Desktop client configuration. This can recover unreadable account storage. Remote Google grants are not revoked. Downloaded files, history and all browser approvals are preserved."}</p><div className="control-actions"><button autoFocus className="secondary" onClick={()=>setConfirm(null)}>{confirm==="revoke"?"Cancel revocation":"Cancel reset"}</button><button className="primary" onClick={()=>{const mode=confirm;setConfirm(null);void action(async()=>{if(mode==="revoke")await bridge.disconnectGoogleIdentity(true);else await bridge.resetGoogleIdentity();heading.current?.focus({preventScroll:true});});}}>{confirm==="revoke"?"Revoke and disconnect":"Reset local setup"}</button></div></div></ScrollArea></dialog>}
 </section>;
}
