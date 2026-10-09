# SavedDesk 0.2 development artifact

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** Current targets and the tested installer are 0.2.10. Earlier sizes, hashes and measurements describe their original artifacts. Documentation cleanup does not rebuild or rebind those assets.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

## Historical 0.2.7 verification

The offline WebView2 prerequisite installer handles fresh installs and upgrades. Current-payload licensing/source review, host installation/upgrade/uninstall, 317 regression cases, 90 synthetic account cases, 13 controlled runtime cases, all seven supplied public links and the thirty-minute native performance test passed. Debug/release targets are 0.2.7. The unsigned installer is 261,856,782 bytes with SHA-256 `e9b54924c2c837a68bb38841ded23db3d96f9be313efe185e3c1f6ee46e7803f`. Exact evidence: [runtime and performance report](runtime-private-and-soak-0.2.7.md). Earlier version records below retain their historical measurements.

## Historical 0.2.6 verification (8 October 2026)

**317 automated cases, 15 desktop scenarios, 44 codec/playback combinations, seven controlled NSIS prerequisite cases, host installer lifecycle and all seven supplied live links passed.** Resume now waits safely for worker shutdown with one click. Gallery MOV/M4V/AVI inputs enter video finalization. Previews through 0.2.3 are hash-preserved in ignored quarantine and blocked from collection/publication. Debug/release targets and the unsigned installer are current.

Installer: **47,591,412 bytes**, SHA-256 **`bc902bace41a824990476f6f003bafc3c3a65ef1f660aeea63059e70cf24c8b2`**. Review set: `release-artifacts/v0.2.6/`. [Full follow-up report](machine-follow-up-0.2.6.md) distinguishes real host/live tests from controlled prerequisite cases and retained failures. Signing and Git/GitHub/browser-store delivery are on hold; encrypted SQLite, portable recovery and automatic updates remain planned. Other physical Windows/GPU and actual absent-runtime installations remain unverified. The 0.2.5 and earlier records below are historical.

**Current architecture - 0.2.10:** gallery-dl and FFmpeg are external user-installed tools, excluded from the new installer. See [licensing and setup](licensing-and-external-tools.md). Older bundled-tool, no-Python and unresolved-source statements below describe their recorded earlier builds; they do not apply to the new payload or clear old installers.

## Historical 0.2.5 rigorous host verification (8 October 2026)

Debug/release builds and installer resources are refreshed. A stale nested debug worker and leftover release-stage packages were found and removed; the build now replaces known generated trees and checks their full manifests. **309 automated cases and 14 real desktop scenarios passed**, followed by host installation/upgrade/uninstall and all seven supplied live links on the same installer. Original profiles, sessions, registrations and shortcuts were restored. See [full machine results, retained failed attempts, timings and remaining issues](machine-acceptance.md).

Installer: **47,576,177 bytes**, SHA-256 **`aa5d1519d0a5001254de34c306f9a20ad6bbf2473820403c3d28888e78cb05c5`**, **NotSigned**. Current-payload licensing/source, host installer and live-provider gates pass; trusted signing remains false. New users install/select gallery Python and FFmpeg separately. This host verification does not establish absent-prerequisite behavior on another Windows machine. The current preview is `release-artifacts/v0.2.5/`; earlier records below remain historical.

## Historical 0.2.4 licensing architecture and installer (8 October 2026)

Installer: `release-artifacts/v0.2.4/SavedDesk_0.2.4_x64-setup.exe`, **47,578,787 bytes**, SHA-256 **`b658da8647a48025231edb9316f4b928818db05e7c00d2ab77bea39ddd68eb86`**, **NotSigned**. The directly launched development executable and its worker resources also use 0.2.4.

The new payload excludes gallery-dl, imageio-ffmpeg and FFmpeg/FFprobe executables. The actual archive and all 1,130 adjacent payload files were audited; 1,643 frozen modules contain neither excluded namespace. Adapter files match original MIT source, and isolated Python suppresses bytecode writes to the installation. Remaining notices: **408 inventory entries / 717 notice records / zero omissions**. Matching dependency source archives: **289 / zero collection failures**. All seven CPython runtime DLLs match the official installed distribution, with seven exact external-source records retained. Current payload redistribution and source-record gates pass; historical installers remain uncleared.

The guarded 0.2.0-to-0.2.4 installer lifecycle passed on this existing Windows host: removed obsolete tool copies, retained library/history/settings/volume/duplicates/media, installed notices/connector, uninstalled binaries/registration while keeping data, and restored the original profile hashes, registrations and shortcuts. Evidence: `.cache/host-acceptance/68bf80c1-d38b-4c52-8834-214bfdfc57c4/host-windows.json`. This is not clean-machine acceptance.

Validation: 153 worker tests passed, followed by 13 packaged-worker retests after disabling adapter bytecode writes; 60 native tests, nine packaging/evidence checks, TypeScript/static build and the new Settings selection/narrow-layout UI regression passed. Eight asset checksums and all four ZIP CRC checks passed. Live-link results are recorded in [live acceptance](live-platform-acceptance.md). Build-time archives are immutable; later driver corrections and post-test evidence remain in the current checkout/cache.

## Previous 0.2.3 live-provider and installer acceptance (8 October 2026)

All seven owner-supplied disposable links passed real installed-release download, built-in playback, duplicate skipping, selected-folder checks and confirmation-based deletion. Video cases also passed seek/repeat/persistent volume; YouTube passed pause/resume. Instagram's supplied `/reels/` URL exposed a local validator omission, fixed by normalizing it to `/reel/` at native and worker boundaries. Two harness assumptions about Windows paths and remembered Repeat state were corrected; successful reruns are retained rather than calling the initial failures passes.

The installer is **72,871,031 bytes**, SHA-256 **`19fe0a05f0b761ba327ef9a37c865df977ecdc9b237f3fa70377e7013637fced`**, **NotSigned**. Its guarded 0.2.0-to-0.2.3 install/upgrade/uninstall test passed, including unchanged owner profile hashes, prior registrations and shortcuts. This was the owner-authorized existing development host, not a clean VM. Tests: 148 worker, 58 native and six release-evidence checks; eight asset checksum entries and four ZIP CRC checks passed. [Detailed sanitized acceptance](live-platform-acceptance.md).

Latest post-test review: `.cache/release-acceptance/review-0.2.3/acceptance-review.json`. Project license, host installer and live-platform gates pass; redistribution review and trusted signing remain open. No Git repository, public release or signing identity was created. Immutable build-time archives were not rewritten with later test evidence or test-driver corrections.

## Previous 0.2.2 Windows host acceptance (7 October 2026)

The owner requested installer testing on this existing Windows 10 Pro system. A fresh 0.2.2 preview was built with completed standalone notices and the exact CPython Windows redistribution conditions displayed in NSIS. Installer: **72,884,073 bytes**, SHA-256 **`c8835800b4ea139eac4625a35f087defade425ce154f1b092f4eccc61f3263dc`**. It remains **NotSigned**, not publicly released. Eight asset checksums and four ZIP CRC checks passed.

The guarded host test installed 0.2.0, completed three local sample transfers, upgraded to 0.2.2, verified settings/player volume/library/history/duplicate detection and unchanged sample files, checked notices and connector registration, and uninstalled. App binaries and its test registry entries were removed while the sample catalog and media remained. Original owner profile hashes, prior registry values and existing shortcuts were restored. Evidence: `.cache/host-acceptance/76ea8f39-6670-490b-abe9-03e87384db11/host-windows.json`; copied hash-bound report and latest review under `.cache/release-acceptance/`. This is a host test with an empty temporary app profile, **not a clean Windows machine**.

Validation: **147 worker tests** and **6 release-evidence regression checks** passed. Earlier 0.2.1 attempts diagnosed startup capability probing briefly holding the worker gate; the driver now waits only for that specific busy message, bounded to 30 seconds. The 0.2.2 lifecycle passed. No automated provider test used owner sessions.

Licensing inventories **411 components / 720 notice records**, with **zero missing notices**. Seven actual runtime DLLs matched the installed CPython distribution; seven external source archives from exact CPython source-deps commits joined the dependency bundle, for **292 archives with no collection failures**. Public release remains false: FFmpeg linked-library source correspondence and gallery-dl/Requests review are unresolved; no trusted publisher identity/service exists; live-provider acceptance awaits disposable links. Precise unsent upstream requests are in `licensing/REVIEW-REQUESTS.txt`.

The immutable release folder retains its build-time acceptance review, generated before the host run. The latest post-test review is `.cache/release-acceptance/review-0.2.2/acceptance-review.json`; `windows_installer` is true and `windows_test_environment.clean_machine` is false. Older sections retain their historical artifact evidence; the original-source ZIP is the build-time snapshot and is not silently rewritten after these evidence notes.

## Previous 0.2.1 licensing/release preview (7 October 2026)

The original project now uses MIT, with full collected dependency notices and remaining source findings recorded in [release readiness](release-readiness.md). The corrected fresh installer is **72,870,696 bytes**, SHA-256 **`cdc06c5c92f32975b307821e46b8bd89041ed90924dddddba1a1efbac8fa28e2`**, at `release-artifacts/v0.2.1/SavedDesk_0.2.1_x64-setup.exe`. Its manifest records `collected_existing: false`, `signature_status: NotSigned`, no source commit (the root is not initialized as Git), and `public_release_ready: false`.

The review set includes the installer, connector, original-source/notices/dependency-source ZIPs, acceptance review, notes, manifest and SHA256SUMS. All checksums and ZIP CRCs pass; notice resources match the recorded hashes. The source bundle has **285 archives**, **16 exact-version PyPI metadata records**, a Node publisher checksum file, and zero download failures. Exact FFmpeg external-library source correspondence and the other recorded dependency review findings remain open. The source ZIP is a build-time snapshot; this post-build artifact record does not rewrite immutable preview assets.

**147 Python tests pass**, including release-version agreement. The final packaged worker reports 0.2.1, completes three isolated local transfers with external Python/Node removed from PATH, and finds its bundled Node extraction runtime and FFmpeg. PowerShell/Python/JavaScript/workflow syntax, source/ignore/Markdown auditing, missing/stale-evidence rejection and fresh-guest host refusal pass. The earlier 289-check 0.2.0 UI/native/connector baseline below is historical; those suites are not relabeled as new 0.2.1 guest acceptance. The existing debug executable/adjacent debug worker remain the recorded 0.2.0 development build; current 0.2.1 release binaries are separate.

The prepared configuration is `.cache/clean-windows/dc3a1603-b4fb-435e-8a37-1552c6a25d65/SavedDesk.wsb`. It maps only dedicated read-only inputs and writable evidence. No unavailable VM was launched and no signing identity was provisioned. [Precise owner steps](release-readiness.md) explain feature/VM setup, signing identity/OIDC, actual install/upgrade/uninstall and live-provider acceptance. SQLite encryption remains planned.

Evidence: `.cache/license-python-tests.log`, `.cache/license-source-final.log`, `.cache/license-release-final.log`, `.cache/license-release-final-error.log`, `.cache/azure-signing-doctor.log`, `.cache/clean-host-refusal.log`, and isolated `.cache/packaged-license-smoke/` reports. The root Git repository and remote remain uninitialized/unpublished.

## Previous 0.2.0 repository/release preparation artifacts (7 October 2026)

The top download ornament is removed; Add download starts directly with its heading. The current embedded development executable and unsigned Windows x64 NSIS installer are built. Source-only Git auditing and prepared CI/draft-release workflows are documented in [repository and release instructions](repository-and-releases.md). Generated binaries remain excluded from Git; the local paths below are not source-repository downloads. Older hashes in this document are historical evidence.

| Artifact | Local path | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Current development app | `desktop/src-tauri/target/debug/saveddesk.exe` | 18,336,256 | `9EC01E78A19326DC7414E57869200919314F0E49B21DAF2F3D0D735372FF3AEA` |
| Current packaged worker | `desktop/src-tauri/target/debug/worker/saveddesk-worker.exe` | 13,248,926 | `54C31B23E08A0252FAF128871B6E34BD19191540F6B80D5AAC1D8CAEC44D0A9B` |
| Previous unsigned installer | `release-artifacts/v0.2.0/SavedDesk_0.2.0_x64-setup.exe` | 72,754,110 | `8E922E2FA312AA1EBEF6C87DEEFA8FAB9900B049E42A51BF095AFC36F5271AFA` |

Keep the debug app's adjacent worker, browser-connector and native-host resources intact. `release-artifacts/v0.2.0/` also contains the connector ZIP, tool-notice review inventory, release metadata/notes and `SHA256SUMS.txt`. Every listed asset checksum, manifest hash and connector ZIP entry is verified. The generated worker resources match the fresh PyInstaller output with no stale or missing files beyond the intended Node runtime additions.

All 289 Python/native/UI/connector checks, TypeScript/static export, embedded build and NSIS compilation pass. The first collector run exposed Windows PowerShell quoting in FFmpeg notice inspection; it was corrected and the fresh installer was collected successfully without another compilation. `collected_existing: true` in the manifest records that recovery transparently. The script's default and GitHub workflow still build a fresh installer. Evidence: `.cache/git-readiness-release.log`, `.cache/git-readiness-release-collection.log`, `.cache/git-readiness-release-acceptance.json` and `.cache/git-readiness-desktop.log`.

The installer is unsigned; clean-machine installation/upgrade/uninstall, complete third-party notices/corresponding-source review, signing and wider platform/hardware acceptance remain pending. Neither the root Git repository nor a remote/public release has been initialized or published. GitHub-hosted workflows remain unverified. Current SQLite storage is still unencrypted.

## Previous information-popup development executable (7 October 2026)

Open `desktop/src-tauri/target/debug/saveddesk.exe` with its adjacent worker/connector/native host. Info icons are border-free and open separate pop-ups without moving the form. Add download inherits advanced Settings defaults, search dimensions stay fixed, Help has an icon close button, the Settings advanced action has horizontal padding, and sidebar labels are Instagram and X (F.K.A. Twitter). [Verification record](implementation-progress.md#information-pop-ups-stable-search-and-simpler-download-form-7-october-2026).

- Debug app: 18,336,256 bytes; SHA-256 `0E11F50201D84DDD6155A62C33EC87641CD1EF56A5CC6B7BEE2AFD472D6675C2`.
- Unchanged adjacent/resources worker: SHA-256 `54C31B23E08A0252FAF128871B6E34BD19191540F6B80D5AAC1D8CAEC44D0A9B`.
- All 74 UI tests, TypeScript/static export, embedded build, three-width visual/accessibility checks and isolated packaged Windows popup/search/restart/video acceptance pass. The historical installer remains unchanged.

## Previous shared-controls development executable (7 October 2026)

Open `desktop/src-tauri/target/debug/saveddesk.exe`, keeping its adjacent worker/connector/native host intact. Buttons share visible boundaries and a 40-pixel height; dropdowns and text spacing are consistent. Selection uses checkboxes and configuration uses switches. The sidebar changes only through its app icon, remembers its state natively and has no Low-resource action. Accounts puts privacy/access guidance at the top and separates all cards, including Pinterest and Discord. [Verification record](implementation-progress.md#shared-controls-account-layout-and-persistent-sidebar-7-october-2026).

- Debug app: 18,335,744 bytes; SHA-256 `56DBA7202BB4B85AB0C54666A0F1D5982832CD11E88720F55DB9D086C172B629`.
- Adjacent/resources worker is unchanged: SHA-256 `54C31B23E08A0252FAF128871B6E34BD19191540F6B80D5AAC1D8CAEC44D0A9B`.
- All 71 UI and 57 native tests pass, plus TypeScript/static export, embedded native build, three-width visual audits and isolated packaged Windows restart/settings/playback, checkbox batch deletion and comprehensive media acceptance. The historical installer below predates this update.

## Previous advanced-video-settings development executable (7 October 2026)

Open `desktop/src-tauri/target/debug/saveddesk.exe`, keeping its adjacent worker/connector/native host intact. **Settings -> Video defaults -> Advanced video settings** now includes actual conversion controls with info buttons; Add download supports job-specific overrides. All checkbox visuals use modern switches. [Verification record](implementation-progress.md#advanced-video-settings-and-modern-switches-7-october-2026).

- Debug app: 18,332,160 bytes; SHA-256 `847205E27281E80D6B1638780A765A3D824EAA4D36A9010DF26F8CA858CA24FC`.
- Adjacent/resources worker: SHA-256 `54C31B23E08A0252FAF128871B6E34BD19191540F6B80D5AAC1D8CAEC44D0A9B`.
- 146 Python, 57 native, 68 UI and 12 connector checks pass (283 total), plus final TypeScript/static export, packaging/native builds and isolated packaged Windows restart/retry/conversion/playback acceptance. Compatible MP4 stays byte-identical. The historical installer below predates this update.


## Previous platform-navigation and volume development executable (7 October 2026)

Open `desktop/src-tauri/target/debug/saveddesk.exe` with its adjacent worker/connector/native host intact. Reddit support is removed. The sidebar includes seven platform sections in the requested order; video volume/mute persists natively across app launches, and input focus-border overlays are removed. [Verification record](implementation-progress.md#reddit-removal-platform-sections-and-persistent-volume-7-october-2026).

- Debug app: 18,269,696 bytes; SHA-256 `44F43E51213A6C8BBAC19CD08E082DCA32A2F839E12D69A2B963762C2A26C595`.
- Adjacent/resources worker: SHA-256 `24B23D3E7CB100B5DA8340FBA3E7E83C81D24B86ABE83C8F169D460361DDC3EA`.
- 142 Python, 56 native, 61 UI and 12 connector checks pass, plus final TypeScript/static export, worker/native builds and packaged Windows restart/media acceptance. This remains an unsigned development build; the installer below is historical and does not include this update.

## Previous video-reliability development executable (7 October 2026)

Open `desktop/src-tauri/target/debug/saveddesk.exe` with its adjacent worker/connector/native host intact. This build fixes the reproduced Instagram MP4 colour-metadata failure, keeps compatible videos unchanged, reduces repeated local processing and continues collections past individual conversion failures. Reopen it and use **Retry unfinished items** on the failed download. [Verification record](implementation-progress.md#instagram-video-reliability-and-bulk-processing-overhead-7-october-2026).

- Debug app: 18,207,232 bytes; SHA-256 `1BDC9207BE31557F38D2E4F1380295FF1497917696C8EFC94F0C8DEB9F220911`.
- Adjacent/resources worker: SHA-256 `A3A2085D45DB88EEA07585F8D64EF3D9A445BC5685ACA1C634401535F263C36C`.
- Fresh checks: 142 Python and 56 native tests, worker/prototype builds and packaged Windows retained-video/collection recovery acceptance. Frontend/connector source is unchanged. This remains an unsigned development build; the older installer below does not include this update.

## Previous direct-media development executable (7 October 2026)

Open `desktop/src-tauri/target/debug/saveddesk.exe` with its adjacent worker/connector/native host intact. Spotify is removed; Discord direct media is ready without account/server setup. This update passes 136 Python tests, 56 native tests, 58 UI tests and 12 browser-connector tests, plus two isolated packaged Windows acceptance runs. [Verification record](implementation-progress.md#spotify-removal-and-direct-discord-media-7-october-2026).

- Debug app: 18,207,232 bytes; SHA-256 `6E35180BB139C8CE606D4C7E7B71C724AB90EF688D8CC67BA9DE7CE349BD721C`.
- Adjacent/resources worker: SHA-256 `01510489C1CB03635A053B86423ACD55EA58874710BA58529766648D3D9288C3`.
- TypeScript/static export, worker packaging and native prototype builds pass. This remains an unsigned development build.

## Historical installer (4 October 2026)

The installer below predates the current changes and has not been rebuilt. Use the current executable above to test this update. Recorded on **4 October 2026**.

| Property | Result |
| --- | --- |
| Version / architecture | 0.2.0 / Windows x64 |
| Installer | `desktop/src-tauri/target/release/bundle/nsis/SavedDesk_0.2.0_x64-setup.exe` |
| Size | 48,090,542 bytes (45.86 MiB) |
| Signature | NotSigned; unsigned local development artifact |
| SHA-256 | `38DE481DD4FE80E94F6D3B981F620E92141BD97F8F13B61A8692BBB6412DB7D3` |
| Build | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/build-desktop.ps1` completed successfully |
| Contents | Static Next.js frontend, native app, packaged Python/FFmpeg, browser connector packages and native messaging host |

**Chrome fix delivery:** the later 4 October Chrome registration-path/retry and account-verification/final-status corrections are included in the updated debug executable and connector packages. The installer recorded above predates those corrections; rebuild it before distributing that fix.

The installer was built locally; it has not been installed as part of automated validation. The embedded debug desktop build is tested through isolated WebView2 scenarios with Python fallback disabled. A clean-machine installer/upgrade/uninstall run, code signing, complete redistribution notices/source requirements, browser-store approval and real account/hardware acceptance remain release gates. This artifact is not a signed production release.

**Console-free debug launch:** the debug app and native host were rebuilt on 4 October with the Windows GUI subsystem enabled for both debug and release builds. Launching the executable below no longer automatically opens a console. This correction was verified in both binaries and through the isolated installed-Chrome connection scenario.

The executable previously opened by the user is updated at `desktop/src-tauri/target/debug/saveddesk.exe`. Keep its adjacent `worker/`, `browser-connector/` and `saveddesk-native-host.exe` files. Reopen it, choose **Accounts**, connect the signed-in browser/profile, then select **Add download**. [Account setup instructions](account-connection.md) explain direct Firefox connection and the development connector for other browsers.

See [verified implementation progress](implementation-progress.md) for functionality, test evidence and the remaining required work.


## Previous debug interface update

On **5 October 2026**, the debug executable was rebuilt with screen-edge fullscreen navigation, an accessible in-player video control bar, keyboard library browsing, contextual help/recovery and saved interface scaling. Size: 17,606,656 bytes; SHA-256 `c1eb365df3d71b7df6e40b4bb4cac176e50b33f43960004ff635386337cb2fd4`. TypeScript/export, 28 UI checks and the isolated Windows media/accessibility acceptance pass. The installer above predates this update and remains unchanged. [Findings and validation limits](accessibility-and-usability.md) and the [progress ledger](implementation-progress.md) record the evidence.


## Previous debug fullscreen update

On **5 October 2026**, the debug executable was rebuilt with fullscreen filename-tag removal, maximum uncropped video sizing and a translucent single-row control overlay. Controls hide after three seconds while paused/playing, reveal on mouse movement and stay available for keyboard interaction. Size: 17,607,168 bytes; SHA-256 `31d00bad9893919527c3605e849c7693ce570d38095ecaa79d0f5b7d5435dc53`. Static export/TypeScript, 28 UI checks and isolated Windows media acceptance pass. The installer above remains unchanged. [Current evidence](implementation-progress.md) records the tested behavior and limits.


## Previous debug video input update

On **5 October 2026**, the debug executable was rebuilt with right-click play/pause and Space playback without a video border. Tab focus remains visible, and held Space does not toggle repeatedly. Size: 17,607,680 bytes; SHA-256 `0bfff5255da5c08a3f6041be95344665281eb3932eed3ca4232eeb039ca9dc71`. TypeScript/static export, 28 UI checks and isolated Windows media acceptance pass. The installer remains unchanged. [Verification](implementation-progress.md) records the evidence and limits.


## Previous debug layout and compatibility update

On **6 October 2026**, the worker and debug app were rebuilt with custom scroll rails, sidebar hover/pin/collapse, header/panel spacing, focus-overlay corrections, bottom-bar removal and original-preserving video compatibility copies. The exact reported Instagram video passes full-resolution Windows playback/seek and cache reuse, with its original checksum unchanged. Size: 17,663,488 bytes; SHA-256 `36b640791c28b50454af960d96bf6eaaf1beffb936bc93ed2678e6ad92e758c2`. 91 Python tests, 31 native tests, TypeScript/static export, 33 UI tests and isolated Windows media/storage acceptance pass. The installer above remains unchanged. [Current verification](implementation-progress.md) records evidence and limits.


## Previous debug card layout and fast playback update

On **6 October 2026**, the debug app was rebuilt with organized Settings/Accounts cards, responsive controls, brand-icon sidebar pin/collapse, removal of Collections navigation and the Downloads badge, and bounded native AVC MP4 inspection. Ordinary H.264 checks no longer wait for Python/FFmpeg or preview/download work. Final Windows measurements: 28.2 ms first-use and 12.0 ms median across ten checks with an active job. First-copy conversion for other formats still takes time; valid copies are reused.

Size: **17,684,992 bytes**; SHA-256 `83c9f8dfb698fa28f03852bb00cc10fc07147993d70f4ab2be113f0a182f62fd`. TypeScript/static export, 34 native tests, 35 UI tests, final-build Windows media/storage acceptance and the exact reported Instagram-video playback/cache regression pass. The older unsigned installer remains unchanged. Keep the adjacent worker, browser-connector and native-host files with the executable. See [current evidence and limits](implementation-progress.md).


## Previous debug sidebar stability and playback update

On **6 October 2026**, the debug app was rebuilt with stationary sidebar icons, a centered compact brand button, smooth visible-width/label transitions, vertical-only sidebar rails and a hover-leave grace. Rounded backgrounds preserve real pointer/keyboard hit areas. Native codec decisions are cached with bounded fingerprints/expiry, validation avoids duplicate work, and initial playback readiness arrives with the file list instead of another native command.

Size: **17,707,008 bytes**; SHA-256 `7e87cb79108c58d46af46aa55b5f9eb0bfbacd20b54e05935821bf52d333249b`. TypeScript/static export, 36 native tests, 38 UI tests and final-build Windows media/storage acceptance pass. WebView2 measurements excluding automation transport: 24.6 ms first standalone check, 7.3 ms median, and 7.2 ms for a warmed file list with readiness; initial viewing used zero extra compatibility calls. Conversion remains separate. The older unsigned installer remains unchanged. Keep adjacent worker/connector/native-host files with the executable. [Current evidence and limits](implementation-progress.md).


## Previous debug mouse playback and fullscreen transition update

On **6 October 2026**, the debug app was rebuilt with right-click playback across the player background and resize-aware fullscreen image/video transforms. Playback and modal position survive the transition; keyboard controls and reduced motion remain supported. Size: **17,708,032 bytes**; SHA-256 `7870c3354c6c558c79879b111a1f46716df659400e2df2a60ea9490658cea3bf`. TypeScript/static export, final typechecking, 40 UI checks and isolated Windows transition/media/storage acceptance are recorded in [implementation progress](implementation-progress.md). Native/backend/connector source is unchanged. The older installer remains unchanged; keep the adjacent worker, browser-connector and native-host files with the executable.


## Previous debug left-click and fullscreen backdrop update

On **6 October 2026**, the debug app was rebuilt with left-click video playback and stable dialog/backdrop behavior through fullscreen switches. Temporary geometry locks and gradual backdrop recovery preserve the existing media transition and playback. Reduced motion and failed requests retain safe cleanup. Size: **17,709,056 bytes**; SHA-256 `50e1c4e5df9ebf3eb797761f47479fbaed221d4d79725227b39e52a2300d5550`. Static export/typechecking, 42 UI checks and isolated live Windows transition/media acceptance are recorded in [implementation progress](implementation-progress.md). Native/backend/connector code and the older installer are unchanged; keep the adjacent worker, browser-connector and native-host files with the executable.


## Previous debug public-platform build

On **6 October 2026**, the development executable was rebuilt with the seven new platform choices, public download adapters, source filtering/help, protected Discord attachment signatures, Spotify details/link cards, bundled YouTube support and a bounded browser-connector handoff correction. The exact [platform matrix and limits](platform-support.md) distinguishes working public workflows from Facebook/Reddit provider restrictions and unimplemented private-account access.

Executable: `desktop/src-tauri/target/debug/saveddesk.exe`; size **17,796,608 bytes**; SHA-256 `09b5584ecd8de5074ff6a45f8572c89972de4fdd8eda4e2fc6514342baf8938a`. The resources/adjacent worker binaries match SHA-256 `dcff2f1d4103464045e4b089192cf74d9468fb4436046df3a70c44d1aa9d6ce4`. The bundled Node 24.21.0 executable is 93,580,104 bytes; SHA-256 `ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32`, with its license and runtime manifest next to it.

Static export/typechecking, **45 UI checks**, **104 Python tests**, **40 native tests** and the connector's **10 tests** pass. Native acceptance and actual public-transfer results are recorded in [implementation progress](implementation-progress.md). Keep the adjacent `worker/`, `browser-connector/` and `saveddesk-native-host.exe` files. Exit the running app and reopen this executable to load the new frontend/host. The older unsigned installer above does not include this update.


## Previous debug browser-session, progress and repeat update

On **6 October 2026**, the executable and packaged worker were rebuilt with optional scoped YouTube/Facebook/TikTok/Pinterest browser sessions, measured live progress and remembered video repeat. Spotify audio is on hold; Reddit/Discord private application integrations remain outstanding. These new browser sessions are approved credentials, not a claim of remotely verified account identities. [Account setup](account-connection.md) explains scope and session-rotation limitations.

Executable: `desktop/src-tauri/target/debug/saveddesk.exe`; **17,810,432 bytes**; SHA-256 `461cd5e2bf2e8e20f3b140937902c1f23d2dd05f052eeb53e9d045e9e28d0052`. The adjacent/resources worker binaries match `1c1ab18367103149917e135e39704c0da367c0cde4a450ebb9a2282d49afaa48`. The bundled Node runtime and license remain as recorded above. The Windows GUI subsystem remains enabled.

**48 UI, 112 Python, 42 native and 12 connector checks** pass. Three isolated real Windows/WebView2 acceptance runs cover the new approved-session/progress/repeat flow, existing Instagram/X/direct Firefox and the anonymous platform pipelines. Exact evidence is in [implementation progress](implementation-progress.md). Real private provider/account/browser acceptance, clean-machine installation, signing and hardware benchmarks remain release gates. The installer above was not rebuilt.

Reopen this executable, keeping its adjacent `worker/`, `browser-connector/` and `saveddesk-native-host.exe`. **Reload SavedDesk Browser Connector** on the browser Extensions page to load the added optional platform permissions and popup code, then approve each desired platform separately in Accounts.


## Latest debug deletion and prepared-playback update

On **6 October 2026**, the debug executable and worker were rebuilt with confirmed post/saved-file/download/collection deletion and compatibility preparation before newly downloaded videos are marked saved. The catalog tracks preserved conversion originals for repair/deletion; deletion validates selected-folder scope and supports staged rollback/interruption recovery. Existing account approval, progress and repeat behavior remains. [Media/storage instructions](media-and-storage.md#deleting-saved-content) explain permanent deletion, retained out-of-folder/untracked files and the older-video fallback.

Executable: `desktop/src-tauri/target/debug/saveddesk.exe`; **18,157,568 bytes**; SHA-256 `c76b1aed5cc8f11938b9449d49136aa091e3ac551f54eb650331d52daff7114c`. Resource/adjacent worker binaries match `df18c31e3aff5a6f151676dd85ea3de9522285b00e3ef1862c02f390effb91e6`. Keep adjacent worker, connector and native-host resources. The Windows GUI subsystem remains enabled; reopening this executable loads the changes. No connector reload is needed for these deletion/playback changes.

All **231 checks** (52 UI, 116 Python, 51 native, 12 connector) and final builds pass. Isolated real Windows/WebView2 acceptance verifies download-time VP9 conversion, unchanged originals, actual playback, prepared cache reuse (7.2 ms median readiness on this PC), confirmation/cancel, scoped file/job/collection deletion, stale folder rejection and retained unrelated/out-of-root files. Existing Instagram/X/direct Firefox and seven-source anonymous pipeline acceptance also pass. [Implementation progress](implementation-progress.md) records exact logs and scope. This is a development executable; the earlier unsigned installer was not rebuilt, and clean-machine signing/installation, weak-hardware and broader codec/HDR acceptance remain release gates.


## Previous compatible-only video download debug update (6 October 2026)

The debug executable and adjacent worker are rebuilt with compatible-first AVC/AAC source selection, MP4 merge/output identification, audio-only fallback, silent-video support, verified incompatible-source replacement/removal and faster tested hardware/software encoding. New completed videos retain one playable MP4, with no incompatible original/download-time playback sidecar. Earlier library files retain legacy recovery/deletion support; the installer listed above predates this update.

| Artifact | SHA-256 |
| --- | --- |
| `desktop/src-tauri/target/debug/saveddesk.exe` (18,157,568 bytes) | `0F965B57E770ABBC7A4F4A041CFD536E9C00467C50D4F3F6426D72600536D60A` |
| Adjacent/resources worker | `661B46284DD5BBA33FFA643598A1AAB3F4987CE28309F58969A73C82BE6C7FE0` |

243 checks and three isolated packaged Windows acceptance runs pass, including nonblank decoded video frames, direct MP4 readiness, safe deletion/retries, Instagram/X/Firefox and seven-source public workflows. [Implementation progress](implementation-progress.md#compatible-only-video-downloads-and-faster-encoding-6-october-2026) records exact fixtures/logs, encoding measurements and limitations. Preserve the executable's adjacent runtime directories and native host when launching it.


## Current multi-post deletion and provider setup debug update (7 October 2026)

The debug executable now includes page-scoped checkbox/range selection, one recoverable batch deletion review and separate Reddit/Discord prerequisite cards with official setup-page actions. Reddit OAuth and Discord bot/history retrieval are not implemented; the [provider guide](discord-media-downloads.md) gives the exact current steps and future alternatives.

| Artifact | Result |
| --- | --- |
| `desktop/src-tauri/target/debug/saveddesk.exe` | 18,201,600 bytes |
| Debug app SHA-256 | `C76551929DF40B670FF8FB9296FBFA76EE68921927F86ABBA82DC7EA2ADBA8AC` |
| Adjacent/resources worker SHA-256 (unchanged) | `661B46284DD5BBA33FFA643598A1AAB3F4987CE28309F58969A73C82BE6C7FE0` |

TypeScript/static export, all 57 UI tests and 55 native tests pass. A further 10 selection/setup/accessibility checks pass after the checkbox color correction. The final executable passes isolated Windows batch selection, cancellation, physical file removal, unselected/untracked file preservation and Accounts-card checks; the acceptance JSON records this exact SHA-256. Earlier in this same update, the full native video/deletion scenario also passed with nine nonblank decoded frames. [The progress ledger](implementation-progress.md#multi-post-deletion-and-redditdiscord-setup-7-october-2026) records precise logs/fixtures and scope.

Reopen this executable with its adjacent worker, browser-connector and native-host files. The older unsigned installer was not rebuilt. Provider approval/live bot OAuth, wider account/hardware matrices and signed clean-machine delivery remain outstanding.

## Licensing and release acceptance preparation (7 October 2026)

Original SavedDesk code now uses root MIT `LICENSE`, with package metadata aligned at 0.2.1. Verbatim dependency notices and exact source archives are collected; unresolved source correspondence and upstream license-combination findings remain explicit. Installer packaging includes license resources and installation-owned connector cleanup, preserving user media/catalogs. Pinned signing, hash-bound release gates and guarded disposable Windows guest acceptance are prepared. Actual clean-machine installation, public-trust signing and the current live-provider matrix remain unverified because no VM or signing identity is available. See [precise setup and review findings](release-readiness.md). Existing build/test/hash records above describe their recorded versions and must not be relabeled as 0.2.1 acceptance.
