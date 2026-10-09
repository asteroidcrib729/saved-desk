# Live platform acceptance

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** Live records below retain their original installer hashes. They are historical, not fresh seven-platform acceptance for 0.2.10. Current local/native and host results are linked separately.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

## Historical 0.2.7 verification

The offline WebView2 prerequisite installer handles fresh installs and upgrades. Current-payload licensing/source review, host installation/upgrade/uninstall, 317 regression cases, 90 synthetic account cases, 13 controlled runtime cases, all seven supplied public links and the thirty-minute native performance test passed. Debug/release targets are 0.2.7. The unsigned installer is 261,856,782 bytes with SHA-256 `e9b54924c2c837a68bb38841ded23db3d96f9be313efe185e3c1f6ee46e7803f`. Exact evidence: [runtime and performance report](runtime-private-and-soak-0.2.7.md). Earlier version records below retain their historical measurements.

## Historical 0.2.6 verification (8 October 2026)

**317 automated cases, 15 desktop scenarios, 44 codec/playback combinations, seven controlled NSIS prerequisite cases, host installer lifecycle and all seven supplied live links passed.** Resume now waits safely for worker shutdown with one click. Gallery MOV/M4V/AVI inputs enter video finalization. Previews through 0.2.3 are hash-preserved in ignored quarantine and blocked from collection/publication. Debug/release targets and the unsigned installer are current.

Installer: **47,591,412 bytes**, SHA-256 **`bc902bace41a824990476f6f003bafc3c3a65ef1f660aeea63059e70cf24c8b2`**. Review set: `release-artifacts/v0.2.6/`. [Full follow-up report](machine-follow-up-0.2.6.md) distinguishes real host/live tests from controlled prerequisite cases and retained failures. Signing and Git/GitHub/browser-store delivery are on hold; encrypted SQLite, portable recovery and automatic updates remain planned. Other physical Windows/GPU and actual absent-runtime installations remain unverified. The 0.2.5 and earlier records below are historical.

## Historical 0.2.5 rigorous host verification (8 October 2026)

Debug/release builds and installer resources are refreshed. A stale nested debug worker and leftover release-stage packages were found and removed; the build now replaces known generated trees and checks their full manifests. **309 automated cases and 14 real desktop scenarios passed**, followed by host installation/upgrade/uninstall and all seven supplied live links on the same installer. Original profiles, sessions, registrations and shortcuts were restored. See [full machine results, retained failed attempts, timings and remaining issues](machine-acceptance.md).

Installer: **47,576,177 bytes**, SHA-256 **`aa5d1519d0a5001254de34c306f9a20ad6bbf2473820403c3d28888e78cb05c5`**, **NotSigned**. Current-payload licensing/source, host installer and live-provider gates pass; trusted signing remains false. New users install/select gallery Python and FFmpeg separately. This host verification does not establish absent-prerequisite behavior on another Windows machine. The current preview is `release-artifacts/v0.2.5/`; earlier records below remain historical.

**Current architecture - 0.2.10:** gallery-dl and FFmpeg are external user-installed tools, excluded from the new installer. See [licensing and setup](licensing-and-external-tools.md). Older bundled-tool, no-Python and unresolved-source statements below describe their recorded earlier builds; they do not apply to the new payload or clear old installers.

## Historical 0.2.4 external-tools acceptance

Executed on 8 October 2026 (local). Actual installed preview: **47,578,787 bytes**, SHA-256 **`b658da8647a48025231edb9316f4b928818db05e7c00d2ab77bea39ddd68eb86`**, **NotSigned**. The installed worker matched every file in the exclusion audit. Gallery-dl and FFmpeg were obtained from the existing private environment, selected separately, and were absent from the installer payload.

| Platform | Media | Saved bytes | Result |
| --- | --- | ---: | --- |
| YouTube | Video, 1080 x 1920 | 20,521,806 | Pass |
| Facebook | Video, 1080 x 1920 | 10,159,322 | Pass |
| Instagram | Video, 1080 x 1920 | 17,295,429 | Pass |
| Discord | Image | 587,272 | Pass |
| TikTok | Video, 1080 x 1920 | 608,142 | Pass |
| Pinterest | Image | 72,579 | Pass |
| X | Image | 230,970 | Pass |

Every case passed creation through Add download, live transfer/progress, file-size and selected-folder checks, built-in decoding, duplicate-new-only skipping and confirmed UI deletion. Video cases also passed play/pause, seek, repeat and persisted volume. YouTube passed the actual UI pause/resume flow. These are the owner's seven disposable links, not a claim of exhaustive provider/account/codec coverage. Target URLs, signed CDN parameters, cookies and account identities are omitted.

The first run passed six complete cases; YouTube downloaded and played but its cleanup locator failed after the driver used direct native pause/resume calls without the UI refresh. The driver now uses the actual UI controls and the catalog title. Its first retest also checked pause state before the asynchronous click handler committed; waiting for the state fixed that driver assertion. A subsequent YouTube-only run passed completely. Original failures are retained, not relabeled as passes.

Evidence: `.cache/live-platform-acceptance/9162ce9e-5c89-4c01-82ea-e75d2f231a88/host-restoration.json` (six passes), `.cache/live-platform-acceptance/2fd4fe41-f52d-4475-9cf7-3bbbbd28a2c7/host-restoration.json` (driver-state timing failure), and `.cache/live-platform-acceptance/8da72429-0a11-499a-ad48-58f47a828c6d/host-restoration.json` (YouTube pass). All three restored original profile hashes/registrations/shortcuts. The merged report accepts only passing per-platform results for the same installer and confirmed restoration: `.cache/release-acceptance/platform-acceptance.json`. Latest review: `.cache/release-acceptance/review-0.2.4/acceptance-review.json`.

Disposable live input files and media were removed after restoration checks; sanitized reports remain. Project license, current-payload redistribution, host installer and live-platform gates pass. Trusted signing remains false; this existing development host is not a clean VM. Immutable 0.2.4 build-time archives retain their original collection-time evidence and driver snapshot; later retest corrections and post-test reports are in the checkout/cache.

## Historical 0.2.3 acceptance

Executed: 8 October 2026 (local); report timestamps are UTC. App: **SavedDesk 0.2.3**, installed from the actual NSIS preview. Installer: **72,871,031 bytes**, SHA-256 **`19fe0a05f0b761ba327ef9a37c865df977ecdc9b237f3fa70377e7013637fced`**, **NotSigned**.

The owner supplied one disposable real media/post link per platform. The test ran on the existing Windows 10 Pro development system using a temporarily isolated catalog, a separate selected save folder, and only existing Windows-protected, platform-scoped approved sessions. Original profiles, file hashes, registrations and shortcuts were restored after every run. Signed Discord query parameters, cookies, target URLs and account identities are omitted from this report.

| Platform | Media | Saved bytes | Final outcome | Viewer evidence |
| --- | --- | ---: | --- | --- |
| youtube | Video | 5,052,970 | Pass | 360 x 640 |
| facebook | Video | 10,159,322 | Pass | 1080 x 1920 |
| instagram | Video | 17,295,429 | Pass | 1080 x 1920 |
| discord | Image | 587,272 | Pass | Built-in viewer decoded image |
| tiktok | Video | 608,142 | Pass | 1080 x 1920 |
| pinterest | Image | 72,579 | Pass | Built-in viewer decoded image |
| x | Image | 230,970 | Pass | Built-in viewer decoded image |

Every platform passed creation through the application download form, live download completion, selected-folder and file-size checks, built-in media decoding, duplicate detection with new-only skipping, and app-confirmed deletion of the disposable saved file. Progress controls were visible and progress events were recorded. Videos passed play/pause, seeking, repeat and persisted volume checks. The image cases are not presented as video-player tests. YouTube also passed live pause/resume.

## Finding and fix

The exact supplied Instagram `/reels/<id>/` URL was rejected before contacting Instagram. Both native and Python boundaries now normalize the plural alias to `/reel/<id>/` while retaining HTTPS, host and path validation. Native and worker regressions cover the alias and invalid targets. The supplied URL passed after rebuilding 0.2.3.

The test driver had two separate mistakes: its initial path comparison omitted Windows extended-length path normalization; its Repeat check toggled off a setting already remembered from the prior video. Corrected checks preserve that preference. Facebook and TikTok were rerun successfully on the same installer; no application Repeat bug or fabricated first-pass success is claimed.

## Evidence and limits

Passing provider runs: `.cache/live-platform-acceptance/e9be8ccd-84ed-474c-84e3-046370969154/` and `.cache/live-platform-acceptance/f6f3ef35-27a1-48dc-83b0-f7832c75f190/`. The merged, hash-bound seven-platform result is `.cache/release-acceptance/platform-acceptance.json`. Host lifecycle report: `.cache/host-acceptance/1b7e0dbc-43c7-4e10-ae6a-e4e6826a92a6/host-windows.json`. Latest release review: `.cache/release-acceptance/review-0.2.3/acceptance-review.json`.

Install, 0.2.0-to-0.2.3 upgrade and uninstall passed using three local transfers and persisted library/settings/player/history checks. This is an existing-host test, not pristine Windows testing. No naturally failing live-provider Retry unfinished items outcome, full collection matrix, all private/region-restricted content, browser-store certification or platform approval is claimed from these seven links. Failed/resumable-item and collection behavior also has separate synthetic regression coverage.

Validation: **148 worker tests**, **58 native tests**, **six release-evidence tests**, **eight checksum entries**, and **four ZIP CRC checks** passed. Source audit found no current findings. Public release remains blocked by FFmpeg linked-library corresponding-source review, gallery-dl/Requests license-combination clarification, and absence of trusted signing. SQLite catalog encryption remains planned.

Immutable release archives retain build-time records. The state-aware Repeat driver correction and post-test documentation/evidence were completed afterward; they are not silently inserted into an earlier source archive. Public publication must use a final committed source and rebuilt/signed, reverified artifacts.
