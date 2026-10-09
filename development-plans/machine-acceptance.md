# Machine acceptance

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** The exact 0.2.10 installer passed host installation, upgrade and uninstall. Older runs remain historical. Additional Windows/GPU/VM coverage is outside this cycle.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

## Historical 0.2.7 follow-up

Offline WebView2 setup covers fresh installation and upgrades. The corrected installer passed the owner-authorized host lifecycle; 317 regression cases, 90 synthetic account cases and 13 controlled runtime cases passed. All seven supplied public links and the thirty-minute native test also passed. The owner will conduct further private-content testing manually. Full results are recorded in [current evidence](runtime-private-and-soak-0.2.7.md). Source publication is a separate next action, signing follows it, and encryption/recovery/application updates remain planned.

## Historical 0.2.6 verification (8 October 2026)

**317 automated cases, 15 desktop scenarios, 44 codec/playback combinations, seven controlled NSIS prerequisite cases, host installer lifecycle and all seven supplied live links passed.** Resume now waits safely for worker shutdown with one click. Gallery MOV/M4V/AVI inputs enter video finalization. Previews through 0.2.3 are hash-preserved in ignored quarantine and blocked from collection/publication. Debug/release targets and the unsigned installer are current.

Installer: **47,591,412 bytes**, SHA-256 **`bc902bace41a824990476f6f003bafc3c3a65ef1f660aeea63059e70cf24c8b2`**. Review set: `release-artifacts/v0.2.6/`. [Full follow-up report](machine-follow-up-0.2.6.md) distinguishes real host/live tests from controlled prerequisite cases and retained failures. Signing and Git/GitHub/browser-store delivery are on hold; encrypted SQLite, portable recovery and automatic updates remain planned. Other physical Windows/GPU and actual absent-runtime installations remain unverified. The 0.2.5 and earlier records below are historical.

## Historical 0.2.5 machine acceptance

Completed 8 October 2026 on the owner-authorized Windows 10 Pro x64 host (build 19045, four logical processors). No VM was used. Original app profiles, protected sessions, registrations and shortcuts were restored and their recorded hashes matched.

Debug and release targets are refreshed to **0.2.5**. Installer: `desktop/src-tauri/target/release/bundle/nsis/SavedDesk_0.2.5_x64-setup.exe`, **47,576,177 bytes**, SHA-256 **`aa5d1519d0a5001254de34c306f9a20ad6bbf2473820403c3d28888e78cb05c5`**, **NotSigned**. The collected preview is `release-artifacts/v0.2.5/`.

## Build repair

The initial full target audit found an obsolete nested debug worker and stale gallery/imageio files in the release worker staging tree. The distribution worker source was already clean. Build staging now removes only known generated resource directories, rejects reparse points, stages current notices for the standalone debug app, and verifies every final worker file against the exclusion/source manifest. Old preview installers are retained as historical evidence and do not inherit clearance.

## Verified results

| Verification | Result |
| --- | --- |
| Complete worker regressions, including actual frozen worker | 153 passed; 13 packaged-worker cases also passed in a separate final-payload run |
| Native Rust unit tests | 60 passed: 52 application and eight native-host cases |
| Packaging/exclusion and release-evidence tests | Nine passed |
| Browser connector permission/session tests | 12 passed |
| Full production-interface regressions and accessibility/layout audits | 75 passed on the final rebuilt interface |
| TypeScript, production frontend, release and standalone debug builds | Passed |
| Real desktop acceptance | All 14 scenarios passed; exact executable hashes retained |
| Installer lifecycle | Verified 0.2.0 install, 0.2.5 upgrade and uninstall from a path containing spaces |
| Installed app without developer environment | Minimal Windows PATH and no inherited Python/tool overrides; selected external tools worked |
| Live providers | All seven supplied links passed on the installed 0.2.5 candidate |
| Final resource trees | Source/debug/release workers each contain 1,130 reviewed files and 1,643 frozen modules; obsolete nested debug resources removed |
| Notices and source review | 408 inventory components, 717 notice records, zero missing notices; 289 source archives, zero acquisition failures |

These are **309 automated test cases plus 14 desktop scenarios**, with separate installer/live acceptance. Repeated runs are not added to that test-case count. Source, debug and release workers have matching SHA-256 `471fcfc4bed1b54ac51234d27dbfd4eb2e851a9716549f72400e51afd43c8704`. The complete exclusion manifest additionally verifies owned adapter sources and rejects unreviewed extra files.

Desktop scenarios cover missing/invalid/cleared/persisted external tools, corrupted configuration recovery, busy-queue protection, scoped account approvals and Firefox, real Chrome extension messaging, local media transfers, progress, pause/resume, skip/repeat, failed-item-only recovery, MP4 preparation before completion, incompatible-original removal, playback/seek/repeat/volume, fullscreen transitions, moved-file repair, selected-folder isolation, post/collection/batch deletion, sidebar/preferences and advanced settings. Compatible-video readiness had a **6.5 ms median** over ten native checks (5.8-8.4 ms); this measures the readiness API, not total browser decode time or arbitrary video conversion.

The host lifecycle preserved sample library/history/settings/player preferences and external-tool selections. The upgraded installed app successfully probed gallery, FFmpeg and YouTube tools despite the stripped developer environment. Uninstall removed app binaries and its registration while retaining the temporary user catalog/media/tool configuration; owner state was then restored.

| Live platform | Saved bytes | Built-in viewing |
| --- | ---: | --- |
| YouTube | 20,521,806 | 1080 x 1920 video, 67.76 seconds |
| Facebook | 10,159,322 | 1080 x 1920 video |
| Instagram | 17,295,429 | 1080 x 1920 video |
| Discord | 587,272 | Image |
| TikTok | 608,142 | 1080 x 1920 video |
| Pinterest | 72,579 | Image |
| X | 230,970 | Image |

All accepted live cases showed progress, completed through the app's form, stayed in the selected folder, matched catalog file counts/bytes, retained no incompatible original, skipped duplicate transfers and passed confirmed deletion. Video cases also played, paused, sought, repeated and persisted volume. YouTube also exercised the actual Pause and Resume controls. These are the supplied posts, not every content type or account setting on each platform.

Two initial driver failures are retained. The old smoke selector matched both search and job live regions; it now scopes the job announcement and passes. The initial YouTube run timed out during control handling with the job paused; its driver now waits for resume acknowledgement and handles only the explicit worker-stopping response, rather than assuming shutdown finishes after 750 ms. A targeted YouTube rerun passed on the same installer. No failed record was edited into a pass, and no provider failure was hidden by automatic reconnects.

## Evidence

Sanitized machine summary: `.cache/machine-acceptance-0.2.5.json`. Native matching-build summary: `.cache/machine-native-accepted-0.2.5.json`; original attempt and recheck reports remain beside it. Installer evidence: `.cache/host-acceptance/321a359d-2c86-41f5-b58e-e1dde13e267d/host-windows.json`. Live original/retest reports: `.cache/live-platform-acceptance/57df4efd-7722-4d49-a50c-117cdab283ac/host-restoration.json` and `.cache/live-platform-acceptance/fa28c194-d2b7-49d1-b816-601156afea22/host-restoration.json`. Accepted matching-installer evidence and gate review: `.cache/machine-release-acceptance-0.2.5/`.

The final gate review passes original license, current-payload redistribution, host installer and live providers. **Trusted signing remains false**, so public binary release readiness remains false. Protected test inputs and disposable host/live media are removed after restoration verification; actual owner media and sessions are retained.

## Remaining work

- Provision a trusted publisher signing identity/service, sign and timestamp all owned executables and installer, verify trust, and repeat acceptance for that signed installer hash. This host has no usable configured identity.
- Complete browser-store connector packaging/review. Current delivery uses documented unpacked/temporary extension setup.
- Initialize and commit the audited source, configure the intended GitHub remote and run the release workflow there. This project currently has no root Git repository or remote.
- Other Windows/prerequisite/GPU/codec and broader provider/account coverage remains unverified. This cycle deliberately uses this PC; no VM setup is requested. WebView2 and system runtimes already exist here, so their absent-prerequisite/bootstrap behavior is not proven.
- New installations require separately installed and selected gallery Python and FFmpeg. This is the distribution architecture, not an omitted bundled dependency. Tests confirm setup and recovery; keep the setup guide with releases.
- Automatic updates and encrypted SQLite/portable recovery remain planned features. The current catalog/media are unencrypted; account sessions use Windows-user protection.
- Immediate Resume can be refused while a stopped worker is still exiting. The safe guard remains; automatically waiting or disabling Resume until shutdown finishes is a usability refinement.
- Do not distribute previews through 0.2.3, which still contain the unresolved older bundled tools. Their existence as local historical artifacts is not clearance.

No additional functional regression remains reproduced in the tested 0.2.5 matrix. External-tool prerequisites and the limits below still apply.

## Reproduction

Run from the project root after installing development prerequisites:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests
.\.venv\Scripts\python.exe -m unittest discover -s packaging/tests
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/build-desktop.ps1 -Check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/build-desktop.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/build-desktop.ps1 -Prototype
.\.venv\Scripts\python.exe packaging/test-machine.py
```

The machine runner uses isolated app/WebView profiles, sequential real desktop scenarios and owned process-tree cleanup. Actual browser approval testing additionally uses `--tests chrome-approval` and requires the existing Chrome native-host registration. Test prerequisites include Node and the private development FFmpeg/gallery environment; this environment is not included in the installer.

The guarded host/live installer harnesses park and restore existing app profiles, compare original hashes, restore registry values and retain sanitized reports. Run them only while SavedDesk is closed, with a verified candidate installer and manifest. Live inputs must be DPAPI-protected; do not write account cookies or signed media URLs into Git. Source/native fixtures do not replace installed-release live acceptance.

## Limits

Testing this host does not establish behavior on an unprepared Windows installation, another GPU/codec combination or every provider/account variant. No system prerequisites are uninstalled to simulate a clean machine. Signing requires a real publisher identity; no self-signed certificate is substituted.
