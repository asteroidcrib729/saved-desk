"use client";
import { useEffect, useState } from "react";
import { bridge } from "@/lib/desktop-bridge";
import type { Snapshot, Source } from "@/lib/contracts";
import { AccountIdentityPanel } from "./account-identity-panel";
import { Icon } from "./icon";
import { platformLabel } from "@/lib/platforms";

export function AccountsPanel({ snapshot, refresh, report, downloadDiscord }: { snapshot: Snapshot | null; refresh: () => Promise<void>; report: (message: string) => void; downloadDiscord:()=>void }) {
  const [browser, setBrowser] = useState("edge");
  const [working, setWorking] = useState(false);
  const [setup, setSetup] = useState(false);
  const [profiles,setProfiles] = useState<{id:string;name:string}[]>([]);
  const [profileId,setProfileId] = useState("");
  useEffect(() => {
    if (browser !== "firefox" || !snapshot?.native) return;
    let disposed=false;
    bridge.firefoxProfiles().then(values => {if(!disposed){setProfiles(values);setProfileId(values[0]?.id ?? "");}}).catch(failure => {if(!disposed)report(String(failure));});
    return () => {disposed=true;};
  }, [browser,snapshot?.native,report]);
  const action = async (work: () => Promise<void>) => {
    setWorking(true);
    try { await work(); await refresh(); } catch (failure) { report(typeof failure === "string" ? failure : failure instanceof Error ? failure.message : "Account connection could not finish. Try again."); }
    finally { setWorking(false); }
  };
  return <section className="panel settings-panel accounts-panel"><h2>Your connected accounts</h2>
    <p className="muted account-intro">Approve the platform session from the browser profile where you are already signed in. Instagram and X verify your account identity. YouTube, Facebook, TikTok and Pinterest retain legacy browser approval for existing download paths. These approvals are separate from Google identity. Facebook, TikTok and Pinterest support public links only.</p>
    <div className="account-guidance"><section className="account-note" aria-labelledby="account-access-heading"><h3 id="account-access-heading">Access and browser approval</h3><p>Public links can be downloaded without connecting. Private downloads are currently verified for Instagram and X. YouTube Watch Later and Liked videos use a separate browser approval. Facebook, TikTok and Pinterest are limited to public links; their approval controls can help an existing public-link route without enabling private downloads.</p><p>Firefox can read the selected platform directly. Other browsers use the SavedDesk toolbar connector. Each platform needs its own approval. Access is limited to the platform you approve.</p></section><section className="account-note account-privacy" aria-labelledby="account-privacy-heading"><h3 id="account-privacy-heading">Your browser stays in control</h3><p>Disconnect removes the app's protected session cache and preserves downloaded files and history. Browser passwords and unrelated sessions stay in the browser. Sessions are encrypted for your Windows user on this PC.</p></section></div>
    {!snapshot?.native && <p className="help-note">Account connection is available in the Windows desktop app. This browser preview never accesses your browser sessions.</p>}
    <AccountIdentityPanel native={!!snapshot?.native}/>
    <h3 className="browser-connection-heading">Browser connections and legacy approvals</h3>
    <div className="account-browser-fields"><label className="setting-field">Browser<select aria-label="Browser" value={browser} onChange={event => setBrowser(event.target.value)}>{[["edge", "Microsoft Edge"], ["chrome", "Google Chrome"], ["firefox", "Firefox"], ["brave", "Brave"], ["vivaldi", "Vivaldi"], ["chromium", "Chromium"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {browser === "firefox" && profiles.length > 0 && <label className="setting-field">Firefox profile<select aria-label="Firefox profile" value={profileId} onChange={event => setProfileId(event.target.value)}>{profiles.map(profile => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label>}
    </div>
    {browser === "firefox" && <p className="help-note">{profiles.length ? "Connect reads only the selected platform’s session from this Firefox profile. No add-on is needed when the profile is accessible. Containers and partitioned sessions need a separately supported provider." : "No regular Firefox profiles were found. Sign in in Firefox first, or use the companion connector for a custom/portable profile."}</p>}
    <details open={setup} onToggle={event => setSetup(event.currentTarget.open)} className="help-note connector-guide"><summary>First time? Set up the browser connector</summary>
      <p>The connector lets your browser grant this app access without exporting cookies or entering passwords here. It requests access only to the platform you approve.</p>
      <button className="secondary" disabled={working || !snapshot?.native} onClick={() => action(async () => { await bridge.setupConnector(browser); setSetup(true); })}>Set up connector and open its folder</button>
      <ol>{browser === "firefox" ? <><li>Open about:debugging in Firefox and select This Firefox.</li><li>Choose Load Temporary Add-on and select manifest.json in the opened folder. This development connector must be reloaded after Firefox restarts.</li></> : <><li>Open your browser’s Extensions page ({browser === "edge" ? "edge://extensions" : "chrome://extensions"}). Turn on Developer mode.</li><li>Choose Load unpacked and select the opened chromium folder.</li></>}<li>Pin SavedDesk to the browser toolbar. Select the browser profile where you’re signed in.</li><li>Click Connect below, then open the SavedDesk toolbar button and approve the account.</li></ol>
      <p>Browser-store connector submission is a separate future step. Use the documented temporary or unpacked connector for this preview. Managed browsers may disable extensions or native messaging.</p>
    </details>
    <div className="connected-accounts">{(["instagram", "x", "youtube", "facebook", "tiktok", "pinterest"] as Source[]).map(source => {
      const account = snapshot?.accounts.find(item => item.source === source);
      const ready = account?.state === "connected" || account?.state === "session_ready";
      const pending = account?.state === "awaiting_permission" || account?.state === "connecting";
      return <article key={source} className="account-card"><div className="account-title"><Icon name={source} /><h3>{platformLabel(source)}</h3><span className={ready ? "success-label" : "muted"}>{account?.state === "session_ready" ? "Legacy browser approval" : account?.state === "connected" ? `Connected as @${account.username}` : pending ? account.state === "connecting" ? "Verifying account…" : "Waiting for browser permission" : account?.state === "sign_in_needed" ? "Connection failed" : "Not connected"}</span></div>
        {account?.message && <p className="help-note">{account.message}</p>}
        {ready && <p className="muted">Session approved from {account.browser}. {account?.state === "session_ready" ? "This is a browser session approval, not verified account identity. Supported public-link download paths are retained; only YouTube also supports browser-approved account playlists. Reapprove expired sessions and add a new download if the session changes." : "Your account identity is verified with the platform."}</p>}
        <div className="control-actions"><button className="primary" disabled={working || pending || !snapshot?.native} onClick={() => action(() => browser === "firefox" && profileId ? bridge.connectFirefox(source,profileId) : bridge.connect(source, browser))}>{ready ? "Reconnect from browser" : "Connect using this browser"}</button><button className="secondary" disabled={!snapshot?.native || working} onClick={() => action(() => bridge.openBrowser(source,browser))}>Open browser to sign in</button>{pending && <button className="secondary" disabled={working} onClick={() => action(() => bridge.cancelConnection())}>Cancel connection</button>}{account?.accountId && !pending && <button className="text-button" disabled={working} onClick={() => action(() => bridge.disconnect(source))}>Disconnect</button>}{browser === "firefox" && profileId && !pending && <button className="text-button" disabled={working || !snapshot?.native} onClick={() => action(() => bridge.connect(source,browser))}>Use Firefox connector instead</button>}</div>
      </article>;
    })}
      <article className="account-card"><div className="account-title"><Icon name="discord"/><h3>Discord</h3><span className="success-label">Ready for media links</span></div>
        <p className="help-note">Download an image, video or audio file using its cdn.discordapp.com attachment link. No Discord sign-in, bot, server permissions or browser connector setup is needed in SavedDesk. Only the selected media is requested.</p>
        <div className="control-actions"><button className="primary" disabled={!snapshot?.native} onClick={downloadDiscord}>Download Discord media</button></div>
        <details className="provider-guide"><summary>Copy a Discord media link</summary><ol><li>Open the image, video or audio attachment in Discord, then open it in your browser or use Copy Link on the attachment.</li><li>Copy the full cdn.discordapp.com/attachments/ URL, including its query parameters. A message/channel link is different.</li><li>Choose Download Discord media and paste the media link. Video files are made playable before they appear as saved. Audio opens in the built-in audio player.</li><li>If a link has expired, copy a fresh media link and add it again. Existing files are kept and repeat-download confirmation still applies.</li></ol></details>
      </article>
    </div>

  </section>;
}
