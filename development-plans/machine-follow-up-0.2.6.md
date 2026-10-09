# SavedDesk 0.2.6 machine follow-up

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** This is historical 0.2.6 evidence. Current verification describes 0.2.10 targets. Inactive synthetic profiles/downloads are disposable; measured reports, logs and screenshots remain.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

Completed 8 October 2026 on the owner's existing Windows 10 Pro x64 PC, build 19045, Intel HD Graphics 520 (driver 30.0.101.1338), WebView2 154.0.4258.62. No VM or second physical machine was used. Original profiles, protected sessions, registrations and shortcuts were restored after installed-release testing.

## Requested scope and outcome

| Item | Outcome |
| --- | --- |
| 01: trusted signing | On hold. Installer is unsigned; no substitute publisher identity was created. |
| 02: Git/GitHub and connector stores | On hold. No root Git initialization, publication or store submission. Prepared release scripts remain local. |
| 03: Windows prerequisites, GPU/codecs and broader accounts/content | Expanded and passed within this PC's scope: actual prerequisite inventory, seven controlled NSIS branches, 44 real codec/download/playback cases, isolated account/content fixtures and all seven supplied live links. Other physical systems and real absent-runtime installations remain unverified. |
| 04: encrypted SQLite, portable recovery, automatic updates | Planned only; none implemented in this cycle. |
| 05: Resume refused during worker shutdown | Fixed. One click waits for the old worker to retire, then queues the next generation safely; UI shows Resuming. |
| 06: previews through 0.2.3 | Quarantined outside release-artifacts, original bytes preserved and checked; collection/publishing rejects these versions. |

## Current builds

Version declarations, debug/release executables and adjacent resources are aligned at **0.2.6**. Only the current installer remains in `desktop/src-tauri/target/release/bundle/nsis/`. Historical 0.2.4/0.2.5 review sets retain their original bytes.

| Artifact | SHA-256 |
| --- | --- |
| Installer, 47,591,412 bytes, NotSigned | `bc902bace41a824990476f6f003bafc3c3a65ef1f660aeea63059e70cf24c8b2` |
| Debug app | `b945185cf4ac18d6b5574db732b100d0235e66ef1f5f2abe46f5f3cdfcd1bb3d` |
| Debug native host | `5eb04899183a3e513d4f227e98bb04e4d230accdebdcd639e65c48c90a85c3b7` |
| Release app | `0857dd74eccdd172297034108d1a6e39635860ee93a734cb3a77aef7ed4f4163` |
| Release native host | `6b7a6bc174ccbfee9302d15c3be6457c1aab44689d8181a4acf84ba261274f45` |
| Source/debug/release worker | `27870eba0ec109d9853f63c166acd793c4c6a97a08a1b7b7b914bb6e89d60d1e` |

Installer: `desktop/src-tauri/target/release/bundle/nsis/SavedDesk_0.2.6_x64-setup.exe`. Collected unsigned review set: `release-artifacts/v0.2.6/`. These are development review assets, not a signed public release.

## Verification

| Check | Passed |
| --- | ---: |
| Worker unit/integration cases, including frozen-worker cases | 154 |
| Rust cases: application 55, native host eight | 63 |
| Packaging, exclusions, release gates and quarantine | 13 |
| Browser connector | 12 |
| Complete production-interface suite | 75 |
| Unique automated cases above | **317** |
| Real desktop scenarios | **15** |
| Real codec/download/conversion/WebView playback combinations | **44** |
| Controlled execution of generated NSIS prerequisite branches | **7** |
| Installed-release host lifecycle checks | **9** |
| Installed-release live platforms | **7** |

TypeScript, production frontend, release/debug builds and the complete payload audits also passed. Thirteen packaged-only cases were rerun against the final worker; repeated checks are not added to 317. Source/debug/release workers contain 1,130 reviewed files and 1,643 frozen modules. No gallery-dl, imageio-ffmpeg, FFmpeg/FFprobe binary or obsolete nested worker is shipped. Inventory: 408 components, 717 notice records, zero missing; 289 dependency source archives, zero acquisition failures.

Evidence roots: `.cache/machine-native-accepted-0.2.6.json`, `.cache/machine-codecs-accepted-0.2.6.json`, `.cache/machine-prerequisites-0.2.6.json`, `.cache/machine-release-acceptance-0.2.6/`. Failed attempts remain separate from accepted evidence.

## Resume repair

Native Resume/Retry waits off the async executor for the previous registered worker generation to finish stopping. Registration and the resumable-state SQL transition share the active-worker lock. The transition cannot restart a deleted, cancelled, queued or already-running job. Worker completion updates only a still-running row, preventing it from overwriting a pause/cancel decision. A 30-second exceptional shutdown timeout produces actionable feedback while preserving files.

Three Rust regressions cover delayed retirement, cancellation during the wait, and running/deleted jobs. The real native app acknowledged an immediate stop-then-resume request in **134 ms**, with one Resume call and both carousel assets saved. The installed live YouTube UI also accepted one Pause/Resume click and completed. No artificial user retry or fixed pre-resume sleep remains in the drivers. Evidence: `.cache/native-live/f9582bec-dbde-45c0-9932-97feaa81222c/resume-acceptance.json`.

## Codec and rendering coverage

Eleven generated inputs were downloaded through the frozen worker and the selected external gallery process: H.264/AAC, silent H.264, H.264/Opus MKV, VP9/Opus WebM, AV1/Opus MKV, HEVC/AAC, 10-bit H.264, 4:4:4 H.264, MJPEG/PCM AVI, H.264 MOV and H.264 M4V. Each ran with automatic and forced-software encoding, under default and GPU-disabled WebView rendering: **44 cases**.

The matrix exposed a real classification omission: MOV/M4V/AVI were accepted but classified as images in gallery metadata. They now enter video finalization; an Instagram/X regression covers all six accepted video container suffixes. Every final output rendered actual nonblank pixels in an on-screen WebView video. Compatible MP4 bytes remained unchanged; conversions/remuxes left only the compatible MP4, without incompatible originals. Existing preview caches are allowed.

The physical Intel encoder successfully used `h264_qsv`; software used `libx264`. These short fixtures validate compatibility/fallback, not ten-minute conversion performance or NVIDIA/AMD hardware. Completed compatible MP4s still opened after external tools were cleared with a controlled minimal PATH. Existing WindowsApps FFmpeg is a supported PATH fallback; tests remove that fallback when checking genuinely missing tools.

Compatible MP4 readiness had an **8.4 ms median**. This measures the bounded native readiness API, not total video decode/conversion. All six fullscreen transition paths passed with animated frames, no scroll overflow or renderer errors.

## Prerequisites and installer lifecycle

Actual Windows x64/WebView registration and bundled CPython/VC runtime files passed checks. Seven tiny isolated installers execute the generated NSIS WebView branch with controlled registry/download/process results: machine runtime present, user runtime present, successful bootstrap, network failure, bootstrap failure, upgrade with runtime present and upgrade without runtime. Failure paths abort; the upgrade-absent case records the upstream skip behavior. These are controlled branch tests, not actual removal/reinstallation of system WebView or VC runtimes.

Evidence: `.cache/installer-prerequisites/6cce7a8e-540d-4afd-9e1a-00af57fa529f/acceptance.json`. No system runtime was uninstalled or registry result falsified outside the isolated harness.

The real installer was installed from quarantined 0.2.0, upgraded to the exact final 0.2.6 hash, launched with a minimal PATH/no development Python overrides and uninstalled. The spaced installation path, library/history/duplicate detection/settings/volume/media, external-tool selections and notices/connector were verified. Uninstall removed binaries/registration and kept user data. Original profile hashes, registry values and shortcuts were restored. Evidence: `.cache/host-acceptance/e885aefb-56a4-438e-94e5-a7654b2000fb/host-windows.json`.

## Accounts, content and live platforms

Isolated tests cover platform-scoped approvals, Firefox and actual Chrome connector messaging, synthetic private account data, carousel/mixed-media downloads, account isolation, unavailable/failed items, retries, selected-folder confinement, relinking, progress, skip/repeat, single/batch/collection deletion and playback preferences. A damaged-video collection retained three successful assets; retry fetched only the unfinished item and ended with four saved and zero failed, without changing valid H.264 bytes or expiring the synthetic account. These fixtures do not establish arbitrary private real-provider account access.

The same installed 0.2.6 bytes passed all seven owner-supplied disposable links. Videos also passed play/pause, seeking, repeat and persisted volume; images decoded in the built-in viewer. All passed live progress, selected-folder/catalog-size checks, duplicate skipping and confirmed deletion.

| Platform | Saved bytes | Media |
| --- | ---: | --- |
| YouTube | 20,521,806 | 1080 x 1920 video |
| Facebook | 10,159,322 | 1080 x 1920 video |
| Instagram | 17,295,429 | 1080 x 1920 video |
| Discord | 587,272 | Image |
| TikTok | 608,142 | 1080 x 1920 video |
| Pinterest | 72,579 | Image |
| X | 230,970 | Image |

The initial YouTube attempt accepted one Resume click but failed after 10,332,691 transfer bytes. A scoped diagnostic using a clone of those partial bytes completed and recorded HTTP 429 during the transfer; the subsequent installed-app retest passed fully, without source changes or account reconnects. This supports a provider interruption for that attempt, not a guarantee against future throttling. Initial failed evidence is preserved, not relabeled. The merged acceptance admits only passing cases with the identical installer hash and confirmed owner restoration.

Evidence: `.cache/live-platform-acceptance/7adea833-7b63-4eca-9eec-51b7fd551f1f/` (six passes/initial YouTube failure), `.cache/youtube-transfer-diagnostic/108e268f-df63-48f4-8b3b-98012b6c542e/diagnostic.json`, `.cache/live-platform-acceptance/a887c8f1-0033-4985-8ff9-5db8c40d25a8/` (YouTube pass), `.cache/machine-release-acceptance-0.2.6/platform-acceptance.json` (accepted same-build results). No URLs, signed CDN parameters, cookie values or account identities are included in these reports.

## Historical quarantine and release gates

Original review sets v0.2.0 through v0.2.3 were moved to `.cache/quarantined-releases/`, with `DO-NOT-PUBLISH.txt` and a hash inventory. Checksums before/after match; their original release-artifacts folders are absent. Old bytes remain available only for historical host-upgrade tests. `packaging/release-quarantine.py` rejects traversal/reparsepoints/changed checksums and blocks collection of versions through 0.2.3. Prepared workflow uploads only its selected matching release tag and rejects forbidden historical versions. No remote publication occurred.

Current gates: historical policy, original MIT license, actual-payload redistribution/source review, host installer lifecycle and seven live platforms **pass**. Trusted signing **fails as expected while on hold**; public_release_ready is false. Current licensing architecture remains unchanged: independently acquired external gallery Python and FFmpeg are required, and are not redistributed. See [external-tool setup](licensing-and-external-tools.md).

## Remaining limits and held work

Other Windows versions, other physical GPUs/drivers, real missing-runtime bootstrap/offline behavior, exhaustive private account/content variants, mixed-DPI/monitor changes and long-duration soak/performance remain unverified. GPU-disabled rendering and controlled installer faults expand this host's coverage; they do not simulate all other machines. No additional functional regression remains reproduced in the accepted 0.2.6 matrix.

Signing/timestamp verification and Git/GitHub/browser-store delivery are on hold at the owner's request. Encrypted SQLite, portable recovery and automatic updates remain planned. This cycle does not erase the other undelivered requirements in [Plan 02](development-plan-02.md).

## Reproduction

Use the existing commands in [machine acceptance](machine-acceptance.md), plus the new codec scenario in `packaging/test-machine.py`. `packaging/test-machine-prerequisites.ps1` inventories this host; `packaging/test-installer-prerequisites.py` executes controlled NSIS branch cases. `packaging/release-quarantine.py --verify` checks preserved historical bytes. Guarded host/live installer harnesses require a closed app, a hash-verified candidate, protected inputs and restoration checks. External tools used by tests are private development prerequisites and are never added to the installer.
