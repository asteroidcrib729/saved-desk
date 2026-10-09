# Development Plan 04: Verified Accounts and Authorized Downloads

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** Controlled Google lifecycle and public-platform scope are implemented. Pinterest OAuth/private phases are cancelled; Facebook/TikTok identity is optional future work and private phases are excluded. Watch Later uses separate browser approval.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

**Current follow-up (0.2.10, 9 October 2026):** The app guidance and native/preview registry now exclude private Facebook/TikTok/Pinterest content and remove Pinterest OAuth prerequisites. Existing browser approvals remain available for supported public links; Instagram/X and YouTube playlist routes are preserved. Google lifecycle acceptance uses controlled native credentials and provider responses, as the owner explicitly requested, preserving the current live Google grant. See [scope and verification](scope-and-lifecycle-0.2.10.md) and [owner-reported X endurance](owner-x-endurance.md). Historical version results below retain their original scope.

**0.2.9 Watch Later fix:** The native and worker URL validators now recognize Watch Later (list=WL) and Liked videos (list=LL). Both require an approved YouTube browser session; Google identity alone does not supply it. Unknown short IDs and malformed URLs remain rejected. See [fix and verification](watch-later-fix-0.2.9.md). On 9 October 2026, the owner confirmed that the two-video Watch Later playlist downloaded successfully using this browser-approved route. This confirms the reported download, not completion of the OAuth media replacement or general private-video acceptance.

**Owner scope decision (9 October 2026):** Pinterest remains public/shareable-link only; its OAuth and secret-board work is cancelled. Facebook and TikTok also exclude private/restricted content. Their optional identity-only integrations are under feasibility review, not authorized implementation or a requirement for public downloads. Instagram/X account downloading and the existing Google identity/YouTube browser-approved playlist workflow remain. See [Facebook/TikTok requirements](facebook-tiktok-authentication-feasibility.md). The 0.2.10 app implements this guidance and provider-status revision. Browser approval controls remain; no universal content-visibility classifier is claimed.

**Created:** 8 October 2026.  
**Status:** In progress. The 0.2.8 native Google identity and account/capability foundation is implemented; the supplied Google Desktop configuration is installed locally and the owner reports successful sign-in/identity checking. Google lifecycle acceptance uses the owner-approved controlled tests; live account refresh/revocation is optional. Facebook/TikTok identity is conditional; Pinterest OAuth and all three platforms' private-media objectives are cancelled.  
**Baseline:** SavedDesk 0.2.7.  
**Predecessors:** [Plan 02](development-plan-02.md), [Plan 03](development-plan-03.md).  
**Platforms:** YouTube, Facebook, TikTok, Pinterest and Discord. Preserve working Instagram/X authentication and private downloads.

## 1. Authority, supersession and actual baseline

The 9 October owner revision supersedes earlier Pinterest/Facebook/TikTok private-download goals. Google identity and any later selected Facebook/TikTok identity keep identity, grants and media capability separate. Discord is the fifth platform in scope, but has no session-authentication implementation to replace: it currently downloads explicitly supplied attachment links without account authentication.

The owner reports that a private Instagram collection containing **504 items** downloaded successfully, and private X content also downloads successfully. These are owner-reported live results; no new agent-run test is claimed. Facebook/TikTok/Pinterest remain **public/shareable-link downloads only**. Discord accepts selected attachment links without sign-in. YouTube additionally has the owner-confirmed browser-approved Watch Later workflow containing public videos. Cookie approval controls exist for four of them, but do not establish verified account ownership or usable private-media authorization.

The revised requirements are reflected in 0.2.10 provider status and UI guidance; no new private adapter or universal visibility classifier is implemented. Existing public downloads must continue working. A valid token or successful profile request cannot establish that the app can download a particular private video.

### Goals and boundaries

- Verify selected accounts using provider-accepted credentials and stable provider subjects.
- Separate account identity from rotating cookies/tokens, actual grants and per-resource download capability.
- Exclude private Facebook/TikTok/Pinterest downloads and Pinterest OAuth. Preserve Instagram/X and the selected YouTube public-videos-in-private-playlists workflow; broader private YouTube capability is not claimed.
- Keep public downloading and offline library browsing independent of optional sign-in/services.
- Preserve the existing Instagram/X workflow, external gallery-dl/FFmpeg licensing architecture, selected-root containment, compatible-only video storage, progress, retry, duplicates and deletion.
- Keep encrypted SQLite, portable recovery and automatic application updates planned. Signing follows source publication; further Windows/GPU coverage is excluded and multi-hour testing is optional. Spotify and Reddit stay removed.

## 2. Three independent checks

| Check | Required proof | Insufficient evidence |
| --- | --- | --- |
| Account identity | Authenticated stable subject plus provider/client context | Cookie names, typed username, browser sign-in alone |
| Authorization | Actual granted scopes or a proven authenticated transport with expiry/revocation handling | Requested scopes or a consent redirect alone |
| Download capability | Supported route returns the requested authorized media and existing verification succeeds | Private metadata, thumbnail, embed or account badge |

An account may be verified while private downloading remains unsupported. Do not invent a universal OAuth-to-cookie conversion or assume gallery-dl/yt-dlp accept arbitrary bearer tokens.

Before implementation, produce one provider decision record with the supported flow, subject namespace, exact grants, developer-app access requirements, media routes, API versions, provider constraints and positive/negative live test recipe. Identity-only integration must not count as private-download completion.

## 3. Provider decisions

| Provider | Identity status/objective | Media scope | Prerequisite |
| --- | --- | --- | --- |
| YouTube | Google Desktop identity implemented | Public videos; owner-confirmed Watch Later via separate browser approval | Google grant is not a downloader credential; broader private videos not implemented |
| Facebook | Optional identity, conditional implementation | Public video/Reel links; private excluded | public_profile, supported handoff, secure exchange and applicable Meta access requirements |
| TikTok | Optional Desktop Login Kit identity | Public video/photo links; private/export excluded | user.info.basic, provider PKCE, secure exchange and production review |
| Pinterest | OAuth cancelled by owner | Public pins/boards only; secret content excluded | No new OAuth setup |
| Discord | Identity deferred | Selected attachments without sign-in | Fresh signed attachment link |

### 3.1 YouTube

Use system-browser authorization with a Google Desktop client. Investigate OpenID Connect for the stable Google subject. Avoid email unless a demonstrated feature requires it. Request YouTube read scope only for an approved catalog use case. Keep channel/Brand Account context distinct from the Google subject: selecting another channel is an explicit account-context change.

Google documents desktop loopback callbacks and PKCE. Use its provider-specific client/challenge rules rather than embedded WebView sign-in or deprecated copy/paste authorization. [Google native-app OAuth](https://developers.google.com/identity/protocols/oauth2/native-app).

OAuth tokens are not downloadable media URLs. YouTube API policies restrict audiovisual download/storage without prior written approval. Establish the permitted product route before combining an API-backed account/catalog feature with downloading; a separate extractor is not an automatic exception. [YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies).

Implementation tasks:

- Prove identity/channel selection independently of media access.
- Establish an approved download/export integration before enabling the private capability.
- If a permitted browser-authenticated extractor route is retained, bind the exact browser credential set to a provider-authenticated identity. OAuth account A must never legitimize account B's cookies.
- Keep public extraction available when no supported private route exists; show the precise limitation.
- Test own uploads/export and videos privately shared by another owner separately. Private metadata alone is not successful downloading.
- Keep DRM, subscription offline caches and ongoing/live mixes outside scope.

The owner selected public videos inside private playlists as the next YouTube use case. Existing finite-playlist/browser-approval wiring is available for owner-managed testing; it is not the completed OAuth media replacement. The three isolated cookie/session/playlist regressions pass. The owner confirmed the two-video Watch Later download on 9 October 2026; this does not establish all private playlists or private-video access. See [the precise test workflow](account-authentication-setup.md#selected-youtube-use-case-public-videos-in-private-playlists).

### 3.2 Facebook

Official create-app, manual-flow and permissions documentation was retrieved on 9 October 2026, resolving the earlier feasibility gap. Basic identity requires public_profile; optional email is omitted. The documented app-secret exchange cannot ship its secret in the desktop. A supported browser/desktop handoff, secure service, app-scoped subject/token inspection and lifecycle are needed if identity is selected.

Meta distinguishes testing, live readiness, increased access for users without app roles, and verification-required permission states. Confirm actual dashboard requirements; do not assume universal business verification or universal review exemption.

Keep public video/Reel extraction. Private/group/restricted-video adapters and bulk history are excluded. Basic login adds no proven download route. See [requirements and sources](facebook-tiktok-authentication-feasibility.md#facebook-requirements-if-identity-is-selected).

### 3.3 TikTok

Optional Desktop Login Kit identity uses user.info.basic, authenticated app-scoped open_id and mandatory PKCE. Desktop callbacks allow localhost/127.0.0.1 with port/static path, including wildcard port. The SHA-256 challenge is hexadecimal, not Google's base64url encoding.

Confidential exchange/refresh secrets must stay outside distributed binaries. Sandbox supports development; production requires verified website/policy URLs and an end-to-end review demo. Public extraction remains independent. No private/followers-only, own-content export or Data Portability work is in scope. See [requirements and sources](facebook-tiktok-authentication-feasibility.md#tiktok-requirements-if-identity-is-selected).

### 3.4 Pinterest

OAuth/private development is cancelled by the 9 October owner decision. Keep public/shareable pin/board downloading. Do not request secret-read scopes, build secret-board discovery, deploy an OAuth service or wait for restricted video-URL access under this plan.

The owner previously created an app with approval pending; that remains an external owner record, not an implementation prerequisite. No cancellation was submitted to Pinterest. Current legacy cookie approval is not verified identity or supported secret-board access.

### 3.5 Discord

Optional identity uses `identify`, an authenticated Discord user ID, and documented exchange/refresh/revocation. Extra guild/member/message scopes are unnecessary for selected attachments. Ordinary OAuth does not confer blanket private-channel history, and standard-user self-bot automation is excluded. [Discord OAuth and account types](https://docs.discord.com/developers/topics/oauth2).

Preserve anonymous `cdn.discordapp.com/attachments/...` downloading. Complete signed queries remain protected native data. Expired links need a freshly copied link; signing in does not automatically renew them or grant access to the source message.

The owner previously limited Discord to media links and does not control the source servers. No bot install, user-token extraction, server-member enumeration, DM import or history collection belongs here. Optional identity failure cannot block valid attachment downloading. An admin-authorized bot product needs a separate future scope decision.

## 4. Target account model and lifecycle

Replace credential-hash-as-account with a provider namespace: `(provider, issuer/client_context, provider_subject, resource_context)`. Each provider defines its subject namespace; channel context matters for YouTube. Credential rotation increments a generation while preserving the same verified account key.

Initially retain one selected account per provider in the UI, preserving all identities/history internally. Simultaneous multi-account downloads are not required. Switching accounts cannot silently reassign jobs.

| Record | Proposed non-secret metadata |
| --- | --- |
| Account | Local opaque key, provider subject/context, display label, selected state, verification time |
| Connection | Authentication method, credential reference/generation, status, expiry, safe error |
| Permissions | Actual normalized grants and their inspection/expiry times |
| Capabilities | Public download, identity, private metadata/media, own export, finite collection; evidence-backed status/reason |
| Job binding | Stable account key, resource context, access mode, required capability, adapter version |
| Auth attempt | In-memory provider/attempt binding, state/nonce, verifier, deadline, cancellation |

No tokens, cookies, authorization codes, signed URLs or secrets in SQLite, React or ordinary logs. The unencrypted catalog can retain disclosed non-secret labels/IDs as now; encryption remains future Plan 02 work. Minimize private-resource metadata and explain current local protection.

Account states: `not_connected`, `authorizing`, `verifying`, `connected`, `reauthorization_required`, `revoked`, `unavailable`; legacy records use `legacy_session_unverified`. Capability states: `supported`, `not_granted`, `not_tested`, `unsupported`, `temporarily_unavailable`. One green badge cannot collapse account verification and media permissions.

## 5. Native OAuth and confidential-provider design

### 5.1 Native client

Rust owns authorization attempts and launches the system browser. Bind a loopback listener before navigation, only on the exact supported loopback address. Use an available port where provider rules permit it, a fixed callback path, cryptographically random single-use state and a bounded five-minute deadline. No LAN/wildcard-interface listener.

Accept only the expected provider/attempt/path/host/port and bounded parameters. Reject duplicate state/code values, replay, unexpected response modes, expired attempts and callbacks after cancellation. Invalid callbacks cannot consume another provider's attempt. Close the listener at success/cancel/timeout. Show a static credential-free browser completion page, with no external scripts or analytics.

Use authorization code with PKCE when supported/required; keep the verifier in native memory. Each provider specifies challenge encoding, response mode and exchange authentication. Never fall back to implicit grants or manual token entry when client support is missing. Validate OIDC signature/issuer/audience/nonce/lifetime where used. Commit the connection only after the authenticated identity lookup succeeds.

### 5.2 Confidential providers

A desktop executable cannot keep a provider-wide secret. Rust constants, environment files, PyInstaller archives and secret-entry boxes do not make it confidential.

Phase A must select a supported public native flow or an explicitly reviewed minimal HTTPS authorization service. This service is a **proposed component**, not existing functionality or a deployment authorized by drafting this plan. Public downloads and offline browsing remain independent of it.

If required, its design must include:

- Server-held app secrets, restricted administration, separate development/production credentials and documented ownership.
- Proof of possession for the desktop attempt, one-use short-lived handoff codes, exact client/provider/redirect/attempt binding; no bearer/refresh token in a callback URL.
- Independent server-side state validation; no client-supplied arbitrary redirect, provider endpoint or API proxy URL.
- Provider refresh tokens kept server-side when mandated. The desktop receives a revocable scoped handle, not a fake provider token to pass into an extractor.
- Minimal authenticated operations, encrypted storage, redacted logs, retention/deletion policy, rate limits, refresh/revoke bounds and explicit outage behavior.
- No forwarding of browser cookies/private media through a broad proxy. Disclose service data handling, hosting/costs and privacy requirements before enabling it.

Prefer direct native flows where supported. Without required service configuration, show the account integration as unavailable with setup instructions; keep public downloads. No paid resources, provider registrations or external deployments are created during planning.

## 6. Credentials, refresh and disconnect

Extend current Windows-user DPAPI storage with a versioned encrypted envelope bound to provider, account key, credential type/generation and client context. Use atomic replacement and restricted user permissions. Exclude credentials from source, release assets, backups and diagnostics.

Refresh off the UI thread with one in-flight refresh per connection, provider expiry and bounded clock skew. Subject/context changes invalidate the connection and block bound jobs. Avoid profile/refresh requests per carousel file. Recheck at job start, expiry, credential rotation or explicit user action; cache successful checks within documented provider limits.

Disconnect cancels pending attempts/refresh, invalidates local grants and deletes owned credentials. Request remote revocation where supported. Local deletion must succeed even when remote revocation is unreachable; label that remote outcome unconfirmed and offer the provider's access-management link. Do not claim successful remote revocation from local deletion alone.

Generation checks reject late verification/refresh after disconnect/account switch. The same verified subject can recover its jobs; another cannot. Distinguish 401 reauthorization, 403 resource denial, unavailable route and 429 throttling. Respect validated Retry-After and avoid repeated alternate-route probes.

## 7. Download authorization and compatibility

Apply account-bound handling only to selected implemented routes. Facebook/TikTok/Pinterest remain public-link scope; no private/account/export mode is planned for them. Keep public mode available without connection when the adapter supports it. Never silently retry private requests anonymously or under another account.

Before preparation/enqueue and again before worker execution:

1. Canonicalize the provider target.
2. Resolve stable account/context and credential generation.
3. Require actual permission and a supported route for this resource type.
4. Create a private native transfer context restricted to provider/account/job.
5. Discover stable media IDs and request existing host per-item decisions before transfer.
6. Preserve live progress, compatible-MP4 finalization, selected-root containment and catalog acknowledgement.

API media adapters use authorized returned references. Extractors receive compatible scoped credentials only where the validated route requires them. OAuth tokens must not be put into arbitrary cookie fields. Bearer headers cannot follow redirects to unapproved hosts. Signed CDN URLs stay in protected storage/native memory and refresh only through supported authorized routes.

Finite discovery requires pagination cursors, deduplication, repeated-cursor protection, bounded limits, cancellation and partial-failure reporting. Display discovering/downloading/processing/verifying/completed stages. Unknown totals stay indeterminate. Failed discovery is never a completed empty collection.

## 8. Legacy migration and rollback

Existing `session_...` values are hashes of rotating credentials, not verified provider subjects. Do not promote them or assign a verification timestamp automatically.

Migration requirements:

1. Back up the owned catalog following existing recovery practice and migrate transactionally. Do not create credential backups.
2. Retain legacy scope/media/history; mark connections unverified with **Reconnect account**.
3. Pause queued legacy account jobs with a precise reconnect reason. Completed downloads stay browsable offline.
4. Verify the new subject and keep newly bound jobs separate from legacy jobs.
5. Never infer ownership of old session-hash history. Offer explicit target-level adoption/retry only after authorized target access and user confirmation. Keep separate history/new jobs where attribution is unproven.
6. Rotate/delete only superseded app-owned credentials after successful transition. Do not touch browser sign-in or other providers' credentials.

Refresh cannot create another account or duplicate completed items in the same verified namespace. Failed migration preserves data and disables new private capability. Permit downgrade only when tested with the new schema; otherwise document catalog restoration and refuse unsafe older writers. This schema work does not implement encrypted SQLite or portable recovery.

## 9. Interface and usability

Accounts cards expose verified identity/time, selected context, granted access and actual download capability separately. Retain standard buttons, card spacing, switch/checkbox distinction and popup help without form movement.

Actions: **Connect account**, **Reconnect**, **Check connection**, **Manage access**, **Disconnect**. Do not add private-board, followers-only or export actions for the excluded platforms. Ordinary users never enter client secrets, passwords or raw tokens. Developer prerequisites belong in readiness/setup guidance.

Add download displays bound account/access mode and a precise reason for unsupported private routes. No form says legacy cookie approval unlocks private content. Discord remains usable by pasting an attachment link without login.

Use restrained accessible status announcements. Restore focus after browser launch/callback/cancel, maintain keyboard/modal behavior, current zoom/high-contrast support and border-free information buttons. Avoid new activity overlays or loading-layout shifts.

Example messages:

- `Account verified; private video downloads are not supported by this integration.`
- `Pinterest supports public share links; private boards are outside the supported scope.`
- `This job belongs to another account. Reconnect that account or create a new download.`
- `This Discord attachment link expired. Copy a fresh media link.`

## 10. Code and contract work map

Existing paths were checked against the 0.2.7 tree. The native auth module paths are implemented in the 0.2.8 slice; remaining work below is still planned.

| Area | Existing files | Planned work |
| --- | --- | --- |
| Native connection | `desktop/src-tauri/src/live_commands.rs`, `worker_host.rs`, `platform.rs`, `bin/native_host.rs` | Separate browser receipt from account verification/grants; coordinate authorization |
| Metadata | `desktop/src-tauri/src/catalog.rs` and migration code | Stable identity namespaces, grants/capabilities and job bindings |
| Proposed native modules | `auth/mod.rs`, `auth/oauth.rs`, `auth/credentials.rs`, `auth/providers.rs` under `desktop/src-tauri/src/` | State machine, callback flow, vault and provider strategies |
| Worker | `backend/src/social_downloader/browser_sessions.py`, `authentication.py`, `firefox.py`, `worker.py`, `public_downloads.py`, `external_gallery.py` | Deprecate session-hash identity acceptance for these providers; compatible scoped transfer contexts |
| Contracts | `contracts/protocol-v1.schema.json`, `desktop/src/lib/contracts.ts`, `desktop-bridge.ts` | Auth/capability DTOs, validated private native-worker commands |
| UI | `desktop/src/components/accounts-panel.tsx`, `download-dialog.tsx`, `readiness-panel.tsx` | Capability-specific account actions and setup guidance |
| Connector | `browser-connector/popup.js` and native messaging/build sources | Preserve Instagram/X; distinguish browser transport from verified account connection |
| Packaging | `packaging/audit-repository.py`, release audits/tests | New configuration classification, credential exclusions, dependencies and notices |
| Optional new service | Separate service source; location determined in Phase A | Confidential exchanges only where required |

OAuth belongs in the native control plane. Python workers do not own login UI, broad persistent refresh grants or provider-wide secrets. Replace hard-coded `browser_source`/`session_ready` assumptions gradually with explicit strategies/capabilities, maintaining separate Instagram/X regressions.

Update protocol/schema deliberately. Use a compatible extension only if validators support it; otherwise introduce a negotiated version and reject mismatched host/worker generations safely. Rust, TypeScript and Python validation must agree.

## 11. Implementation phases

| Phase | Deliverable | Completion evidence |
| --- | --- | --- |
| A: provider feasibility | Five decision records; direct/service choices, developer prerequisites and supported/unsupported routes | Verified current references/app capabilities; positive/negative media test recipes |
| B: shared foundation | Stable accounts, DPAPI envelopes, callback state machine, grants, refresh/revoke and migration | Synthetic identity/permission/race tests; migration/rollback and secret-exposure checks |
| C: scope/UI alignment | Retire Pinterest OAuth/private objectives and private Facebook/TikTok/export claims | Native/preview/UI cleanup implemented in 0.2.10; see current verification |
| D: optional identities | Facebook/TikTok only if a useful feature is selected; Discord deferred | Provider-specific login/lifecycle tests; public downloads independent |
| E: UI/legacy transition | Capability-aware cards/forms, reconnect/history adoption and accurate messages | Keyboard/mouse/zoom/contrast checks; no private-ready claim from legacy approval |
| F: packaged verification | Appropriate target refresh, installer lifecycle when packaging changes, regression evidence/docs | Matching hashes, unchanged Instagram/X/public/CDN behavior and current instructions |

Start with feasibility rather than five sign-in buttons. Ship provider integrations independently when verified. Confidential flows cannot use placeholder secrets/unreviewed service configurations. No Pinterest private spike remains scheduled.

### Implementation checklist

- [ ] AUTH-01: Capture provider/version/scope/identity/media-route decisions for all five platforms.
- [x] AUTH-02: Implement native provider registry and separate account/capability states.
- [x] AUTH-03: Google callback ownership, PKCE, authenticated userinfo and cancellation implemented/tested. Optional other identities are outside this completion.
- [x] AUTH-04: Google DPAPI generations, refresh and revocation implemented; controlled lifecycle accepted by owner. No live-owner revocation claimed.
- [ ] AUTH-05: Migrate legacy records transactionally without implicit ownership reassignment.
- AUTH-06: **Cancelled by owner**: Pinterest OAuth/secret-media integration.
- [ ] AUTH-07: Facebook/TikTok identity only if a useful feature is selected; no private access.
- AUTH-08: **Cancelled for Facebook/TikTok/Pinterest**: private/export work. Broader YouTube private video remains unsupported, not promised.
- [x] AUTH-09: Public-only native/preview status, Accounts/Add download/Help alignment implemented in 0.2.10; legacy approvals kept.
- [x] AUTH-10: Current 0.2.10 payload, controlled native/public regressions, host installer lifecycle and documentation verified. Fresh signed-public release gates remain separate.

## 12. Required tests

### Synthetic/native integration

- Wrong/missing/duplicate state, replay, expired/cancelled attempt, incorrect provider/client, malformed/oversized callback and unexpected redirect.
- Actual provider PKCE encodings; OIDC signature/issuer/audience/nonce/lifetime where applicable.
- Identity-only token, partial grant, denied consent, wrong subject/channel, expiry, revocation and service outage.
- Concurrent job refresh, disconnect/account-switch races, late responses and atomic credential replacement.
- Stable account across credential/username rotation; distinct app namespaces cannot collide.
- Catalog migration/rollback, separate legacy history, explicit adoption and no resurrection of cancelled/deleted jobs.
- Credential absence in snapshots/events, arguments, stdout/stderr, URLs, diagnostics, source and release assets; exercise failure redaction with varied secrets.
- Host/redirect allowlists, signed-link expiry, folder traversal/reparse points, transfer interruptions and no completion before verified media.
- Connection failure preserves anonymous public and Discord downloading.

### Owner-managed live matrix

| Provider | Positive evidence | Negative/control evidence |
| --- | --- | --- |
| Instagram/X regressions | Existing verified-account downloading; retain owner's 504-item Instagram result | Wrong-account job binding; no collection probing without a test instruction |
| YouTube | Account/channel identity and permitted own/private media or finite playlist once a route exists | No account, wrong channel, not-shared/deleted item, expired grant; metadata alone fails media acceptance |
| Facebook | Supported public video/Reel; optional identity if selected | Extraction failure; denied/expired login cannot enable private media |
| TikTok | Supported public videos/photos; optional identity if selected | Extraction failure; denied/expired login; no private/export acceptance |
| Pinterest | Public pin/board with actual media | Unavailable link; no secret-board test requirement |
| Discord | Optional identity plus attachment download with/without sign-in | Expired link; identity token cannot be substituted for server-message credentials |

Ask only for disposable resources relevant to a proven route; never passwords/cookies/tokens. Record date, redacted account namespace, provider/API/adapter version, expected and actual items/files, saved/failed/skipped results, playback and selected-folder verification. Distinguish posts from carousel files. Keep private evidence local and excluded from source/release archives.

Each advertised private capability needs a successful authorized resource and an unauthorized/insufficient-grant negative control. Missing grants/resources are `not_tested` or `unsupported`, never a fabricated approval. Do not require additional hardware or multi-hour testing in this cycle.

## 13. Developer/owner prerequisites

No new owner registration is required for the current public-only scope. The following prerequisites apply only if an optional integration is selected later:

1. Register each provider app under the owner's developer account; record public app/client IDs, approved client type, development/production environments and exact callbacks.
2. Configure least-privilege products/scopes. Prepare required privacy/data-deletion/use-case/demo evidence and determine app review, business verification or eligibility requirements before enabling general-user access.
3. Google: Desktop OAuth configuration plus separate assessment of the permitted YouTube download/export product route.
4. Pinterest: no OAuth action. TikTok: if selected, Desktop Login Kit/user.info.basic and production review; no Data Portability.
5. Facebook: if selected, Facebook Login/public_profile and applicable access requirements; no private/group permissions.
6. Discord: Optional identity app only if implemented; no server/bot permissions for attachment use.
7. If a confidential service is needed, settle its ownership, hosting/costs, secret custody and privacy/retention before a separately authorized deployment. Never paste app secrets into chat or Git.
8. No private Facebook/TikTok/Pinterest fixtures are requested. Retain owner-managed Instagram/X/YouTube checks and public controls.

Provider OAuth approval is distinct from Windows signing and repository publication. Preserve their agreed schedules.

## 14. Completion and evidence

### 0.2.8 implemented slice (8 October 2026)

See [owner setup and remaining implementation](account-authentication-setup.md). Native modules `auth/mod.rs`, `oauth.rs`, `credentials.rs`, `http.rs` and `providers.rs` implement Google Desktop code exchange, S256 PKCE, one-use callback, timeout/cancel, authenticated userinfo, versioned DPAPI credentials, single-flight refresh, generation guards and explicit local/remote disconnect. Google Desktop JSON import stays native-only and rejects Web client configurations. WinHTTP uses Windows certificate validation, fixed endpoints, disabled redirects and bounded responses.

The additive OAuth envelope avoids rewriting legacy catalog ownership. Existing browser approvals remain as legacy transport; private-ready claims are removed. This is not the transactional legacy-history adoption/migration planned in AUTH-05. OAuth is not yet passed to download workers, so no worker protocol version is changed. Google identity exposes no private-media capability.

AUTH-02 is implemented for the five-provider decision registry and independent Google account state. At the historical 0.2.8 baseline, AUTH-03/04/07/09 were partial: the Google slice and Accounts UI are implemented, but other adapters, OIDC ID-token flows where applicable, scoped transfer contracts and legacy adoption are pending. Userinfo is used directly over authenticated HTTPS; no unverified ID-token claims are consumed. AUTH-06 is cancelled; AUTH-08 private/export work is cancelled for Facebook/TikTok/Pinterest. Broader private YouTube completion is not claimed. AUTH-10 is verified for this implemented slice in [0.2.8 evidence](account-authentication-implementation-0.2.8.md); full-plan acceptance and provider live/private tests remain pending. Historical 0.2.7 assets remain immutable.


The shared foundation completes when stable identities, grants, protected credentials, lifecycle, migration and capability-aware UI pass without breaking existing downloads. Each account integration completes independently after its documented identity flow passes native/package checks.

Private downloading completes only when an approved supported route saves actual authorized media, rejects the negative control and preserves isolation/storage behavior. Identity-only/unsupported routes stay accurately labelled. This plan does not promise that all five providers expose all private content.

Update [platform support](platform-support.md), [account instructions](account-connection.md), [implementation progress](implementation-progress.md), [current scope](publication-scope-and-cleanup.md) and root README as implementation proceeds. Record matching build hashes/provider evidence. Keep historical 0.2.7 binary/source archives immutable; 0.2.8 implementation and documentation are a later development slice.
