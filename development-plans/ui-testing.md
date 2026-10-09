# SavedDesk interface testing

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** This retains UI testing history. The README documents current controls/Settings; this documentation/cleanup pass does not claim a fresh live visual audit or alter runtime code.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

**Current architecture - 0.2.10:** gallery-dl and FFmpeg are external user-installed tools, excluded from the new installer. See [licensing and setup](licensing-and-external-tools.md). Older bundled-tool, no-Python and unresolved-source statements below describe their recorded earlier builds; they do not apply to the new payload or clear old installers.

Recorded on 5 October 2026. README remains at the project root; all supporting Markdown remains in `development-plans/`.

## Reproduced problems and repairs

| Problem | Reproduction and cause | Repair |
| --- | --- | --- |
| Library jumps to the top during downloads | Scroll a populated library while the job snapshot polls. Every refresh increased the library revision, and every query reset scroll position. | Content changes invalidate the library; unchanged snapshots do not. Scroll state stays in a dedicated viewport and is reset only for query/filter/navigation changes. |
| Portrait thumbnails overlap neighboring rows | A 24 x 240 preview rendered at 52 x 520 inside an 88-pixel row. Implicit CSS grid tracks honored the image intrinsic minimum; the hover background hid part of the overflow. Earlier one-pixel square fixtures missed this case. | Use zero-minimum fixed thumbnail grid tracks, zero image minimum dimensions and clipped tile overflow. Actual images remain 52 x 56; hover no longer changes containment. |
| Thumbnail flicker and excess work | Each poll cleared the thumbnail map and restarted visible-image queries; pixel scrolling rerendered the entire application. | Retain up to 64 scoped previews, debounce missing-preview requests, allow one batch at a time, and render at most 18 rows. Scroll updates use animation frames and change state only when crossing a row boundary. Missing/unavailable files do not trigger preview generation. |
| Startup stalls behind folder repair | Hold the repair operation pending. The initial snapshot used to wait for repair completion. | Render the initial snapshot first. Run best-effort folder repair separately and invalidate availability/cache after successful relinking. |
| Screen opens halfway down | Scroll the main panel, then navigate to Settings. The previous main scroll position carried into the new screen. | Reset main scroll on navigation; hidden library screens stop querying and scheduling previews. |
| Rapid settings changes undo another choice | With delayed saves, select 720p and then Compatible MP4. Both requests merged the old snapshot, so the second write reset quality. | Show the latest selections immediately, merge subsequent changes into the current draft, serialize writes and protect that draft from stale polling responses. |
| Dialogs stack and compact navigation loses names | Open media and press Ctrl+N; two modal dialogs opened. At 760 pixels, hidden sidebar text removed the accessible names of Accounts and Settings. | Ignore global application shortcuts while a dialog is open and label every navigation button explicitly. Busy download fields cannot be edited during preparation. |

Cached date formatters replace repeated construction during row/history rendering. Long collection/creator labels are constrained, and narrow job controls wrap without horizontal overflow. Typing in the global search from another screen now opens the library. Native selected-folder containment and media validation were not relaxed.

## Validation

TypeScript and the Next.js static export pass. Twelve browser checks pass: four existing workflows and eight UI regressions covering unchanged/changing progress, preserved scroll and previews, slow repair, hidden work, modal shortcuts/focus, delayed settings writes, populated compact layouts, search/filter transitions, and formatter/row bounds. Tests supply an in-memory native bridge with 100 synthetic posts; they do not access owner sessions, cookies, catalog or media. Screenshots cover populated Library, Downloads, Accounts and Settings at 760 x 520.

The rebuilt Windows media acceptance scenario passes for actual WebView2 image display/zoom, video playback/seeking, range serving, thumbnail regeneration, relocation, folder isolation, and populated scrolling/search with changing job progress. The debug executable was updated in place. Its result is recorded in [implementation progress](implementation-progress.md).

These checks establish the reproduced behaviors on this development machine. They do not establish p95 latency, weak-hardware performance, every codec, every accessibility path, mixed-DPI behavior or every possible interface defect. Those remain release acceptance work. The earlier synthetic X account-fixture failure is outside this interface change.

## Run the checks

Commands start in the `saved-desk` root:

```powershell
npm.cmd --prefix desktop run typecheck
npm.cmd --prefix desktop run build
npm.cmd --prefix desktop run test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/build-desktop.ps1 -Prototype
npm.cmd --prefix desktop run test:native:media
```

Close the normal app when idle before native builds/tests; the application is single-instance and Windows locks its executable. The packaged scenario owns its isolated catalog, media and WebView profile, then stops only its own process tree. No browser platform account is connected by these checks.


## Plan 02 usability batch, 5 October 2026

The suite now has 15 passing browser checks. Three new cases cover user-requested setup results/recovery actions at populated minimum size, a folder change during a held setup check, and keyboard media navigation/zoom with ID-only source opening. The final Windows media fixture passes actual setup/worker/tool checks and video K/M controls alongside the prior playback/storage/UI acceptance. The packaged engine/account fixture also passes in this batch; earlier failures remain historical observations rather than current pass/fail evidence. See the [current evidence ledger](implementation-progress.md) and [usage guide](media-and-storage.md). Weak-hardware, mixed-DPI, complete accessibility and live provider matrices remain open.


## Portrait-thumbnail overlap repair, 5 October 2026

The reported hover-dependent overlap was reproduced before editing CSS. The failing regression measured portrait images at 520 pixels high within 88-pixel virtual rows, and a screenshot shows the spill across neighboring items. Fixed grid tracks and image minimum dimensions now keep portrait and wide previews inside their 52 x 56 tile; clipping guards the rounded tile boundary without changing the full-size viewer.

Static export/TypeScript and all **16 browser checks pass**. The new test checks decoded portrait/wide image bounds before/after hover, after virtual scrolling, and at 760 x 520. The Windows fixture now generates a 320 x 1600 JPEG and validates its real portrait preview before/after hover; packaged WebView2 media/storage acceptance passes, including playback, regenerated previews and relocation. Before/after synthetic screenshots are `.cache/thumbnail-overlap-before.png` and `.cache/thumbnail-overlap-after.png`. Real native evidence is `.cache/native-media/2be4a2de-91e1-4aeb-a37d-3820fae493a2/portrait-thumbnails.png`. No owner media, accounts or catalog were used. The rebuilt debug executable contains the fix; no cache clearing or downloads are required.


## Fullscreen mouse controls, 5 October 2026

Previous/Next were outside the fullscreen stage and therefore unavailable to the mouse. The earlier implementation retained an always-visible toolbar with Previous, Next, Cancel fullscreen and the file counter/name while changing media. It reserves space rather than covering native playback controls. In that earlier implementation, the video-only fullscreen control was suppressed so fullscreen uses the stage containing the post controls; fullscreen events move focus and restore it on exit.

Static export/TypeScript and **18 browser checks pass**. New cases exercise actual fullscreen entry, mouse navigation and endpoint disabling, mouse exit while keeping the dialog open, restored focus, Escape, and missing-file viewer cancellation. The Windows fixture temporarily associates an owned JPEG/MP4 pair with one synthetic post, then restores its identities; actual mixed-file navigation, playback shutdown and fullscreen/cancel behavior pass alongside the existing media/storage/UI checks. Native screenshots are under `.cache/native-media/2829be6d-aa2d-4f0e-aa70-cb13f6de44c4/`. No owner data or platform requests were used. [Usage](media-and-storage.md) and the [artifact record](implementation-progress.md) describe the rebuilt app.


## Screen-edge viewer and accessibility/usability correction (5 October 2026)

The fullscreen toolbar was replaced by left/right screen-edge arrows and a top-right image exit. Video fullscreen/exit lives in the in-player seeking/control bar, with no duplicate corner button. The player uses native HTML video decoding and small React controls; WebView2's native video-only fullscreen route was reproduced hiding navigation and rejecting a later frame request. The final control bar targets the shared frame from the user gesture and adds labeled seek/volume, speed and 10-second skips.

The audit also delivered complete-page virtualized keyboard browsing, contextual button descriptions and list position/count semantics, whole-row opening, explicit navigation-heading focus, search/filter recovery, help/modal focus, missing-file Settings recovery and persistent interface zoom. At 380 x 260 CSS pixels, a later shared containment rule restored the hidden collection column and pushed the row button into an implicit second grid row. Restoring the compact visibility rule fixes the overlap; the regression asserts every mounted button stays inside its row before opening a post.

**TypeScript/static export and all 28 browser checks pass.** Axe scans six screens and media/help dialogs at 1366 x 768, 760 x 520, 640 x 520 and 380 x 260, using WCAG A/AA tags through 2.2, without disabled rules. The 32 scan results have no automated violations; reports retain incomplete items for manual review. These scans do not certify accessibility. Interaction checks exercise actual screen-edge geometry, 48-pixel buttons, keyboard/window transitions beyond 18 rows, focus restoration, clickable captions, reset actions, saved zoom, missing-file recovery and modal isolation. The forced-colors/reduced-motion fixture checks help visibility; a complete assistive-technology/high-contrast matrix remains required. [Findings, references and limits](accessibility-and-usability.md) give the user-task audit.

Final packaged Windows acceptance also passes fullscreen Tab scope, actual seeking-bar entry/exit, playback-speed/volume/seeking, 200% zoom and saved preference restoration, bounded keyboard browsing and the prior media/storage checks. The real video-player axe scan has zero automated violations. Evidence: `.cache/native-media/7b5ad87a-3e51-464b-8f0a-d49d37d65288/`; final debug checksum/build details are in [implementation progress](implementation-progress.md). Python/connector/native-source baselines were unchanged and not rerun for this interface batch.


## Fullscreen overlay polish (5 October 2026)

**Fullscreen video overlay polish (5 October 2026):** removed the visible filename/count tag from fullscreen content while retaining nonvisual selection announcements. Video uses the full frame with aspect-preserving containment. A translucent single-row overlay places the seeking slider beside all playback buttons, volume, speed and time; it reserves no video height. Controls hide after three seconds of inactivity while paused or playing and return on mouse movement. Keyboard navigation reveals controls and pins them while focused; active slider gestures and the speed menu keep controls available. Inline controls remain visible and compact rows scroll horizontally.

Verification: Next.js export/TypeScript, **28 UI checks** (including four-width automated accessibility scans), and isolated real Windows JPEG/MP4 media acceptance pass. New native checks confirm full video geometry before/after hiding, one-row control alignment/transparency, paused/playing idle timing, mouse reveal, keyboard focus retention and absent fullscreen tags. Existing same-post navigation, playback shutdown, exit/focus, zoom, range streaming, relocation and selected-root isolation checks also pass. Evidence: `.cache/native-media/e6340f13-8597-4ba0-81ab-d6f74152e0d9/`, including paused/playing hidden-controls screenshots and the visible-overlay screenshot. Owner accounts, catalog and media were not used. Manual assistive-technology, mixed-DPI, codec and weak-hardware matrices remain release work.

Updated debug executable: **17,607,168 bytes**, SHA-256 `31d00bad9893919527c3605e849c7693ce570d38095ecaa79d0f5b7d5435dc53`. Build log: `.cache/fullscreen-overlay-native-build.log`. The prior unsigned installer was not regenerated. Backend/connector/Rust-source suites were not rerun for this frontend-only change.



## Video mouse/keyboard input repair (5 October 2026)

**Video mouse/keyboard input repair (5 October 2026):** right-clicking the video surface now toggles play/pause and suppresses its browser context menu. Playback keys clear the video's full-frame focus outline; deliberate Tab navigation and control-button/slider focus retain visible cues. Holding Space triggers one toggle instead of repeated play/pause. The three-second overlay hiding and maximum uncropped fullscreen sizing remain intact.

The right-click failure was reproduced against the previous executable before the change. TypeScript/static export, all **28 UI checks**, and isolated real Windows media acceptance pass. Native regressions verify right-click toggling and context-menu cancellation, Space playback without a border in both inline and fullscreen modes, repeat protection, retained Tab focus, and existing overlay/exit/navigation/storage safeguards. Evidence: `.cache/native-media/6c8a3e4a-3f46-4d73-83ca-d0ff928c3328/`. Test-event observation and mute-state reset were corrected during fixture validation; no owner account, catalog or media was used.

Debug executable: **17,607,680 bytes**, SHA-256 `0bfff5255da5c08a3f6041be95344665281eb3932eed3ca4232eeb039ca9dc71`; build log `.cache/video-input-native-build.log`. The unsigned installer was not regenerated. This frontend-only batch did not rerun backend/connector/Rust-source tests, and broader release acceptance remains open.



## Layout, custom scrolling and video compatibility (6 October 2026)

**Layout, custom scrolling and video compatibility (6 October 2026):** removed the library's row-wide restored-focus border and the search input's inner outline while retaining keyboard cues. Rounded panels now pad helper/filter text, header actions are grouped with an 8-pixel gap, and the bottom activity bar/Ready when you are indicator are removed. Low-resource status is in the sidebar. Sidebar pin/collapse persists locally; hover or keyboard focus opens a collapsed sidebar temporarily. Short width transitions respect reduced motion, including in low-resource mode.

App-owned horizontal/vertical rails replace OS scrollbars in page, sidebar/collections, virtualized library, dialogs, image/text viewers and video control/error areas. Thumb dragging, track clicks and keyboard arrows/Page/Home/End work with native wheel/touch scrolling. Resize/content/scroll measurements are frame-batched, with no constant polling or third-party scrolling runtime. The 18-row bound and thumbnail cache remain intact. Rapid virtualized Tab transitions were fixed by committing the next bounded row window before moving focus.

The reported `3981280655153515185.mp4` is a valid VP9/HE-AAC MP4 with unusual color metadata; FFmpeg decoded it, while the isolated WebView2 original produced zero video dimensions/decoded frames. A separate H.264/AAC playback copy rendered visible frames at **1080 x 1920** and passed real in-app playback/seeking. The original checksum was unchanged and repeat opening reused the cache. This identifies a file/decoder-path compatibility problem; VP9 is supported by Edge generally. Inspection/preparation occurs only for the selected local video, serially with preview/download work. Short preview work is awaited without blocking the UI; active downloads require finishing/pausing for a new compatibility copy. Copies stay in `.playback` within the selected root; the ID-only protocol rechecks the original and root on every request, and repair ignores cache files. No download identity/history/schema changes were made. A manual Use compatible playback action and disposed-request guard cover silent blank videos and file changes during preparation.

Verification: **91 Python tests**, **31 native tests (24 app + 7 host)**, TypeScript/static export and **33 UI tests pass**, including 32 four-width axe scans with zero automated violations, custom rail drag/keyboard operations, sidebar hover/pinning persistence, focus/spacing checks, compatible-route encoding, stale-selection protection and fullscreen error geometry. Real Windows media/storage acceptance also passes fullscreen full-frame sizing, paused/playing overlay hiding, right-click/Space behavior, navigation/exit/focus, zoom, range streaming, relocation, preview regeneration and selected-root isolation. A late CSS collision made the fullscreen error wrapper participate in flex layout and shrink the video; its corrected absolute positioning is covered by a new regression. Native evidence: `.cache/native-media/8272d2df-cad4-40a2-b0d3-46464ff4f35f/`; exact-video metadata: `.cache/native-reported-video/1da80a65-776e-44cb-874c-8f06afe25eb5/acceptance.json`. Exact-video tests used an isolated catalog/profile and removed their media copies afterward; owner accounts/catalog/original were not changed. Manual assistive-technology, weak-hardware/p95, full DPI/codec/HDR matrices and playback cache quotas/cleanup remain release work.

The packaged worker and debug executable were rebuilt. Executable: **17,663,488 bytes**, SHA-256 `36b640791c28b50454af960d96bf6eaaf1beffb936bc93ed2678e6ad92e758c2`. Logs: `.cache/layout-playback-native-build-final.log`, `.cache/layout-playback-rust-tests-final.log`, `.cache/layout-playback-python-tests-final.log` and `.cache/layout-playback-worker-build.log`. The older unsigned installer was not regenerated; the connector code was unchanged and its prior ten-test baseline was not rerun for this batch.



## Settings, Accounts and fast video opening (6 October 2026)

**Settings, Accounts and fast playback follow-up (6 October 2026):** consistent card padding, paragraph spacing and responsive action rows replace scattered margins. Setup browser/check controls and folder selection/relink controls share rows when space allows. Video actions are grouped, interface-size help has its own reading area, low-resource mode has an adjacent checkbox, and privacy/test actions sit beside their descriptions. Accounts separates browser guidance, connector instructions, account status/actions and privacy guidance. The brand bookmark now controls sidebar pin/collapse; Collections navigation and the Downloads badge are removed. At compact widths the sidebar temporarily expands rather than squeezing the page; the saved wider-window pin preference remains intact.

Ordinary AVC/H.264 MP4s take a bounded Rust metadata fast path before the download/previews worker gate. This skips compressed frame payloads, caps movie metadata at 4 MiB and bounds box counts. Unknown/malformed/other-codec metadata retains the existing original-preserving preparation path, and Use compatible playback can force a copy. Existing valid scoped copies still take precedence. The loading message appears only after 150 ms and describes copy preparation rather than treating conversion as a millisecond check.

Verification: TypeScript/static export, **34 native tests (27 app + 7 host)** and **35 UI tests pass**, including the existing 32 four-width axe scans with zero automated violations. New layout tests cover aligned controls, insets, compact resizing and discoverable browser setup. Real final-build Windows media/storage acceptance passes playback/seek, fullscreen sizing/controls, keyboard and mouse input, zoom/persistence, relocation, range serving and selected-root containment. Ten uncached H.264 checks with an active download job took **28.2 ms first-use, 12.0 ms median, 28.2 ms maximum** including renderer/native IPC on this development PC. This is a small local sample, not weak-hardware or p95 certification. Evidence: `.cache/native-media/0d15d436-d068-47b2-ae61-4a8c81c3d0e7/playback-timing.json` and `.cache/settings-organisation-native-media-final.log`.

The previously reported Instagram video also passes final-build full-resolution playback/seeking and cached reuse, with its original checksum unchanged. Its isolated first-copy conversion took 22.0 seconds; the cached check took 20.7 ms. This measures conversion separately from ordinary-video metadata checks. Exact-video evidence: `.cache/native-reported-video/90921cde-35e9-4603-a47c-56b3015f24ae/acceptance.json`; the fixture used an isolated catalog/profile and removed its media copies afterward.

Debug executable: **17,684,992 bytes**, SHA-256 `83c9f8dfb698fa28f03852bb00cc10fc07147993d70f4ab2be113f0a182f62fd`. Build/test logs: `.cache/settings-organisation-native-build-final.log`, `.cache/settings-organisation-rust-check.log`, `.cache/settings-organisation-ui-tests-final.log`. The worker/backend/connector implementation is unchanged; the previous 91-Python/10-connector test baselines were not rerun. The older unsigned installer remains unchanged.


## Stable sidebar hover and cached playback (6 October 2026)

**Stable sidebar hover and cached playback decisions (6 October 2026):** reproduced a six-pixel collapsed brand-icon offset. Sidebar contents now keep a fixed 240-pixel internal layout while the clipping surface animates between 72 and 240 pixels. Icons and vertical navigation positions remain stationary; labels fade without display/position/padding switches. A 140 ms leave grace avoids flicker when crossing the boundary briefly. The brand button is centered on the compact rail. Sidebar scrolling is explicitly vertical-only, so a transient horizontal rail is never created. Rounded navigation backgrounds animate independently of the real hit areas, and keyboard focus/vertical scrolling/reduced-motion preferences remain supported.

Playback validation now resolves the selected root/original once per decision instead of repeating catalog and canonical-path checks. A bounded 128-entry, five-minute in-memory codec cache uses canonical path, byte count, modification time and creation time. Current folder containment and original-file availability are checked before cache reuse; the cache stores decisions rather than authorization or media bytes. Changed fingerprints and expiry trigger fresh inspection. The initial available video's original/cached decision is attached to post_files, removing a second renderer/native command for ordinary H.264 or a valid prepared copy. Only that initial file is inspected, not every video in the post/library. Other selections retain the native check, and manual compatible playback still reaches preparation.

Verification: TypeScript/static export, **36 native tests (29 app + 7 host)** and **38 UI tests pass**, including 32 four-width axe scans with zero automated violations. Animation-frame sampling verifies intermediate widths, stationary icons, a centered mark and no bottom rail; brief leave/reentry and reduced motion are covered. Initial original/cached playback tests assert zero preparation calls until manually requested. Cache invalidation, expiry/capacity and current-root media safeguards pass. A late rounded hit-area experiment blocked compact clicks; final backgrounds use pseudo-elements while preserving the real button hit areas, and the full suite passes after the correction.

Real final-build Windows acceptance covers repeated hover, centered/stationary icons, no horizontal rail, initial video viewing with **zero extra compatibility calls**, actual playback/seek/fullscreen/input/zoom, relocated media, regenerated previews and selected-folder isolation. Measurements inside WebView2 exclude automation transport: **24.6 ms first-use, 7.3 ms median and 24.6 ms maximum** across ten standalone decisions with an active download job; a warmed file list including its playback decision took **7.2 ms**. The artifact also records separate automation-inclusive timings. Earlier 28.2/12.0 ms figures included automation transport and are not a directly comparable speedup ratio. This is a local development-PC sample rather than weak-hardware/p95 certification. First-time conversion still takes longer and preserves the original. Evidence: `.cache/native-media/56d1cdbd-a2ea-4468-816c-5296a8ac5a64/playback-timing.json`, `.cache/sidebar-fast-playback-native-media-final.log` and `.cache/sidebar-fast-playback-ui-tests-final.log`.

The reported Instagram-video playback/cache regression also passed with unchanged original checksum during this batch, before the final sidebar-only paint correction; playback code did not change afterward. Exact-video evidence: `.cache/native-reported-video/35d8cd0d-2e09-4a46-b80b-8f70a70588e7/acceptance.json`. Its isolated media copies were removed. Backend/connector implementations remain unchanged and their previous 91-Python/10-connector baselines were not rerun.

Debug executable: **17,707,008 bytes**, SHA-256 `7e87cb79108c58d46af46aa55b5f9eb0bfbacd20b54e05935821bf52d333249b`. Build/native-test logs: `.cache/sidebar-fast-playback-native-build-final.log` and `.cache/sidebar-fast-playback-rust-tests.log`. The older unsigned installer is unchanged.


## Mouse playback and fullscreen transition follow-up (6 October 2026)

**Reliable mouse playback and fullscreen transitions (6 October 2026):** live testing of the previous Windows build confirmed that right-click worked on the video element but not the control-bar background. The action now runs once on right-button release across the player background, including letterboxing, while buttons, sliders, menus and custom scroll rails retain their own behavior. Context-menu events only suppress the browser menu and cannot toggle twice. Interrupted play requests are not reported as codec failures.

Live animation-frame traces also showed fullscreen jumping through several native viewport sizes with no media animation. The viewer now reserves its inline space, restores focus without scrolling, commits fullscreen control state together, and animates the same image/video with a 200 ms uniform transform. Resize events retarget the ongoing transition within its remaining duration. Playback source, decoder, time and play/pause state survive the switch. Reduced-motion preferences disable the animation, including when changed during a transition. This does not start a worker, preload other posts or run a layout loop each animation frame.

Verification: TypeScript/static export and final TypeScript checking pass. The final UI suite contains **40 checks**, including the existing 32 four-width accessibility scans. Final isolated WebView2 acceptance verifies four mouse surfaces, animated image/video entry and exit, uninterrupted playing-video transitions, three rapid keyboard fullscreen cycles, reduced motion and no renderer errors. The broader Windows media/storage acceptance also passes, including Space/Tab focus, mixed-file navigation, three-second controls, seeking, sidebar/scrolling/zoom and selected-folder isolation. Evidence: `.cache/playback-transitions-before.log`, `.cache/playback-transitions-after-final.log`, `.cache/native-transitions/daaf843a-1e78-4a9f-ae83-f80c9be1c6fa/transitions.json`, `.cache/playback-transitions-native-media.log`, `.cache/native-media/c1b1d913-83fc-4e7a-84ce-3b5ce47b1834/`, and `.cache/playback-transitions-ui-tests-final.log`. Tests use private app data and owned media fixtures, without account requests or owner-catalog changes.

The media animation duration excludes WebView2/Windows fullscreen-switch overhead. Local frame traces demonstrate interpolation and stable scroll, not certification of every GPU, monitor or weak-hardware frame rate. Native/backend/connector implementations are unchanged; their previous 36/91/10 unit-test baselines were not rerun. The older installer remains unchanged.

The input fixture checks background toggles once, interactive-control exclusions, keyboard context-menu suppression, Space and middle-click behavior. Browser middle-click autoscroll consumes subsequent keys; the fixture verifies Space before entering that native mode. Fullscreen assertions distinguish transient transformed geometry from final full-frame geometry. Native traces sample the actual renderer; the final six entry/exit cases include 10-13 animated frames each, settle with no animation and preserve dialog scroll. Screen-reader and wider Windows/GPU acceptance remain manual release work.


## Left-click playback and stable fullscreen backdrop (6 October 2026)

**Left-click playback and stable fullscreen backdrop (6 October 2026):** playback follows the clarified interaction: left-click the video, letterboxing or player background to play/pause. Child buttons, sliders, selectors and custom rails retain their own actions; right-click does not toggle playback. Space/K and accessible play/pause buttons remain available.

Live Windows traces reproduced the remaining background instability: the dialog changed through heights of 636, 671 and 688 pixels, while its inline viewer changed through 367.4, 386.7 and 396 pixels during native fullscreen resize steps. The viewer now holds the dialog rectangle, scroll viewport and inline slot through the fullscreen session and until exit resizing settles. Its existing backdrop fades between the normal dimming level and opaque black; the fullscreen backdrop matches the media background. Media transforms, the same decoder/source and non-scrolling focus restoration remain intact. Reduced motion disables media/backdrop animation while retaining layout stability. Rejected fullscreen requests release the layout and backdrop state.

TypeScript/static export, final typechecking and **42 UI checks pass**, including four-width accessibility scans, viewport-change invariants and rejected-fullscreen cleanup. Final isolated Windows transition tests verify four left-click surfaces, inert right-click, paused/playing image/video transitions, uninterrupted playback, rapid switches and reduced motion. Across all six entry/exit cases, dialog height stays at **636 pixels** and the inline slot at **367.3984375 pixels**; measured backdrop opacity changes gradually between 187/255 and 1. Renderer errors are empty. Evidence: `.cache/left-click-backdrop-before.log`, `.cache/native-transitions/0e22289c-a0bf-40f8-b195-3b0b8675e521/transitions.json`, `.cache/left-click-backdrop-native-transitions.log`, `.cache/native-transitions/4a599399-535b-42ab-876b-1491de5481a6/transitions.json`, `.cache/left-click-backdrop-ui-tests.log` and `.cache/left-click-backdrop-native-media-complete.log`.

The final broader Windows media/storage acceptance passes: actual playback/seeking, fullscreen controls and mixed-file navigation, three-second idle hiding, Space/Tab focus, sidebar/custom scrolling/zoom, moved-file repair and selected-folder isolation. Its fixture is `.cache/native-media/b6d4286f-006c-4c5f-a927-06eb9e1b7c8a/`. Tests use isolated app data/profile and generated owned media; account sessions and owner downloads are untouched. These local paint/geometry/interaction checks do not certify every GPU, display configuration or hardware frame rate. Native/backend/connector implementations remain unchanged, with their previous 36/91/10 unit-test baselines not rerun. The older installer remains unchanged.

The broader media fixture initially exceeded its five-second setup-result assertion while still showing Checking setup. Its result wait now matches the existing 45-second worker-startup allowance; the final rerun is recorded separately. The playback/fullscreen implementation does not change worker startup.

The final broader media rerun also replaces two remaining old right-click fullscreen assertions with left-click. This matches the corrected interaction; the final complete acceptance passes without further application changes.


## Public platform expansion (6 October 2026)

All 45 UI checks pass against the final export. New checks cover nine platform choices, public submission without fabricated account connections, explicit Spotify details-only controls, YouTube collection duplicate choices, the Library platform filter and clear action, and accessibility/containment of all seven new forms at 380 pixels. Existing fullscreen, left-click playback, sidebar animation, custom scrolling, settings/account layout, focus, scaling and 32 four-width accessibility scans remain in the suite. Evidence: `.cache/platforms-ui-tests.log`, `.cache/platforms-typecheck.log` and `.cache/platforms-frontend-build.log`. [Platform support](platform-support.md) records actual provider limits; these UI checks do not establish private-account/provider access.


## Deletion controls (6 October 2026)

The final export passes all 52 UI tests. New tests cover cancel without a deletion call, scoped download versus collection counts, successful post refresh, per-file deletion from a video viewer, cancel-first keyboard focus, completed viewer teardown, active-download rejection and stale-file errors. Library Tab navigation now includes the trash buttons; existing arrow/Home/End/Page navigation, row click regions, thumbnail containment, four-width accessibility, fullscreen and repeat behavior remain covered. Evidence: `.cache/deletion-ui.log`. Disk operations and video readiness are exercised separately through native/worker fixtures.


## Multi-post selection and provider setup (7 October 2026)

All 57 UI tests pass after adding checkboxes to the library's Tab sequence and separate Reddit/Discord prerequisite cards. New regressions cover Shift-click ranges, selected-only removal, cancel preserving selection, all 100 page IDs including virtualized rows, native Space/Ctrl+A/Delete/Escape behavior, download/stale-file rejection, search/platform resets and transitions between a 100-post page and a 50-post page. New provider setup actions are mocked only in browser tests; native unit tests reject arbitrary setup destinations. Four-width accessibility and containment checks remain included. Logs: `.cache/batch-delete-ui-final.log`; TypeScript/export: `.cache/batch-delete-typecheck.log`, `.cache/batch-delete-frontend-build-final.log`.

Real native acceptance independently tests physical storage and catalog changes using only generated posts/media in isolated app data. Its page selection/deletion calls use the actual Tauri commands; the owner catalog, browser sessions and downloads are never used. See the [progress ledger](implementation-progress.md) for final artifacts, fixtures and the focused accessibility rerun after the checkbox palette correction.

## Direct Discord media and removed platform controls (7 October 2026)

All **58 UI tests** pass against the final static export (`.cache/discord-media-ui.log`). Discord's Accounts shortcut opens the attachment form with the correct source; the form accepts full signed audio URLs, starts without account setup and preserves duplicate confirmation for renewed signatures. Spotify is absent from all download forms/source selectors. All remaining public forms retain narrow-width accessibility checks; Reddit approval guidance remains while Discord admin setup actions are removed. The Audio filter and icon integrate with the library without thumbnail polling for audio.

TypeScript/static build and 12 connector tests pass. Isolated real WebView2 acceptance verifies audio/video advancing playback, MOV-to-MP4-only storage, source filtering, no account headers and no provider account APIs; `.cache/native-discord-media/82465214-0d25-4bc8-970c-4373642b88fe/acceptance.json` records the result. Native/HTTP fixtures verify app behavior, not every live provider link. Earlier sections describe historical interfaces/builds and are superseded where Spotify/setup scope changed.


## Shared control and spacing audit (7 October 2026)

Added three complete visual control audits at 1366, 760 and 380 pixels. Each navigates Library, all seven platform views, Downloads, Accounts and Settings, then audits Add download with every advanced explanation expanded, the image viewer, Help and deletion review. It measures every connected visible button's 40-pixel height, solid border and label containment; checks dropdown height, right text inset and custom arrow; asserts account order and at least 20 pixels between cards; and verifies privacy guidance precedes the cards. Page/main horizontal overflow is rejected. Screenshots and structured JSON attachments are generated in `desktop/test-results/`. Existing accessibility scans, fullscreen/video, input-state, switch/checkbox and keyboard tests remain active.

Visual inspection confirmed readable desktop/narrow layouts and consistent action rows. The audit found a borderless delete-button CSS override; the shared delete border now wins. Inline action margins and card-width wrapping improve text separation. Library selection is now a checkbox, Settings remains a switch, and sidebar tests verify no hover/focus expansion plus native state restoration. Older test expectations for oversized fullscreen buttons and a separate Discord wrapper were replaced with current geometry/semantics, without reducing their interaction or accessibility checks. The asynchronous volume-event assertion no longer dereferences an absent preference; five repeated volume tests pass.

Real packaged Windows settings/restart/playback and checkbox batch deletion acceptance pass using isolated catalogs and generated files. Windows evidence: `.cache/native-advanced-video/0bfc16f8-a9ea-458b-a40d-2a43715368ca/` and `.cache/native-batch-deletion/1bda634a-8df8-4d93-95f4-069fb8418ee7/`. The full manual accessibility and device/DPI/performance matrix remains a release requirement. [Implementation record](implementation-progress.md#shared-controls-account-layout-and-persistent-sidebar-7-october-2026).

Final delivery verification: **all 71 UI tests and 57 native tests pass (128 checks)**, plus TypeScript/static export and the embedded Windows build. The unchanged Python/connector suites retain their previous validated baseline and were not rerun for this UI/native-settings change. Final UI log: `.cache/visual-controls-ui-delivery.log`. Final real Windows media acceptance also passes sidebar clicks/centered icons, vertical scrolling, thumbnails, video playback/seek, screen-edge fullscreen controls, three-second idle hiding/reveal, image zoom, interface scaling, moved-file repair and selected-folder isolation. Evidence: `.cache/native-media/33c4777f-7178-4190-b545-e2f7cc1522cc/` and `.cache/visual-controls-native-media-delivery.log`. No owner data was used.



## Information pop-up and search geometry audit (7 October 2026)

The info helper opens every setting's named dialog, confirms focus on Close information and unchanged parent-field geometry, dismisses it and checks focus restoration. Narrow Add download coverage checks popup containment, automated accessibility and Escape closing only the popup. Three new 1366/760/380-pixel tests compare both search-field and input rectangles before typing, with the clear action visible, and after clearing; they also verify border-free color/pointer cues, advanced-action padding and square icon-only Help close. Existing screen/dialog visual and input-state audits remain active. Info icons are the explicit zero-border exception; all other action buttons keep their standard solid boundaries.

Packaged Windows acceptance passes all six popup geometry/focus checks, nested dialog dismissal, simplified downloads, search bounds, Help close, padding, renamed navigation, native settings/sidebars across process restart, captured job/retry options and real video playback. Evidence: `.cache/native-advanced-video/9835cb40-b4bc-4245-8bc8-c6b3bfa539cf/`. Only generated fixture data was used. TypeScript/static export and the native embedded build pass; logs use the `.cache/info-popup-` prefix. [Implementation record](implementation-progress.md#information-pop-ups-stable-search-and-simpler-download-form-7-october-2026).

Final validation: **all 74 UI tests pass**, including automated accessibility, every-screen/dialog layout audits and the new popup/search regressions. TypeScript/static export, final embedded build and isolated packaged Windows acceptance also pass. Logs: `.cache/info-popup-ui-delivery.log`, `.cache/info-popup-typecheck-final.log`, `.cache/info-popup-frontend.log`, `.cache/info-popup-prototype.log` and `.cache/info-popup-live-windows.log`. The first full run's only failure compared an invisible zero-width border's inherited color; the final audit checks actual border widths and visible border colors while allowing the requested info-icon hover/focus color cue.


## Repository and release preparation (7 October 2026)

The Add download top ornament is removed, with an absence assertion in the existing compact-dialog/info-popup regression. Release workflows run the UI suite against the static export before packaging. See [source audit and packaged release process](repository-and-releases.md).
