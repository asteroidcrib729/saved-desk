# Offline runtime, private collections and sustained testing - 0.2.7

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** This retains historical 0.2.7 measurements. Owner X endurance is separate practical multi-hour evidence; current 0.2.10 installer acceptance is independent.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

Updated 8 October 2026. Trusted signing follows source publication; Git/GitHub publication and browser-store delivery have not been performed. Encrypted SQLite, portable recovery and application automatic updates remain planned, not implemented.

## Runtime repair

The installer embeds Microsoft's unmodified, Authenticode-verified x64 WebView2 offline installer. A custom prerequisite hook runs before both fresh installation and `/UPDATE` upgrades; the upstream section is deliberately disabled because it skips prerequisites during upgrades. Machine and current-user runtime registrations are checked. Empty registrations and `0.0.0.0` trigger installation; usable existing registrations are reused. The child exit code is checked and registration is verified afterward, including the observed already-installed result. Failure stops setup before replacing the application.

`packaging/prepare-webview-runtime.ps1` retrieves the official package, verifies its signature and records its hash. Microsoft terms are included verbatim in installer terms and distribution notices; this runtime remains a separate proprietary redistributable. SavedDesk remains MIT. Gallery-dl and FFmpeg remain external user-installed tools and are excluded from the distributed worker.

Thirteen controlled NSIS cases passed, covering machine/user detection, zero versions, upgrade repair, child startup/failure, success without registration, restart codes and already-installed outcomes. A QA wrapper also extracted and executed the real signed offline package after forcing only its initial detection to missing, then successfully verified the real existing runtime. This does not establish installation on a machine initially lacking WebView2; the shared system runtime was not removed.

Official guidance: [Microsoft runtime distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution), [Microsoft runtime terms](https://developer.microsoft.com/microsoft-edge/api/eula/webview2?locale=en-us).

## Authorized account scope

The initial live private-content attempts were limited to the supplied Instagram collection and YouTube playlist. The owner later deferred private YouTube testing and requested public YouTube coverage only for now. Other live providers use only the previously supplied public links. X bookmarks and private/protected content on other providers are not included. This scope follows the owner's instructions and does not represent approval of untested account/content variants.

All **90 cases** in the synthetic native account matrix passed across six session-enabled platforms and their defined credential boundaries. Wrong nonces, all cross-platform approvals, unrelated cookie domains, replay, valid authenticated downloads, missing/corrupted sessions, catalog/session binding, expired state, account changes after preparation and disconnect preservation are checked using isolated profiles and local media. Connector receipt acknowledgement is asynchronous: final verification state and protected-session storage determine acceptance.

## Sustained testing

The native harness combines a fifteen-minute H.264/AAC video on repeat, fullscreen transitions, six batches of two hundred local media assets, pause/resume and two owned-process restarts over thirty minutes. Metrics cover the app's process tree, decoded playback, catalog integrity, command latency and memory growth. Synthetic media and accounts avoid sustained real-provider polling. Failed attempts are retained separately; no partial run is marked passed. Fixtures now freeze their own application/resource copies so Cargo/Tauri staging cannot alter a running test. Installer guards exempt only frozen soak workers whose exact UUID fixture path and app ancestry are verified; normal owner-app processes still block installation tests.

The first installer attempt exposed a hook include-order defect: Tauri defines its runtime GUID after including custom hooks. The hook now defines its own GUID before use. Controlled wrappers no longer predefine the upstream GUID. That rejected installer attempt restored owner profiles and is retained with its checksum; it is not an accepted release. The corrected installer checksum and completed acceptance measurements are recorded below.

## Completed installed checks and private findings

Corrected installer: **261,856,782 bytes**, SHA-256 **`e9b54924c2c837a68bb38841ded23db3d96f9be313efe185e3c1f6ee46e7803f`**, unsigned. Fresh install, upgrade from 0.2.0, minimal-path worker operation, external-tool function, retained media/settings/history/volume and uninstall passed. Original profile hashes, registrations and shortcuts were restored. This is existing-host acceptance, not a pristine Windows test.

The supplied Instagram collection was rejected before download because its URL username differs from the connected account. The private YouTube playlist failed; a single metadata-only diagnostic identified expired saved cookies and a playlist-not-found response. No private collection is marked passed. The owner subsequently restricted YouTube to public testing for now; no YouTube reconnection is required for this round. The owner subsequently deferred this private Instagram collection too; no Instagram reconnection is required for this round. Other live private providers were not requested and are not certified.

The first frozen soak reached ten minutes and recovered its native process, but its driver reopened a newer image row instead of the older test video. Library order follows post IDs. The corrected driver searches for its exact video caption after restart. That failed run is retained; the complete corrected run passed.

All **seven supplied public links** passed on the same corrected installer: YouTube, Facebook, Discord, Instagram, Pinterest, TikTok and X. Live progress, built-in decoding/playback, pause/resume where exercised, duplicate skipping, selected-folder/catalog size checks and confirmed disposable deletion were checked. Original profiles and registrations were restored. Private-account acceptance remains deferred rather than inferred from public success.

## Evidence locations

- Current regressions: `.cache/runtime-regressions-0.2.7.log`, `.cache/runtime-check-retry-0.2.7.log`, `.cache/runtime-connector-0.2.7.log`, `.cache/runtime-ui-0.2.7.log` (317 cases).
- Synthetic account matrix: `.cache/native-private-account-matrix/2827b1ab-d6ce-4f1b-94e5-fdf683c5bf6d/acceptance.json` (90 cases).
- Production-order runtime policy: `.cache/installer-runtime-policy/4d5f539b-dda3-428a-8d4a-46a706055b06/acceptance.json` (13 cases).
- Real offline child handoff: `.cache/offline-runtime-host/003cfcac-2750-4fde-aded-983547e85e1f/acceptance.json`.
- Corrected installer lifecycle: `.cache/host-acceptance/4a152beb-20e1-45e5-9381-273f55c352f5/host-windows.json`.
- Same-installer public links and restoration: `.cache/live-platform-acceptance/091d7561-7275-471e-ba8d-4171e8198506/`.
- Deferred private attempts: `.cache/live-platform-acceptance/a3d1e1af-7074-418a-a278-d5237a235c22/` and `.cache/private-youtube-diagnostic-0.2.7.json` (failed, not certified).
- Rejected original hook candidate: `.cache/rejected-candidates/runtime-hook-0.2.7/`; failed installation restoration: `.cache/live-platform-acceptance/729f6889-eb83-44b0-b49c-810bf5fa85f4/`.

Disposable protected URL envelopes were removed after restoration. Synthetic profiles/media are removed after the completed native run; sanitized evidence is retained. No owner sessions, library files or history are deleted.

## Completed thirty-minute performance test

The corrected frozen native **0.2.7** run passed for **1,800 seconds**. It saved all **1,200 synthetic gallery assets**, preserved catalog integrity, completed **two owned-process restarts**, **five pause/resume or recovery actions**, and **60 fullscreen cycles**. The fifteen-minute H.264/AAC video on repeat advanced for **1,788 seconds**. There were no item failures or renderer/playback errors.

Across **1,606 command samples**, snapshot latency at the 95th percentile was **31 ms**. Maximum aggregate app-process-tree working set was **659 MB**; after transfer completion it settled near 534 MB. Final uninterrupted-process private-memory growth was **5.51 MB**, comparing the first and last eight samples after the second restart. This avoids treating process restarts as evidence of memory improvement. The earlier whole-run private-memory comparison includes different process generations and is not used as a leak conclusion.

This measures one native debug application on the existing Windows 10/Intel HD Graphics 520 host, with local synthetic private accounts/media, controlled transfer delays, and a long real decoded video. It does not certify every physical GPU, network condition, real private provider or multi-hour workload. Release installation and real public-provider acceptance use the exact installer checksum recorded above.

Evidence: `.cache/native-soak/e5a61301-21fa-4f10-8d27-a9891ed69b16/acceptance.json` and `steady-memory-analysis.json`. App SHA-256 **`4279a6589d3682b65f2708829438f7e8521faad8b376cbeaff87ff543e5318c8`** matches the current debug target. The release app SHA-256 is **`6657afc3c4f0ce8a42440da439ee5225d9d1fda422d6e59d3ede6f37765e47b4`**. Worker payload audits passed for both targets. Only the current 0.2.7 installer remains in the generated NSIS target directory; historical 0.2.6 bytes remain in their immutable archive.

## Owner-selected scope and next steps

- Further Windows/GPU coverage is outside this cycle and is not a current issue.
- The owner will test private content manually and report failures. The recorded private attempts remain failed/deferred; they are not claimed as passes.
- SavedDesk requires WebView2. Its installer supplies the official offline runtime package. Testing on another machine initially lacking WebView2 and extending the successful thirty-minute test to multiple hours are optional further assurance, not source-publication blockers.
- Source publication can precede signing. Signing is deferred until after publication; the current installer remains unsigned. Git/GitHub publication and browser-store submission have not been performed.
- Encrypted SQLite, portable recovery and automatic application updates remain future planned work.

Review assets are collected in `release-artifacts/v0.2.7/`; they remain unsigned review assets. Source, notices and dependency-source archives accompany the installer. No earlier rejected or quarantined candidate inherits this build's acceptance. The original-source ZIP is an immutable build-time snapshot; later Markdown changes are in the working source tree. See [publication scope and cleanup](publication-scope-and-cleanup.md).
