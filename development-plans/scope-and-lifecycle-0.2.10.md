# Public-platform scope and account lifecycle verification - 0.2.10

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** Recorded binaries/checks remain unchanged. This follow-up expands the guide and removes inactive test payloads; reports/screenshots and immutable review source snapshots are retained.

Start with the [complete installation and user guide](../README.md). See [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

Completed 9 October 2026. The four requested follow-up tasks are complete within the owner's chosen controlled Google lifecycle scope.

## Application changes

Native and preview provider reports now classify Facebook/TikTok/Pinterest private media as excluded. Pinterest is public-links only with no developer-app/OAuth prerequisite; Facebook/TikTok identity remains optional future work. Accounts, Add download and Help no longer promise secret-board, followers-only or general restricted-content downloading. The shared private-content approval prompt is now specific to YouTube account playlists.

Existing browser approvals remain transport for supported public adapters. No universal content-visibility classifier is claimed. Instagram/X authentication and download paths, YouTube Watch Later/Liked preparation, media compatibility, external tools and catalog ownership remain intact. No new provider service, OAuth scope or data processing was enabled.

## Google lifecycle acceptance

The owner explicitly chose controlled revocation tests and preservation of the active grant. Tests exercise the production native controller in disposable directories using real current-user DPAPI and synthetic HTTP responses:

- Expired access credentials refresh, rotate generation and retain stable account identity.
- An omitted refresh token retains the prior one; invalid grants and wrong subjects cannot replace saved credentials.
- One-use callback/state/PKCE checks, timeout/cancellation, concurrent refresh and late-response races pass.
- Local disconnect removes grants without remote traffic; successful and failed remote responses follow their distinct paths.
- Revocation uses the refresh token when available and access token otherwise.
- Media, legacy browser approvals and catalog bytes remain independent of OAuth lifecycle.
- UI confirmation/cancellation, focus, reset and accessibility pass at 760px and 1366px.

Live Google HTTPS checks separately confirmed unauthenticated userinfo 401, invalid grant 400 and invented invalid revocation token 400. No owner credential was sent. This is not a live-owner expiry/refresh or revocation claim. Those are optional further provider tests under the chosen scope. Initial Google sign-in/check and two-video Watch Later remain owner-confirmed.

All seven owner DPAPI files were checksum-verified unchanged before and after native and installer testing.

## Verification results

| Check | Final result |
| --- | --- |
| Worker regression | 155 passed |
| Native default suites | 95 passed; two live-network cases excluded from the default run |
| Explicit Google HTTPS cases | Both excluded cases run separately and passed |
| Packaging unit checks | 13 passed |
| Targeted account/public-scope UI | 7 passed, including accessibility |
| Native app account/setup/restart | 9 checks passed |
| Native external tools | First-run, minimal PATH, recovery and persistence passed |
| Native public platforms | Five public sources, real transfers/catalog, duplicates/repair, MP4 conversion/playback and containment passed with local fixtures |
| Native Instagram/X integration | Verification, DPAPI, carousel, pause/resume including immediate resume, conversion, X text/isolation, Firefox and reload passed |
| Native Watch Later/Liked | Four checks passed, no live YouTube requests |
| Worker exclusion proof | 1,130 payload files / 1,643 frozen modules; no forbidden gallery-dl or FFmpeg payload |
| Notices/source closure | 409 components / 718 notice files / 289 source archives; no missing notices or failed source downloads |
| Source/ignore/version/Markdown audit | Passed; 31 ignore probes, zero findings |

The automated case total is 272; native app scenarios and installer checks are separate. Local fixture transfers are not a renewed live seven-platform matrix. Existing seven-link 0.2.7 live results stay historical.

### Retained initial failures and corrections

The initial native run had an outdated expectation that all unavailable private capabilities use not_implemented; excluded is now the explicit owner-selected classification. The first public-scope UI run exposed the remaining shared private-content prompt and stale frontend text; both were corrected before final builds.

A packaging unit run overlapped worker replacement and read a stale manifest; it passed after the completed worker build. Native pause/resume's five-second startup wait timed out during compilation. Its bounded wait now detects failed jobs and saves pre-teardown diagnostics; the rerun passed. The initial installer smoke stopped at readiness without distinguishing pending from blocked. The final smoke retries only documented startup-pending state, records readiness, and still rejects blocked/missing tools. The unchanged installer passed the rerun.

Logs and failed runs are retained; initial failures are not counted as passes.

## Exact installer lifecycle on this host

The checksum-bound 0.2.10 installer passed:

1. Previous-version installation and three local worker transfers.
2. Upgrade retaining library/settings/sidebar state, volume/mute, history and duplicate detection.
3. External gallery Python and FFmpeg selections preserved and functional with a minimal PATH.
4. Upgraded payload exclusion/source manifest and native public-only provider status.
5. Uninstall removing app binaries and test registrations while retaining catalog/media/tool settings.
6. Fresh installation of the exact current installer after registration removal, with the retained library still usable.
7. Second uninstall preserving media again.
8. Owner profile hashes, registry values, shortcuts and all protected credentials restored.

This is the existing Windows 10 development host, not a clean VM or initially absent-runtime machine. WebView2 and other system runtimes were not uninstalled. The quarantined 0.2.0 installer was used only for guarded local upgrade testing, never cleared for redistribution.

## Final target identity

Debug/release ProductVersion is 0.2.10. Both adjacent worker copies match exactly.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| desktop/src-tauri/target/debug/saveddesk.exe | 18950144 | f14d6b76f6b37cb73f614ebc9c20d72001c506aab1fe99d1b235dd7f086cf0fa |
| desktop/src-tauri/target/release/saveddesk.exe | 14442496 | 1d399a578e0235c71e57497ec90cf6d1cca36cbc5313a71179060fbc2d1144eb |
| desktop/src-tauri/target/release/bundle/nsis/SavedDesk_0.2.10_x64-setup.exe | 262824519 | a19c4f90b2fddec46a2d504d69fdd7fd9e4cf8aeb8e7cf262de816ca65e65790 |

Worker SHA-256: 76de721400797a82026c05787b5f4900c83fe882a0feaf83b8cd2cee4cf130ae.

The final unsigned review set is collected into release-artifacts/v0.2.10 with current original source, notices and dependency-source assets. Historical release sets remain immutable. No repository initialization, GitHub publication, signature or deployment was performed.

## Current completion and future actions

[Owner X endurance](owner-x-endurance.md) records approximately two to three hours and 15-20 GB as owner-reported practical coverage, without invented throughput, item counts or leak metrics.

The immediate scope cleanup, controlled Google lifecycle, target/installer verification and documentation refresh are complete. Git/source publication, policy hosting and Google production branding, trusted signing and browser-store submission retain their schedules. Facebook/TikTok identity is optional; Pinterest OAuth/private work is cancelled. Encryption, portable recovery and automatic updates remain planned.

Strict public-binary release gates remain honest: historical live platform evidence is not rebound to this new installer hash, and the installer is unsigned. A future PublicRelease collection requires valid signing and fresh hash-bound live platform evidence. Current payload licensing/source and host-installer gates pass; review assets are not automatically published.

## Local evidence

- .cache/scope-0.2.10-verification.json
- .cache/scope-0.2.10-native-final.log
- .cache/scope-0.2.10-google-https.log
- .cache/scope-0.2.10-python.log
- .cache/scope-0.2.10-packaging-tests-final.log
- .cache/scope-0.2.10-ui-final.log
- .cache/scope-0.2.10-native-account.log
- .cache/scope-0.2.10-machine/results.json and scope-0.2.10-machine-retry/results.json
- .cache/scope-0.2.10-host-installer-final.log
- .cache/host-acceptance/72b65b54-7489-4922-8fe3-8f0683b22ce8/host-windows.json
- .cache/scope-0.2.10-release.log

Private profiles, tokens, fixture media and diagnostics remain excluded from source/release archives.
