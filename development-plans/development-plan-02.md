# Development Plan 02: SavedDesk Features, Reliability, and Security

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** Google identity and the account-capability foundation are implemented. Facebook/TikTok/Pinterest private work is excluded; Pinterest OAuth is cancelled. Encrypted SQLite, portable recovery and automatic updates remain planned.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

**0.2.7 follow-up:** Offline WebView2 setup now covers fresh installs and upgrades; private collections and sustained native tests are recorded in [runtime and performance evidence](runtime-private-and-soak-0.2.7.md). Private-content testing is owner-managed; optional testing is outside the current publication scope, signing follows source publication, and future features remain planned.

**Current architecture - 0.2.10:** gallery-dl and FFmpeg are external user-installed tools, excluded from the new installer. See [licensing and setup](licensing-and-external-tools.md). Older bundled-tool, no-Python and unresolved-source statements below describe their recorded earlier builds; they do not apply to the new payload or clear old installers.

**Repository/release preparation (7 October 2026):** Source/ignore auditing, locked build inputs and review-only GitHub workflows are prepared. The Add download heading ornament is removed. Original SavedDesk licensing is MIT. Source publication is a separate next action and signing follows it. Current 0.2.7 payload notices/source review and host installer lifecycle pass; further physical-machine acceptance is outside the current cycle. Encrypted SQLite, portable recovery and automatic updates remain planned, not implemented. See [current license and setup status](release-readiness.md). See [repository and release guide](repository-and-releases.md).

**Created:** 4 October 2026  
**Status:** In progress. Maximized launching, built-in media viewing, root-only relinking, interface responsiveness, and the first independent Plan 02 usability/safety features are implemented in the development app. Storage/IPC restructuring, encryption, and remaining milestones are future Plan 02 work; they do not block current source publication.  
**Baseline:** SavedDesk 0.2; Next.js static export, React, TypeScript, Tailwind CSS, Tauri 2/Rust/WebView2, a packaged Python worker, gallery-dl/yt-dlp, FFmpeg, and SQLite.  
**Predecessor:** [Development Plan 01](development-plan-01.md). This plan specifies the next development cycle; it does not erase unfinished requirements or historical evidence in Plan 01.  
**Evidence:** [Implementation progress](implementation-progress.md), [account connection](account-connection.md), and [development checks](development.md).

## 1. Outcome and scope

Make SavedDesk a dependable private media library that an ordinary Windows user can operate without understanding cookies, database files, download engines, or codecs. Preserve the existing visual design and low-resource architecture while improving collection updates, organization, recovery, video choices, and protection of local data.

The owner has confirmed real Instagram connection and successful downloading of an Instagram collection in Chrome. Real X account connection was confirmed earlier. Treat these as working baseline behavior and mandatory regressions, not a request to redesign sign-in. Further bookmarks/private-content testing is handled manually by the owner. Wider browser/account and multi-hour coverage may be revisited later.

The future requirements below define full Plan 02 completion, rather than prerequisites for publishing the current source. Implement them only in an authorized future cycle and in the dependency order below. Database encryption is planned work; the current catalog is ordinary SQLite. The delivered steps are recorded below. New private organization data, encrypted backup/lock controls, and collection model changes remain behind their storage and migration prerequisites. Independent interface and selected-folder checks can ship without changing the catalog format or working account verification.

### Immediate window behavior

- Create the main window maximized on every fresh launch, retaining the native title bar and Windows taskbar.
- Launching SavedDesk again while it is already running restores, maximizes, and focuses the existing main window.
- Users can still restore, resize, minimize, and close the window normally during that session. Preserve sensible restored dimensions and minimum sizes.
- Fresh launch and second launch after restoring/minimizing passed live Windows checks; all 21 native tests pass. Mixed DPI and monitor changes remain release checks. Do not force maximization repeatedly while the user is using the app.

## 2. Verified foundation and gaps

| Current behavior | Next-cycle requirement |
| --- | --- |
| Instagram session verification and a real collection download work; X connects | Preserve the working approval and identity checks; test connection alongside every storage/IPC change. |
| Rust opens a plaintext catalog in `catalog::open`; credentials are separately DPAPI protected | Add authenticated encryption for the catalog, controlled key access, recovery, and a reversible migration. |
| The browser native host reads connection status directly from SQLite | Route status through a bounded app-owned native IPC service before encrypting the catalog. Do not distribute the catalog key to the connector. |
| Many commands reopen SQLite for each operation | Introduce a small persistent database service, bounded queries, and short transactions before adding encryption overhead. |
| Jobs persist and completed assets are acknowledged; retry/resume rescan targets | Persist per-item outcomes and retry only unfinished inventory; prevent successful repeat copies being downloaded again by a retry. |
| Collection jobs in Downloads come from job targets; membership snapshots are incomplete | Add independent collections, memberships, and complete-versus-interrupted inventory snapshots. |
| Files can be opened, inspected, and previewed; a missing file can be downloaded again | Add safe move/relink, availability checks, backup/restore, and clear independent cleanup controls. |
| Original preservation and basic compatible MP4 conversion work | Add capability-aware video profiles and processing of existing downloads without unnecessary transfers. |
| An unsigned installer exists; current fixes are in the development app | Produce a current signed release, compatible updates, clean-machine validation, and a tested browser delivery path. |

## 3. Structure and service boundaries

Keep the current technology stack and production static frontend. No Next.js server or always-running Python service is needed.

Refactor as each milestone needs the boundary, preserving typed interfaces and runnable builds:

| Area | Proposed responsibility |
| --- | --- |
| `desktop/src/features/library/`, `collections/`, `downloads/`, `settings/` | Feature UI, accessibility, local presentation state, and bounded queries. Reuse shared controls and design tokens. |
| `desktop/src/lib/bridge.ts` and `contracts/` | Versioned native DTOs, commands, events, errors, and compatibility checks. |
| `desktop/src-tauri/src/storage/` | Key management, database service, repositories, encrypted migrations, maintenance, and recovery. |
| `desktop/src-tauri/src/downloads/` | Queue policy, item inventories, retry plans, acknowledgements, and collection reconciliation. |
| `desktop/src-tauri/src/library/` | Search, memberships, file availability, previews, moves, and relinking. |
| `desktop/src-tauri/src/security/` | Native IPC authorization, lock state, redaction, and narrowly scoped key/session access. |
| `desktop/src-tauri/src/platform/` | Windows window/tray/notification, power/network/drive integration, and native launch operations. |
| `backend/src/social_downloader/` | Extraction, media transfer, tool capabilities, encoding, and metadata normalization. Python receives no catalog encryption key and never opens the catalog. |
| `browser-connector/` | Explicit selected-platform permission, browser-session approval, and sanitized final status. No database access or database-key storage. |

Rust remains the sole catalog writer and owner of scheduling decisions. Move SQL into repositories instead of adding queries throughout UI commands. All changes preserve stable numeric account identities, account-scoped history, private credential transport, and completion acknowledgements.

## 4. Encrypted SQLite catalog

### 4.1 Encryption and build decision

Use a pinned, tested SQLCipher Community Edition build through `rusqlite`. Replace ordinary bundled SQLite with `bundled-sqlcipher-vendored-openssl` as the initial Windows build candidate, preserving the backup feature. Confirm the resolved SQLCipher/crypto versions, licenses, MSVC toolchain prerequisites, and packaged dependencies in a reproducible build before freezing the dependency change. This feature is documented by [rusqlite 0.38](https://github.com/rusqlite/rusqlite/tree/v0.38.0).

SQLCipher encrypts database pages and authenticates their contents. Its database and journal/WAL page protection does not extend to every temporary file; disable file-based SQL temporary storage, keep sorting workloads bounded, and inspect the resulting artifacts. See [SQLCipher design](https://www.zetetic.net/sqlcipher/design/). Include SQLCipher and crypto-provider notices in the installed app's accessible license information, following [Community Edition distribution guidance](https://www.zetetic.net/sqlcipher/community/).

- Encrypt captions, search indexes, usernames, collection names, history, queue records, and stored paths within the catalog.
- Keep schema and data in the encrypted file; do not enable a plaintext-header exception for Windows.
- Require an expected `cipher_version` and a successful keyed schema read. An ordinary SQLite build must fail validation rather than silently accepting an ignored encryption PRAGMA.
- Apply the key before database operations, then validate the schema, foreign keys, and supported format. Wrong/missing keys or corruption must never cause creation of an empty replacement library.
- Use documented SQLCipher settings and page authentication. Do not invent encryption or weaken password-derived key settings to meet performance targets. [SQLCipher key and migration API](https://www.zetetic.net/sqlcipher/sqlcipher-api/).

### 4.2 Key lifecycle and protection boundary

Generate an independent 256-bit catalog key using the Windows cryptographic random generator. Store only a versioned, current-user DPAPI-wrapped envelope in the per-user app-data directory, separate from the catalog. Use a native key API that avoids embedding keys in traced SQL, logs, command lines, environment variables, telemetry, React state, or worker frames.

DPAPI normally ties decryption to the Windows user and computer; copying the key envelope alone is not a portable recovery method. This is a protection boundary, not a defense against malware already running as that user. [Microsoft DPAPI behavior](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata).

Required lifecycle:

1. Create and persist the wrapped key atomically before activating a new encrypted catalog; reject conflicting envelopes.
2. Unlock natively for normal startup without requiring a technical configuration screen. Restrict key-file and app-data access to the intended Windows user and required system principals.
3. Keep an owned sensitive buffer, minimize copies, and clear buffers when released. Handle library/process memory limits honestly; memory wiping does not promise that Windows page files or crash dumps contain no plaintext.
4. Offer a portable encrypted recovery package using a user-chosen passphrase and a vetted authenticated encryption/KDF library with versioned parameters. Show and verify recovery instructions before retiring legacy files. Recovery must work on a fresh Windows user/computer.
5. Treat an unavailable DPAPI envelope as a recovery condition. Offer Restore backup or reconnect/setup only through explicit choices; never silently regenerate a key for an existing catalog.
6. Rotate keys only through a resumable maintenance procedure with an encrypted rollback copy and recoverable old/new envelopes. Test interrupted rotation before exposing it.

### 4.3 Database service and native-host compatibility

Introduce one serialized writer and at most two long-lived keyed readers (one reader in low-resource mode) on background threads. Keep reader lifetimes short at transaction level, apply busy timeouts, and coordinate checkpoints and maintenance. Never put a non-thread-safe connection behind unrestricted access from async tasks. SQLCipher recommends connection reuse, indexed queries, and transactions for performance; measure the actual build rather than assuming encryption is free. [SQLCipher performance guidance](https://www.zetetic.net/sqlcipher/performance/).

The browser native host currently opens the catalog read-only for `connection_status`. Remove that access before the cutover:

- Serve selected-source/browser connection status through app-owned local IPC using the existing Windows-user boundary, strict frame limits, timeouts, and origin checks.
- Scope each status response to the matching connection attempt with a short-lived opaque handle; do not expose an unrestricted library/account query to the extension.
- Keep a lightweight status responder available after an approval request finishes. Test popup close/reopen, app shutdown, expired handles, and simultaneous approvals.
- Return only state, verified display username, and sanitized help text. The helper must not unlock the catalog or read the DPAPI key/session caches.
- A locked/stopped app returns a controlled unavailable/locked response. Never solve helper compatibility by creating a plaintext status database containing private catalog metadata.

### 4.4 Existing catalog migration

Use a maintenance state that pauses new jobs, verification requests, status reads, and schema writes. Show progress and an understandable recovery message.

1. Confirm free space, access, format, and integrity; create a consistent source snapshot with a database-aware mechanism. Include committed WAL state and quiesce all catalog connections.
2. Persist migration state and wrapped-key envelopes atomically. Keep the original untouched until verification succeeds.
3. Export plaintext content to a separate keyed destination using supported `sqlcipher_export` procedures. `rekey` is not a plaintext-to-encrypted migration tool. Explicitly preserve schema-version metadata, indexes, constraints, triggers, and relevant PRAGMAs; verify their parity rather than assuming export copies connection state.
4. Validate SQLCipher page integrity, SQLite integrity, foreign keys, row counts, stable account/media/job IDs, settings, file-version history, and schema compatibility.
5. Close/checkpoint handles, atomically activate the encrypted destination on the same volume, and verify a normal restart. Resume interrupted jobs only under existing explicit-resume rules.
6. Preserve an encrypted recovery/rollback copy. Inventory older plaintext catalogs, pre-upgrade backups, WAL/journal companions, and diagnostic/export artifacts. Until legacy plaintext retirement is completed, show that old unencrypted copies remain.
7. Offer a clear retirement action after recovery verification. Do not claim guaranteed secure erasure on SSDs, synced folders, Windows backups, or other external copies. Restrict retained legacy copies and explain their exposure.
8. At every crash/failure boundary, select the last fully verified catalog without dropping records or overwriting source media. Never make the old binary read a ciphertext file as plaintext; validate update/downgrade compatibility and provide recovery guidance.

Do not copy only a live `.db` file while ignoring its WAL. SQLite documents the relationship between the database and WAL and the need for checkpoints in [WAL operation](https://www.sqlite.org/wal.html).

### 4.5 Security acceptance

Use fixtures containing distinctive synthetic private strings, not personal cookies/content. Prove: ordinary SQLite cannot read the protected catalog; correct keys work; wrong/missing keys fail safely; tampered pages are rejected; DB/WAL/journals/backups contain no fixture plaintext; temporary SQL stores remain in memory; key/session bytes never appear in UI, events, process arguments, or logs; cross-user DPAPI unlock fails; passphrase recovery works under a new Windows user; interrupted migration/rotation recovers every record. Plaintext searches alone are supporting evidence, not proof of cryptographic security.

Downloaded images/videos, filenames, exported metadata, thumbnails, and OS viewer caches are outside catalog encryption. Explain this in ordinary language in Privacy settings. Keep exports explicit and scoped; use protected app-data for private caches. Media-file encryption would require a separate playback/export design and is not implied by an encrypted catalog.

## 5. Collection updates and reliable downloads

**Delivered reliability repair (4 October 2026):** the current adapter accepts Instagram's HEIC filename hint long enough to inspect the actual response signature and save a returned JPEG correctly. Strict final-format/header checks still reject unsupported media. Individual format failures are counted, later assets continue, and resumed jobs skip committed files before requesting media. Source and packaged regressions reproduce a resume after 129 existing assets. Pagination checkpoints, complete collection snapshots, detailed retry inventories, and the remaining requirements below are still planned work. See the [evidence ledger](implementation-progress.md).

### Collection model

Create first-class collections independent of job history, keyed by source/account/remote collection ID or canonical target. Store memberships through a join table so one downloaded post can belong to multiple collections without duplicating the asset. Handle renamed collections without changing their identity.

Persist scan snapshots, pagination checkpoints, first/last observed times, and completeness. Only a complete successful inventory can establish that an item disappeared remotely. An interrupted scan, private/deleted post, challenge, or rate limit must not mark unseen items removed or delete local files.

### Everyday download flow

- Offer **Download new items**, **Download everything again**, and a clear current summary. Explain that repeat mode creates additional copies.
- Distinguish discovered posts from asset counts; treat carousels consistently. Do not invent totals before scanning establishes them.
- Persist each asset outcome: downloaded, already present, text only, unavailable, failed, or interrupted. Report counts and actionable explanations.
- **Retry failed items** uses the recorded unresolved inventory, rather than repeating successful assets or expanding into a fresh whole-collection repeat.
- A resumed incremental scan can discover new posts, but must preserve the distinction between scan continuation and retry of a frozen inventory.
- Commit verified files and catalog acknowledgements before success; reconcile a crash between file creation and acknowledgment without overwriting originals.
- Show truthful states: discovering, downloading, processing video, paused, waiting for network/drive/space, completed with issues, and failed.
- Respect provider retry guidance and keep one retry owner. Do not immediately retry authorization failures, permanent missing content, or HTTP 429 without a bounded policy and valid delay.

**Acceptance:** add/remove/rename a fixture collection; interrupt pagination; retry a partly failed repeat run; restart between transfer and acknowledgement. Account isolation, memberships, copy counts, and locally preserved files must remain correct.

## 6. Library and usability improvements

**Implemented media-viewing step (5 October 2026):** the post dialog now provides an in-app image viewer with zoom/fit/fullscreen, a video player with native playback/seek controls, and navigation between available assets/copies. Audio/text have appropriate display controls, with a guarded Windows fallback for unsupported codecs. ID-only native streaming revalidates the selected root and bounds video/audio range responses to 2 MiB. The complete codec, accessibility, mixed-DPI, and weak-hardware acceptance matrices remain open. See [usage and boundaries](media-and-storage.md).

**First independent Plan 02 feature batch (5 October 2026):** Settings now includes an on-demand local setup checklist covering the selected folder's availability/write access, user-available disk space, worker startup/protocol, executable FFmpeg/FFprobe probes, and selected-browser host registration/package presence. Busy engine checks return Not checked immediately. The check does not read platform sessions or contact providers. Registration does not prove that the browser extension is installed or approved; the UI states that distinction and links to Accounts. Results expire after folder/browser changes. The viewer adds an available-file counter, keyboard navigation/zoom/fullscreen/playback/mute, and ID-only Open original post in browser. Native validation restricts source links to supported public HTTPS Instagram/X post routes and removes tracking/query/fragment data. Privacy settings explain current DPAPI session protection, the unencrypted catalog/media boundary, and safe disconnect consequences. Detailed diagnostics, extension-version negotiation, full accessibility and release acceptance remain required.

**Library thumbnail containment repair (5 October 2026):** portrait preview overflow, partly masked by row hover, was reproduced and fixed. Fixed tile/grid/image constraints preserve thumbnail geometry before/after hover and virtual scrolling; 16 browser checks and real portrait JPEG/WebView2 media acceptance pass. This expands the populated-media usability checks without claiming the full accessibility/DPI matrix. See [UI evidence](ui-testing.md).

**Earlier fullscreen post-navigation step (5 October 2026; superseded by the interface correction below):** Previous/Next and Cancel fullscreen remain visible inside the shared viewer. Mixed images/videos from the same post switch without exiting fullscreen; cancellation/Escape return to the post dialog, focus restores, boundaries disable and previous playback stops. 18 browser checks and actual mixed-media Windows acceptance pass. This delivers mouse navigation/exit; the broader accessibility/DPI/codec matrix remains open. See [usage](media-and-storage.md).

- Add collection pages with download/update history, last complete check, counts, and locally unavailable files.
- Add local tags, favorites, notes, date/creator/source/type/availability filters, sorting, and saved searches. Store them encrypted and avoid platform writes.
- Add bounded full-text search only after verifying FTS support in the selected SQLCipher build. Page results and build indexes off the renderer thread.
- Provide a post viewer with carousel navigation, captions, available copies, and source links; open unsupported media with the Windows viewer. Show useful fallback content for missing previews.
- Add multi-select actions with explicit previews for exports, file moves, and deletion. Keep selection bounded and confirmation proportional to destructive scope.
- Show download history and per-item reports using ordinary language. Offer recovery actions beside the error instead of requiring users to interpret HTTP codes.
- Make readiness checks and help actionable: output folder, free space, missing drive, tools/runtime, and connector installation/update status. Keep developer diagnostics in a separate user-requested report.
**Accessibility/usability batch (5 October 2026):** replaced the fullscreen toolbar with left/right edge arrows and top-right image exit. Video fullscreen/exit is integrated into its accessible seeking/control bar, using the stable post frame and native HTML video decoding. The player adds speed and 10-second skips. Library keyboard browsing reaches the bounded page with contextual descriptions/position metadata while retaining the 18-row cap; full-row opening, screen heading focus, filter reset, missing-file settings recovery, help and persistent 100-200% interface size are implemented. TypeScript/export, 28 UI checks, four-width automated accessibility scans and isolated Windows media/zoom/focus acceptance pass. This is an incremental accessibility review, not completion of the full acceptance matrix. See [findings and limits](accessibility-and-usability.md).

- Support keyboard navigation, visible focus, screen readers, contrast, reduced motion, text scaling, and common shortcuts. Preserve the current design while validating 125-200% scaling and mixed-DPI monitors.

**Acceptance:** a user can connect, update a collection, find a saved post, retry one failure, and locate a missing file without documentation or exposure to engine settings. Test populated screens at the existing minimum window size as well as maximized.

## 7. Storage, backup, recovery, and privacy controls

**Implemented root-only relinking step (5 October 2026):** the current save folder is now the sole media-browsing boundary, including preview, built-in/external file opening, availability, and folder actions. Startup, folder changes, and Find moved files can relink uniquely matched moved content inside that folder. Matches require filename, expected size, supported content signature, and job-layout disambiguation where available; ambiguous copies remain unlinked. Visible thumbnails regenerate locally when their cache was not moved. This delivers location recovery, not the automatic Move library operation, checksummed identity, recoverable move journal, per-item repair inventory, encrypted backups, or SQLCipher migration below. Those remain required work.

Implement Move library folder and Locate moved files with explicit native folder selection. Record stable roots, expected asset identity/type/size, and a recoverable move journal. Verify copied files before updating catalog paths or retiring originals; cross-volume moves must handle interruption and limited free space. Never match solely by filename or accept paths outside the approved root.

**Delivered selected-folder/space guard (5 October 2026):** prepare, queue, retry, scheduler startup, and each approved new asset transfer require an existing selected root and at least 256 MiB available to the current Windows user. Missing selected folders are never recreated or replaced by another location. The app default folder is created only for a brand-new catalog. A failed guard preserves completed files and gives a Settings/reconnect/retry action; retries are explicit. The setup checklist warns below 1 GiB. This is a conservative floor, not an estimate that a whole collection or encoding will fit. In-flight large-file reservation, automatic pause/wait states, continuous monitoring, checksummed move journals and backup/restore are still open.

Detect removable/offline drives without immediately redownloading everything. Offer Wait for drive, Locate files, or Choose another destination. Preserve completed assets and distinguish temporary absence from confirmed deletion.

Provide independent controls for preview cache, history, account sessions, catalog backups, and actual downloaded files. Show estimated space and consequences before destructive cleanup; use recoverable quarantine/Recycle Bin where appropriate. Disconnect removes session access but preserves media and history.

Implement encrypted catalog backups with integrity verification, retention, progress, and restore rehearsal. Explain whether a backup contains catalog only or includes media. Portable recovery must not bundle platform sessions by default; restored accounts reconnect through the existing browser flow. Validate archives against traversal, oversized input, unsupported versions, corrupt data, and missing media. Preserve the current catalog until restore validation succeeds.

Provide a privacy lock on Windows session lock and manual Lock action: checkpoint/pause jobs, close keyed connections, release sensitive buffers, clear privileged UI data/previews, and deny catalog operations until unlock. Integrate supported Windows credential verification for intentional unlock. Specify this as protection from casual local access; current-user DPAPI alone does not prevent same-user malicious software from accessing unlocked data. Define tray notifications and previews to avoid revealing private captions while locked.

## 8. Video features without technical prerequisites

- Show tool/codec capabilities and plain presets such as Original, Smaller compatible video, and Audio only. Hide or disable unsupported combinations with a useful explanation.
- Prefer compatible H.264/AAC source streams and remux without encoding when possible. New video downloads retain only a verified playable MP4; replace incompatible sources after verification. Keep failed unfinished sources retryable. Earlier library files retain their existing recovery/deletion support.
- Add codec/container, quality, audio, trim, and subtitle options in an advanced panel, validating real streams and tool support before starting.
- Process existing local originals to create another variant without redownloading. Use the same completion/integrity rules as downloaded media.
- Hardware encoding requires explicit capability detection and validated output; fallback to bounded software encoding with a clear message. Low-resource mode retains one active encoder and limited threads.
- Never silently exceed the selected resolution cap, replace originals, or imply that encoding improves source quality.

**Acceptance:** compatible remux, constrained resize, audio extraction, trim, unsupported codec/device, missing tools, interrupted output, and a reused local original all produce correct decodable files and separate history entries.

## 9. Windows integration and resource policy

Add tray controls, clear close-versus-continue behavior, and per-job completion/failure notifications. Respect Windows notification settings, privacy lock, and user choice; avoid notification spam for every item. Keep background mode visible and allow Exit to stop owned workers cleanly.

Add metered-network, battery/power-saver, bandwidth, low-disk-space, and removable-drive policies. Default to conserving resources and offer a simple Continue once action where appropriate. Recover without restarting successful assets. Keep scheduled collection checks opt-in, spaced, and account scoped; no hidden authentication polling or simultaneous jobs against the same archive.

Measure all processes: native host, WebView2, Python, FFmpeg, and connector work. Reuse the Plan 01 cold/warm start and memory gates, and compare encrypted versus plaintext fixture baselines on the same hardware. Retain bounded result pages and previews. Cancel stale searches and throttle progress updates. Require representative weak-hardware measurements before advertising performance superiority.

## 10. Security hardening and trustworthy delivery

- Audit native commands, worker frames, media preview access, browser IPC, paths, and external links for least privilege and strict validation. No arbitrary shell, SQL, or user-supplied executable paths from React.
- Preserve CSP/local asset boundaries. Treat downloaded captions and filenames as untrusted text; do not render raw HTML or navigate the privileged WebView to platform pages.
- Add bounded, redacted diagnostics that the user can preview before exporting. Exclude cookies, tokens, encryption keys, signed media URLs, raw provider bodies, and private content by default.
- Keep production logging and crash handling from dumping sensitive buffers. Document practical limits rather than promising protection against an already compromised Windows user.
- Maintain dependency/crypto/tool inventories, license notices, vulnerability review, and reproducible pinned packages. Validate worker/tool integrity without downloading arbitrary executables on demand.
- Sign application/installer releases and establish an update channel with signature verification, compatibility checks, staged replacement, and recovery. Never update while a catalog migration or job is writing files. Old releases must not silently downgrade encrypted catalogs.
- Test install/update/uninstall on a clean standard-user Windows environment, including WebView2, encrypted storage, browser native-host registration, and retained user data. Offer explicit data-retention choices during uninstall.

## 11. Milestones and implementation order

| Milestone | Deliverable | Required gate before advancing |
| --- | --- | --- |
| M0 - Immediate window change | Maximized creation and repeated-launch restoration; owner acceptance recorded | Rebuilt development app launches maximized; restoring/minimizing then relaunching maximizes the existing instance. |
| M1 - Storage and IPC foundation | Persistent database service, repositories, app-owned scoped status IPC, versioned contracts | Current connector, identity, queue, and duplicate flows pass without helper SQLite reads. |
| M2 - Encrypted catalog | Pinned SQLCipher build, DPAPI key lifecycle, portable recovery, safe migration/rollback | Fresh/existing catalogs, wrong keys, tampering, interrupted migration, encrypted backup and recovery checks pass; working account flows remain intact. |
| M3 - Download and collection model | Complete snapshots, memberships, item reports, restricted retry/resume | Incremental/repeat/carousel/interrupted-scan/account-isolation acceptance passes without extra successful transfers. |
| M4 - Library and storage UX | Search/organization/viewer, multi-select, move/relink, backup/restore, independent cleanup, privacy lock | Populated usability/accessibility and failure-recovery scenarios pass; no destructive action is ambiguous. |
| M5 - Video and Windows policies | Local-source processing, advanced profiles, tray/notifications, network/power/drive controls | Decodable outputs, original preservation, pause/recovery and measured resource budgets pass. |
| M6 - Release qualification | Redacted diagnostics, signed updates/installers, notices, clean-machine/browser/hardware validation | Full acceptance matrix, recoverable updates, encrypted migration, and observed usability pass. |

Each milestone produces a runnable build, a short explanation of actual behavior, meaningful targeted checks, and an updated progress record. Document limitations when a provider/device cannot be exercised. Do not mark a milestone complete based on fixture tests alone when its gate explicitly requires a real machine/account.

## 12. Completion criteria

Plan 02 is complete when existing owner-verified Instagram and X connection behavior remains usable; encrypted catalog/recovery is deployed without losing history; collection updates and restricted retries are predictable; the library is accessible and searchable; storage/video/background operations recover safely; security controls preserve their stated boundaries; and a current signed release passes the documented weak-hardware, browser, migration, and clean-machine acceptance gates.

Keep [implementation progress](implementation-progress.md) as the evidence ledger. Record actual versions, artifacts, checksums, measurements, known gaps, and owner acceptance there. The plan defines required future work and must not be presented as a list of features already delivered.


**Fullscreen video polish (5 October 2026):** filename/count tags are no longer visible over fullscreen content. Video occupies the full frame at its maximum uncropped size with preserved aspect ratio; a translucent single-row control overlay uses no layout space. Three-second paused/playing idle hiding, mouse movement reveal and keyboard-focus retention are implemented and verified in the real Windows player. TypeScript/export, 28 UI checks and isolated native media/storage acceptance pass. See [usage](media-and-storage.md) and [verification](implementation-progress.md). Broader accessibility and release acceptance remain open.


**Interface and video compatibility batch (6 October 2026):** app-owned accessible scroll rails cover the page, sidebar/collections, virtualized library, dialogs, image/text viewers and video control/error areas. Wheel/touch behavior and bounded virtualization remain native. A persisted pin/collapse sidebar expands temporarily on hover/focus and respects reduced motion; low-resource status moves there and the bottom activity bar is removed. Header actions are grouped, helper text is padded, and search/item-wide focus overlays are removed while retaining keyboard cues. On-demand original-preserving H.264/AAC playback copies handle the reported VP9 MP4 failure, use ID-scoped selected-root streaming, and never alter download identity/history. The viewer also rejects stale preparation results. Playback cache quotas/cleanup, broader codec/HDR/hardware validation, manual assistive-technology acceptance and weak-hardware performance measurement remain open. See [current behavior and boundaries](media-and-storage.md).


**Settings, Accounts and fast playback follow-up (6 October 2026):** cards now share consistent padding and reading rhythm, with responsive field/action rows and separately organized browser setup, account status and privacy guidance. The brand bookmark controls sidebar pin/collapse; Collections navigation and the Downloads badge are removed. Compact widths preserve reading space while retaining the wider-window pin preference. A bounded native MP4 metadata fast path opens ordinary AVC/H.264 videos without starting or waiting for the download worker. Other codecs and forced compatibility still use original-preserving playback copies, whose first conversion takes time and whose cache is reused. This does not complete the broader codec/HDR, weak-hardware, encryption, cleanup or assistive-technology acceptance requirements. See [verification](implementation-progress.md).


**Sidebar stability and playback efficiency follow-up (6 October 2026):** fixed internal sidebar geometry, a centered brand mark, vertical-only rails and a short hover-leave grace remove the reported hover glitches. Rounded backgrounds preserve pointer and keyboard hit areas. Native playback checks reuse bounded, fingerprinted codec decisions, avoid duplicate validation, and return the initial playback decision with the file list to remove an extra command. Containment/availability validation remains mandatory, and unknown formats/forced compatibility still use original-preserving preparation. Remaining weak-hardware, broader format and cache-lifecycle release checks remain tracked. See [measured evidence](implementation-progress.md).


**Mouse playback and fullscreen follow-up (6 October 2026):** right-button release now toggles video playback across the player background without hijacking interactive controls. Resize-aware 200 ms media transforms smooth image/video entry and exit while preserving the decoder/source, focus and dialog position; reduced motion disables animation. Live Windows tests cover background clicks, playing/paused media, Escape, rapid switches and reduced motion. See [current implementation evidence](implementation-progress.md). Broader hardware and manual accessibility acceptance remain open.


**Left-click and fullscreen backdrop follow-up (6 October 2026):** playback now uses left-click, following the clarified interaction. Temporary modal/slot geometry locks and backdrop fades stabilize the area behind the fullscreen media; rejection and reduced-motion paths are covered. Live Windows measurements show constant dialog/slot dimensions across paused/playing image/video transitions. See [current evidence](implementation-progress.md). Hardware and manual accessibility release checks remain open.


## Additional milestone: public platform expansion (6 October 2026)

The user requested YouTube, Discord, Facebook, TikTok, Pinterest and Reddit. The first implementation shares the existing queue/catalog/viewer and adds explicit public-link workflows; [platform support](platform-support.md) defines the exact capability and verification matrix. New services must not reuse Instagram/X sessions or claim account connection without provider verification.

Implemented: public link validation at both worker/host boundaries, source labels/filtering, platform-aware help, stable per-file identities and catalog decisions, original-preserving video options, scoped board sections, text-plus-media catalog classification, selected Discord attachments with protected signed URLs, and bundled YouTube JavaScript support. Existing account approval received a bounded local-pipe handoff fix after native regression testing; authorization itself is never replayed.

Remaining acceptance: Facebook parsing compatibility, Reddit approved API access and network restrictions, private-account integrations with genuine provider approval, live platform collection inventories, clean-machine runtime delivery and weak-hardware performance. Existing encryption/recovery, accessibility and production requirements remain required and are not replaced by this milestone.


## Browser sessions, live progress and video repeat (6 October 2026)


Implemented optional, separately approved YouTube/Facebook/TikTok/Pinterest browser sessions using the existing native messaging/direct Firefox and DPAPI paths. Each origin is requested separately, with no Google-wide cookie permission. These sessions are labelled approved rather than remotely verified accounts; per-download provider access remains authoritative. Instagram/X verification remains intact. Authenticated jobs/drafts are bound to a protected credential-set namespace, and existing public jobs remain anonymous after connection. Changing the session does not redirect an old job to another identity. Reddit private workflows remain dependent on registered provider applications, permissions and configuration; Discord is scoped to user-selected direct media links; browser user-token automation is not added.

Implemented live current-transfer byte progress, completed-file counts, explicit discovery/processing/queue states, unknown-total bars, and bounded native validation/sanitization. Percentages are used only for actual transfer byte totals, never an unknown collection inventory; unknown totals do not get fabricated ETAs. Added remembered native-video repeat with accessible button state, keeping the same decoder across fullscreen changes. These changes reuse selected-root storage, originals, queue, pause/recovery and credential privacy boundaries.

Remaining acceptance includes real provider private-content/browser matrices (especially Facebook parser compatibility), application-backed Reddit/Discord access, and weak-hardware measurements. Refer to [account setup](account-connection.md) and [platform support](platform-support.md) for exact behavior and limits. Session rotation creates a new credential scope; stable remote provider identity verification for these four platforms is a follow-up requirement, not claimed complete.


## Confirmed deletion and download-time playback readiness (6 October 2026)

Implemented post and individual saved-copy deletion from the shared library/viewer, job deletion from Downloads, and whole-collection deletion across repeated jobs for the same source/account/target. Native confirmation reports stored files/bytes and out-of-folder/missing records. Single-use expiry, revalidation, selected-root containment, active-worker exclusion, reversible staging, transaction rollback, interrupted-operation recovery and exact generated-cache cleanup protect existing data. Copies in other jobs and unrelated storage are preserved; remaining posts update their displayed collection/media type. Only empty directories are removed. This is permanent confirmed deletion, not a Recycle Bin/Undo implementation.

Implemented automatic playback compatibility before recording newly downloaded videos as saved. Compatible streams are copied/remuxed where possible; unsupported video is encoded once into a retained-original playback copy. Explicit conversion skips redundant inspection and uses stream copying when resolution/codec allow it. Completed videos reuse native scoped cache routes without launching conversion on opening. Legacy videos retain the on-demand fallback. Schema version 3 tracks conversion originals and their byte sizes so folder repair and deletion remain accurate for new downloads.

See [current behavior and boundaries](media-and-storage.md#deleting-saved-content) and [verification](implementation-progress.md). Existing untracked originals/engine leftovers are kept; no whole-library background conversion or simultaneous network/encoding claim is made. Encryption, broader HDR/hardware/codec support, cache quotas and the other unfinished requirements remain open.


## Compatible-only new video downloads (6 October 2026)

The latest storage requirement supersedes original-preserving derivatives for **new video downloads**. Both output profiles prefer compatible AVC/AAC streams, merge to MP4 without encoding when possible, finalize incompatible-only sources to one verified MP4, and remove the incompatible source only after successful verification. New catalog records/previews point to that final file, with no conversion-original or download-time playback sidecar. Explicit repeat downloads still create the user-requested additional saved copy in a separate job folder.

Implemented selector codec filters, bounded resolution branches and resize-only higher-source fallback; reliable merged-file identification after component cleanup; in-place atomic MP4 replacement; WebM/MKV-to-MP4 cleanup; collision protection; runtime-tested Quick Sync/NVENC/AMF with real-input software fallback; two-thread `superfast` H.264 fallback; and updated settings/profile guidance. Conversion remains necessary for source-only incompatible codecs or resizing. Temporary retry sources survive failed work. Existing library files are not silently mass-converted or deleted.

Required acceptance covers a real split AVC/AAC transfer/merge without encoding, refusal to fetch higher VP9/Opus when compatible streams exist, actual WebM replacement, output decoding/native playback, source preservation on verification failure, no unrelated-file overwrite, and unavailable/failed hardware fallback. See [current video policy](media-and-storage.md#download-time-playback-compatibility) and [validation evidence](implementation-progress.md).


## Compatible-only new video downloads (6 October 2026)

The latest storage requirement supersedes original-preserving derivatives for **new video downloads**. Both output profiles prefer compatible AVC/AAC streams, merge to MP4 without encoding when possible, finalize incompatible-only sources to one verified MP4, and remove the incompatible source only after successful verification. New catalog records/previews point to that final file, with no conversion-original or download-time playback sidecar. Explicit repeat downloads still create the user-requested additional saved copy in a separate job folder.

Implemented selector codec filters, bounded resolution branches and resize-only higher-source fallback; reliable merged-file identification after component cleanup; in-place atomic MP4 replacement; WebM/MKV-to-MP4 cleanup; collision protection; runtime-tested Quick Sync/NVENC/AMF with real-input software fallback; two-thread `superfast` H.264 fallback; and updated settings/profile guidance. Conversion remains necessary for source-only incompatible codecs or resizing. Temporary retry sources survive failed work. Existing library files are not silently mass-converted or deleted.

Required acceptance covers a real split AVC/AAC transfer/merge without encoding, refusal to fetch higher VP9/Opus when compatible streams exist, actual WebM replacement, output decoding/native playback, source preservation on verification failure, no unrelated-file overwrite, and unavailable/failed hardware fallback. See [current video policy](media-and-storage.md#download-time-playback-compatibility) and [validation evidence](implementation-progress.md).


Validation for the compatible-only milestone: **243 checks** and three real packaged-app fixture runs pass. Visible WebView2 frames, direct MP4 readiness, compatible-only storage and safe deletion/retry behavior are confirmed. The isolated software comparison measured 1.80x faster encoding; a ten-minute 720p VP9/bundled Quick Sync run finished conversion and verification in 113.60 seconds. These measurements are specific to this development PC. Exact artifacts/evidence are in [implementation progress](implementation-progress.md#compatible-only-video-downloads-and-faster-encoding-6-october-2026).


## Multi-post deletion and provider access follow-up (7 October 2026)

Implemented: page-scoped multi-post checkboxes, range and select-page actions, accessible batch review and one recoverable native deletion transaction. Selected IDs are preserved across polling and cleared on page/filter changes; chosen-folder safety, download exclusion and rollback remain in force. See [media/storage selection behavior](media-and-storage.md#multi-post-selection-7-october-2026).

Reddit API approval remains unavailable; Accounts retains the official approval request and implementation guidance. The later direct-media milestone supersedes earlier Discord application/admin provisioning proposals: selected attachment downloads require no server-management permission or Discord account integration. See [the provider guide](discord-media-downloads.md).

## Direct Discord media and platform removal (7 October 2026)

The user removed Spotify entirely and selected direct Discord CDN media links as the complete Discord scope. Supersede earlier Discord bot/server provisioning proposals. Remove Spotify UI, icon, metadata adapter, host/worker source registration, setup actions and active audio-sourcing roadmap. Preserve existing local files/history; unsupported jobs must not offer retry.

Implement a ready Accounts shortcut and specific attachment-link form, decoded Unicode captions with safe ID-based filenames, image/video/audio classification and Audio library filtering. Permit only HTTPS attachment paths on cdn.discordapp.com, bounded unique signature parameters and media extensions. Follow no redirects, contact no Discord account/message/server APIs, and forward no browser/account credentials. Validate nonempty complete transfers, content signatures and audio decoding before publishing. Finalize videos as compatible MP4 with no retained incompatible success copy. Clean up failed partial transfers and safely explain expiry/429 without exposing signed URLs.

Reuse queue progress, stable attachment duplicate identity, repeat/new-only decisions, selected-folder containment, viewing and deletion. Signed pending URLs stay DPAPI protected; SQLite/display URLs exclude signatures. Expired links are replaced by freshly copied media URLs, not by account reconnection. Verify through shared worker/host contracts, UI/accessibility tests and isolated packaged Windows transfers and audio/video playback. [Platform support](platform-support.md) and [user instructions](discord-media-downloads.md) define the delivered scope and acceptance evidence.

## Instagram video reliability and bulk overhead (7 October 2026)

Implemented frame-level colour normalization for the reproduced reserved-metadata Instagram failure, including legacy playback preparation. Already compatible MP4s remain byte-for-byte unchanged. Remux/audio-only paths avoid video encoding when suitable; unsupported video or required resizing still encodes. Generated files use one bounded combined codec/startup-frame verification, executable checks reuse fingerprinted process-local decisions, and current valid thumbnails avoid regeneration.

Instagram/X collection finalization now records failed items and continues approved inventory. Readable retry inputs survive failed conversion; unreadable unrecorded inputs are quarantined so retry can fetch fresh bytes. A packaged Windows test using the retained failing video confirms visible playback, compatible-file checksum preservation, continued processing after a bad video and retry of only the unfinished item. 142 backend and 56 native tests pass. Local processing measurements show reduced overhead, without claiming faster provider/network throughput or complete HDR/device acceptance. See [exact evidence and current artifacts](implementation-progress.md#instagram-video-reliability-and-bulk-processing-overhead-7-october-2026).

## Reddit removal, platform navigation and persistent playback preferences (7 October 2026)

Reddit is removed from current scope, superseding its earlier public/API proposals. Platform selection, icon/account-setup guidance, native setup command, worker adapters and public URL routes are removed; negative contracts reject its links. Historical files are retained as generic local content with no retry for unsupported jobs. Discord guidance now lives in [its media-download guide](discord-media-downloads.md).

Implemented sidebar saved-content views in the required order: YouTube, Facebook, Instagram, Discord, TikTok, Pinterest, X. Shared search/filter/view/delete behavior follows the chosen source. Volume and mute are native persisted preferences in catalog schema version 4, with validated ordered writes, drag coalescing, close/switch flush and late-read protection. Shared input/interactive focus outlines and shadow rings are removed; static borders and keyboard functionality remain, using background/text cues. See [current evidence and artifacts](implementation-progress.md#reddit-removal-platform-sections-and-persistent-volume-7-october-2026). Encryption, broader hardware/provider and manual accessibility release gates remain open.

## Advanced conversion controls and modern switches (7 October 2026)

Implemented real advanced video settings in Settings and per-download overrides: automatic/hardware-or-software encoding, bounded software presets, CRF quality choices and converted-video audio bitrate. Info buttons explain every setting, including resolution and resize policy. Compatible video/AAC is copied unchanged; selected options apply only when conversion is necessary. Restoring defaults resets all video choices.

Settings retain native persistence; schema version 5 captures per-job conversion options before queueing. Retry uses the original options. Native and worker validation reject unsupported values and arbitrary arguments. Modern accessible switches replace low-resource and library-selection checkbox visuals while preserving keyboard and Shift-click batch behavior. See [implementation evidence](implementation-progress.md#advanced-video-settings-and-modern-switches-7-october-2026) and [setting effects](media-and-storage.md#advanced-video-settings-and-switches-7-october-2026). Encryption and the remaining release gates retain their existing scope.


## Shared controls, account layout and persistent sidebar (7 October 2026)

Implemented a shared 40 CSS-pixel button height with clear boundaries, square icon buttons and label-sized action widths. Dropdowns use matching surfaces, inset custom arrows and native accessible combobox behavior. Shared helper/action spacing and card-width responsive fields prevent crowded labels and explanations. Content selection uses checkboxes; configuration uses switches, superseding the prior all-switch selection treatment.

The sidebar changes only when the SavedDesk icon is clicked. Hover/focus expansion and Low-resource sidebar content are removed. Native Settings JSON preserves the chosen state across process restarts; older catalogs receive the existing expanded default without another schema migration. Compact layouts use an explicitly chosen overlay rather than automatic temporary expansion.

Accounts places browser/access and privacy guidance above controls/cards and includes Discord in the same spaced grid as Pinterest and the other accounts. Required acceptance checks every screen and major dialog at desktop/tablet/narrow widths for button boundaries, consistent dimensions, text containment, dropdown insets and horizontal overflow, plus real Windows control geometry and restart persistence. See [current verification](implementation-progress.md#shared-controls-account-layout-and-persistent-sidebar-7-october-2026). Encryption and existing production release gates remain open.


## Information dialogs and stable search (7 October 2026)

Supersede inline setting explanations with border-free 40-pixel info icons and separate accessible information pop-ups. Hover/focus/open color and pointer cursor identify the action; the dialog supplies a named description, its own scroll area, close icon, Escape/backdrop dismissal and focus restoration without shifting other components. Nested help from Add download must dismiss without cancelling the download form.

Simplify Add download by removing its advanced settings button and advanced controls; prepared jobs capture the saved Settings defaults and retain them through retry. Keep basic resolution/output-profile options and their info pop-ups. Fix Help close as an accessible square icon, provide horizontal padding on the Settings advanced action, reserve search-clear space and fixed search height, and rename sidebar entries to Instagram and X (F.K.A. Twitter). Acceptance checks keyboard/modal isolation, unchanged card/search/input geometry, hover styles, accessibility and three-width visual layouts, followed by isolated packaged Windows acceptance.

## Licensing and release acceptance preparation (7 October 2026)

Original SavedDesk code now uses root MIT `LICENSE`, with package metadata aligned at 0.2.1. Verbatim dependency notices and exact source archives are collected; unresolved source correspondence and upstream license-combination findings remain explicit. Installer packaging includes license resources and installation-owned connector cleanup, preserving user media/catalogs. Pinned signing, hash-bound release gates and guarded disposable Windows guest acceptance are prepared. Actual clean-machine installation, public-trust signing and the current live-provider matrix remain unverified because no VM or signing identity is available. See [precise setup and review findings](release-readiness.md). Existing build/test/hash records above describe their recorded versions and must not be relabeled as 0.2.1 acceptance.

## Owner-authorized Windows installer acceptance (7 October 2026)

Current source is 0.2.2. All five missing standalone notices are supplied with documented provenance; seven runtime dependency source archives and matching DLL records expand release evidence. Installer terms retain the CPython Windows conditions. A guarded isolated-profile install/upgrade/uninstall lifecycle passed on the owner's existing Windows system and restored the original profile and shortcuts; this is explicitly not clean-machine acceptance. Source/license review, trusted signing identity provisioning and current live-provider acceptance remain open. See [executed artifact evidence](development-artifact.md) and [release readiness](release-readiness.md). Older artifact sections retain their historical version and results.


## Live release acceptance update (8 October 2026)

The 0.2.3 installer passed the owner-authorized existing-host lifecycle and all seven supplied real-provider single-link cases. The Instagram reels alias was fixed. Playback, progress, duplicates and confirmed disposable deletion are verified; no pristine Windows or full collection/private-content matrix is claimed. Licensing clarification and trusted signing still block public binaries. [Evidence and limitations](live-platform-acceptance.md).
