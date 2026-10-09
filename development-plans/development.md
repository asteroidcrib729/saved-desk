# SavedDesk development

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** The README is the installed-user guide; this file retains developer commands. Synthetic profiles/media can be regenerated from source after residual cleanup; reports/screenshots remain.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

**Current 0.2.10 scope:** Facebook/TikTok/Pinterest are public-link only; Pinterest OAuth is cancelled. Google lifecycle acceptance is controlled per owner choice, with the live grant preserved. YouTube account playlists still use separate browser approval. See [current verification](scope-and-lifecycle-0.2.10.md) and [publication scope](publication-scope-and-cleanup.md).

The 0.2.8 native Google identity implementation and owner prerequisites are documented in [account authentication setup](account-authentication-setup.md). Verified identity does not enable private YouTube media.

**Current architecture - 0.2.10:** gallery-dl and FFmpeg are external user-installed tools, excluded from the new installer. See [licensing and setup](licensing-and-external-tools.md). Older bundled-tool, no-Python and unresolved-source statements below describe their recorded earlier builds; they do not apply to the new payload or clear old installers.

This is the SavedDesk 0.2 functional desktop milestone. The frontend is a Next.js static export; Rust owns SQLite, account/session storage, queue policy, file access and per-item transfer decisions. Packaged Python runs on demand through bounded JSON Lines, with private session commands/results kept out of React. The real engine adapter and explicit browser connections are enabled; [current verification and planned work](implementation-progress.md) distinguish implementation from platform/hardware acceptance.

## Browser preview

```powershell
# From the project root:
Set-Location desktop
npm.cmd ci --cache ../.cache/npm
npm.cmd run build
npm.cmd run preview
```

Open `http://127.0.0.1:4173`. Try sample collection adds three synthetic records in this tab only. Settings -> Run local test job exercises confirmation; Download new items reuses records, and Download everything again produces another job. Reload clears preview state. The preview never writes media or opens browser profiles.

## Native Windows development app

Prerequisites: Node.js, Rust with the x64 MSVC target, Microsoft C++ Build Tools with Desktop development with C++ and a Windows SDK, build-time Python, and WebView2. The script recognizes project-local Rust under ignored `.tooling/` and configures it for that process. [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

The existing `.venv` is used for development. On another checkout, create a virtual environment first with `python -m venv .venv`. Core app features use the packaged worker. Gallery downloads and Instagram/X connection require a separately selected Python environment; see the current setup link above.

```powershell
# From the project root, after installing npm dependencies:
.\.venv\Scripts\python.exe -m pip install --no-build-isolation -e "backend[development]" -r packaging/requirements-lock.txt
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/build-worker.ps1
Set-Location desktop
npm.cmd run icons
Set-Location ..
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/build-desktop.ps1 -Dev
```

The execution-policy argument allows these inspected project scripts in that PowerShell process; it does not change machine/user policy. The build script requires completed C++ tools and does not install them or reboot automatically. Ordinary development can fall back to the project virtual environment; packaged prototypes and release builds use their adjacent worker package.

For an app that embeds the frontend, build the frontend (`npm.cmd run build` in `desktop`) and worker as above, then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/build-desktop.ps1 -Prototype
.\desktop\src-tauri\target\debug\saveddesk.exe
```

Keep adjacent `worker/`, `browser-connector/` and `saveddesk-native-host.exe` with the executable. It embeds the export and runs without a Next.js server; gallery features use separately installed Python. The `-Prototype` switch selects a debug build with embedded frontend assets; it now includes live functionality. Test origin/data/profile/pipe overrides exist only in debug Rust builds. Production Rust commands do not accept those overrides from the renderer.

Connect through **Accounts**, then use **Add download**. Regular Firefox profiles use the native scoped provider; Chromium browsers use the permissioned companion connector. See [connection instructions](account-connection.md). Store-approved installation is outstanding; the unpacked/temporary connector is the current development path. Never put credentials in tests, commands, issue reports or CI.

Build a per-user NSIS installer with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/build-desktop.ps1
```

Successful builds produce the installer under `desktop/src-tauri/target/release/bundle/nsis/`. Signing, publishing, and update hosting are not configured; production delivery gates remain outstanding.

The 0.2 x64 development installer has been built locally. See [artifact details and checksum](development-artifact.md). It is unsigned and has not undergone clean-machine installation/upgrade/uninstall acceptance.

## Checks

```powershell
$env:PYTHONPATH = Join-Path (Get-Location).Path 'backend/src'
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
Set-Location desktop
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test
npm.cmd run test:connector
Set-Location ..
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/build-desktop.ps1 -Check
Set-Location desktop
npm.cmd run test:native
npm.cmd run test:native:live
# After explicitly setting up the Chrome connector in the app:
npm.cmd run test:native:chrome
```

Frontend tests use installed Microsoft Edge via Playwright and the static export. Both native scenarios connect to an owned WebView2 process with a temporary debugging port, isolated data/profile, and Python fallback disabled; each terminates only its own app tree. Run native tests sequentially after packaging/builds finish, because Windows locks running executables/resources. `test:native` covers the sample workflow; `test:native:live` covers private native-host approval, scoped Firefox reuse, loopback engine media, duplicates/repair, real video conversion/previews and X text posts. [Playwright WebView2 guidance](https://playwright.dev/docs/webview2).

`test:native:chrome` uses installed Google Chrome, an empty owned profile, the real native host and synthetic Instagram/X sessions. It checks web-account username/numeric-ID resolution and verifies that an HTTP failure after permission approval appears in both the extension and app. It requires the existing explicit Chrome host registration; it does not register anything or access personal profiles. Its test-only manifest pre-grants platform host permissions to avoid automating the native browser permission dialog; production permissions remain optional and approval/denial is tested separately. Run it sequentially after native builds/tests.

Worker tests use temporary directories, synthetic content/sessions and loopback servers. Build the worker before running the packaged-worker test. No automated check reads personal sessions or authenticates to a live platform. The native `-Check` script embeds a common-controls v6 manifest into owned test harnesses and executes those exact harnesses; this avoids a missing TaskDialogIndirect entry point without altering system DLLs or having a second Cargo invocation discard the manifest.

Rust tests cover catalog isolation, idempotent completion, multiple versions of one logical post, and bounded 50,000-post pagination. Component timings do not establish full-app memory/startup/rendering performance.

## Data and privileges

The app keeps the existing `prototype-catalog.db` filename under Windows Local App Data for `com.saveddesk.desktop` to preserve earlier history. Schema 2 migrates existing data and creates a consistent SQLite backup first. Synthetic jobs remain under `prototype-media/` with a distinct `fixture-account`. Real downloads use the configured destination (default Downloads/SavedDesk), a platform/mode subfolder and unique job directory; old copies are retained. Job settings are immutable snapshots. Protected sessions are app-owned `session-<platform>.dpapi` files, removed on Disconnect.

The frontend has no general filesystem, shell, credential or SQL permission. It subscribes to sanitized events, opens a folder picker and invokes validated native commands. File actions resolve catalog IDs and enforce recorded job-root containment and allowed media extensions; previews are bounded local JPEG data URLs. Workers use Windows Job Objects, bounded frames, host transfer decisions and catalog acknowledgements. No raw engine diagnostics or private browser-session events are relayed to React.

## Structure

- `desktop/src/components/`: library shell, account connection, download preparation, job history and saved-file UI.
- `desktop/src/lib/`: shared frontend contracts and typed native bridge; an honest sample-only browser preview.
- `desktop/src-tauri/src/`: catalog/migrations, live commands/scheduling, Windows pipe/DPAPI/registration, media access and owned worker transport.
- `backend/src/social_downloader/`: authentication, scoped Firefox provider, pinned engine adapter, video/previews, validated models and versioned worker protocol.
- `browser-connector/`: minimal permissioned popup, stable IDs, generated browser packages and approval-boundary tests.
- `packaging/`: pinned worker packaging, desktop build/check scripts and Windows test manifest.

Remaining implementation and validation requirements are recorded in the development plan and progress document. The synthetic path stays separate from the actual engine adapter and does not bypass duplicate/account checks.

## Local media and selected-folder acceptance

Run `npm.cmd --prefix desktop run test:native:media` after building the static frontend, worker, and prototype. It launches an isolated hidden WebView2 app with synthetic JPEG and a multi-chunk MP4, verifies display/zoom/playback/seek/range responses, moves the fixture library, regenerates missing previews, and checks direct outside-file and Windows-junction rejection plus unavailable-drive behavior. It never reads personal sessions. The fixture app must be the only running SavedDesk instance; close the owner app gracefully only when idle and reopen it after checks. Evidence belongs in implementation progress.

## Renaming or moving the checkout

The project directory is `saved-desk`. Build scripts, editor interpreter settings and test harnesses derive paths from the checkout. Activate the environment from the new location in a fresh terminal; an already activated terminal can retain the old `VIRTUAL_ENV` and `PATH`. Windows Python console launchers also embed their interpreter path, so recreate/reinstall the development environment after future moves. Install the maintained worker with `python -m pip install --no-build-isolation -e "backend[development]" -r packaging/requirements-lock.txt`; the obsolete root `requirements.txt` is no longer used.

Browser native-host registrations refer to an absolute executable path. After a future move, use the app's browser connector setup to register the host again, and reload any unpacked browser extension from the new `desktop/src-tauri/target/debug/browser-connector/chromium` directory. Existing app data and selected download folders are independent of the project root. README and the public Privacy Policy/Terms of Service stay at the project root; all other project Markdown is stored together in `development-plans/`; relative document links point to sibling files.

## Interface regression tests

`npm.cmd --prefix desktop run test` includes the original browser workflows and populated UI regressions with an in-memory native bridge. The scenarios reproduce active download polling, delayed settings writes, held folder repair, modal keyboard handling, long labels and compact screens without reading personal data. See [UI testing](ui-testing.md) for symptoms and validation limits. The native media scenario also checks populated scrolling/search under changing synthetic job progress in actual WebView2.


## Accessibility and player checks

`npm.cmd --prefix desktop run test` now runs 74 UI checks, including axe scans of six screens and media/help dialogs at four widths. No accessibility rule is disabled; incomplete findings remain manual-review work. The 380-pixel fixture models reflow at an enlarged minimum-size window, while the native media fixture verifies actual WebView2 zoom, saved preference restoration, in-player fullscreen/exit, labeled seek/volume, speed, and complete-page library keyboard browsing. See [findings and remaining acceptance](accessibility-and-usability.md). The scope remains Windows WebView2; these checks do not establish every codec, assistive technology, DPI or weak-hardware result.


## Public platforms and YouTube runtime packaging

[Platform support](platform-support.md) lists the new public workflows and provider limits. `npm.cmd --prefix desktop run test:native:platforms` exercises them against loopback fixtures using private app data and the actual packaged worker. It never discovers accounts or contacts platforms.

The worker requires `yt-dlp-ejs==0.8.0` in addition to the existing pinned engines; install with `python -m pip install -e backend`. `packaging/build-worker.ps1` copies the build environment's Node.js 22+ executable into `_internal/runtime/`, includes its license and records the bundled version/SHA-256. The verified artifact uses Node 24.21.0. You can provide explicit `-NodePath` and `-NodeLicensePath`; the license must correspond to that runtime version. The default license is fetched from Node's official source into a version-specific cache when absent; an explicitly supplied license must still match the runtime. End users need no separate Node.js installation; gallery features require Python in a selected environment; Node runs only for extraction, while the frontend remains a static export.

Discord signed URLs are separate DPAPI-protected job payloads, not plaintext history. Retry of an expired URL cannot refresh it without a fresh link. Facebook public access may fail due to provider restrictions. Reddit has been removed. Facebook now supports approved scoped browser sessions as described in [account setup](account-connection.md).


## Deletion and prepared playback checks

`npm.cmd --prefix desktop run test:native:deletion` launches the rebuilt debug executable with a unique fixture catalog/save folder/WebView2 profile and the packaged worker. It downloads loopback VP9 footage, verifies single-file compatible conversion before completion and actual native playback, measures native readiness reuse, then exercises confirmation/cancel, single-copy/job/collection deletion, no retained conversion originals, stale folder decisions and out-of-root/unrelated-file protection. It never opens owner accounts or downloads. Build the frontend, worker and native prototype before running this check.

The current baseline has 74 UI, 146 Python, 57 native and 12 connector checks; artifact-specific runs are recorded in the progress document. Native tests additionally cover locked-file rollback, catalog failure rollback, pre/post-commit recovery and moved original relinking. [Implementation progress](implementation-progress.md) records artifact-specific acceptance and limits.

## Advanced video settings acceptance

After building the frontend, worker and prototype, run `npm.cmd --prefix desktop run test:native:advanced-video`. This launches a separate Windows app with an isolated catalog, WebView profile and loopback VP9/Opus attachment server. It checks native settings restoration after process restart, draft capture before global changes, per-job overrides through failed retry, MP4-only H.264/AAC output, real playback, six separate information dialogs and keyboard switches. Only that harness's process tree is stopped. It does not read owner sessions or media. Evidence is written under `.cache/native-advanced-video/<unique-id>/`.

Schema version 5 adds validated conversion choices to download jobs. Older Settings JSON remains readable with defaults. The worker accepts only supported encoder/preset/CRF/audio bitrate values, never arbitrary encoder arguments. See [advanced setting effects](media-and-storage.md#advanced-video-settings-and-switches-7-october-2026).


## Control consistency and persistent sidebar acceptance

Run `npm.cmd --prefix desktop test -- --grep 'full visual'` for the three-width screen/dialog control audit, or `npm.cmd --prefix desktop test` for the complete UI suite. It checks 40-pixel bordered buttons, text containment, dropdown arrow padding, account order/gaps, top privacy guidance and horizontal containment at 1366/760/380 pixels. Screenshots and structured audit attachments are in `desktop/test-results/`.

The packaged `test:native:advanced-video` acceptance also checks 40-pixel bordered controls, account spacing/top guidance and the sidebar remaining collapsed on hover and process restart. Sidebar preference uses the existing Settings JSON with a backward-compatible default; it does not require a new catalog version. Content selection uses checkboxes and settings use switches. No hover/focus transition or Low-resource sidebar action remains.

## Source publication and release review

Follow [repository and release preparation](repository-and-releases.md) for the locked environment, Git candidate audit, source-only staging, version checks and `packaging/build-release.ps1`. The prepared GitHub draft workflow does not publish automatically. Public distribution requires the listed license/notices/source, signing and clean-machine gates. Generated artifacts are local paths rather than source-repository links.

## Licensing and release acceptance preparation (7 October 2026)

Original SavedDesk code now uses root MIT `LICENSE`, with package metadata aligned at 0.2.1. Verbatim dependency notices and exact source archives are collected; unresolved source correspondence and upstream license-combination findings remain explicit. Installer packaging includes license resources and installation-owned connector cleanup, preserving user media/catalogs. Pinned signing, hash-bound release gates and guarded disposable Windows guest acceptance are prepared. Actual clean-machine installation, public-trust signing and the current live-provider matrix remain unverified because no VM or signing identity is available. See [precise setup and review findings](release-readiness.md). Existing build/test/hash records above describe their recorded versions and must not be relabeled as 0.2.1 acceptance.

## Audited worker reuse for desktop-only builds

The default release build packages a fresh worker. When only native or frontend code changes, `packaging/build-desktop.ps1 -ReuseWorker` may reuse the staged worker after its complete payload, frozen-module exclusions and owned-source hashes pass the audit. Missing or stale proof fails the build; it never silently reuses outdated worker code. The release still regenerates notices and corresponding-source records, builds the connector/desktop/installer and verifies staged resources.
