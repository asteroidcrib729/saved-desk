# Development plan 06 — Store functionality remediation (0.2.11)

Date: 15 October 2026. Supersedes the FFmpeg exclusion and first-run/connector assumptions in plans 04–05 and the 0.2.4–0.2.10 external-tools design. Original SavedDesk code remains MIT.

## Certification findings and acceptance boundary

Microsoft reported unusable downloads and account connection on Windows 11: video preparation always requested an unconfigured FFmpeg executable, and website sign-in never completed the companion-extension approval. Archive integrity, identity and packaging success did not establish first-run functionality.

Work must preserve the owner's account grants, catalog, media and existing external-tool overrides. Private content tests remain owner-managed. Further Windows/GPU/VM coverage remains outside this cycle. No Store approval or trusted signature is implied by local checks.

## Implementation

1. Build standalone FFmpeg 9.0.2, libx264 and dav1d 1.5.3 from exact pinned source, independently of the frozen worker. Verify the official FFmpeg release signature. Include FFprobe, GPL license texts, MinGW and GCC runtime notices, exact source archives, effective configuration and build recipe. Disable nonfree components and automatic external-library detection; use Windows SChannel for network TLS without adding an external TLS library. The bundled baseline uses libx264 software encoding; existing user-selected FFmpeg hardware builds remain supported. Include software AV1 decoding without a separate Windows codec installation. Maintain current libx264 presets and compatible-stream copying.
2. Gate packaging and licensing on the complete media payload and corresponding sources. Never allow a general exception for arbitrary FFmpeg executables in the frozen worker. Keep rejected historical binaries quarantined/unpublished.
3. Automatically discover the included media executables from the installed resource folder. Preserve deliberate user overrides; never persist a version-specific WindowsApps path as an automatic override.
4. Keep gallery-dl out of the app distribution. Add an explicit-consent setup that downloads a separate pinned Python runtime and universal package archives directly from Python.org/PyPI into the user's local tools folder. Verify sizes/hashes before extraction, reject unsafe archive paths, check actual package versions, promote only a verified installation and save its path atomically. Transient publisher connection failures receive at most three attempts with a fresh partial-file reset and bounded backoff; integrity/source failures are never retried. Failure preserves existing configuration. No system Python, pip command or manual executable selection is needed for this route.
5. Preflight required tools before creating download jobs. Known Discord image attachments can remain usable without video processing.
6. Export the companion extension into a verified ordinary user-readable folder outside WindowsApps. Continue using the separately hash-verified native-host copy.
7. Require a current protected extension/native-host handshake before waiting for browser account approval. Bind the receipt to browser family, extension/app version, native-host hash and time. Probe/checking never reads cookies. Keep per-platform nonce validation and explicit browser permission. Return the app to the foreground after actual successful verification; provide finite timeout and cancellation recovery.
8. Keep public links independent of account login. Move optional developer-configured Google identity into advanced disclosure; it does not authorize browser-session downloads.
9. Document the dependency requirement prominently in the Store listing and certification notes. Published extension delivery remains a separate browser-store submission; the guided unpacked/temporary route must be described honestly until approvals exist.

## Verification

- Hash-pinned live gallery setup in an isolated folder passed in 175.55 seconds; actual startup/version probe passed.
- Ten gallery setup integrity/recovery tests passed, including original ZIP-name checks for Windows normalization, traversal, duplicate entries, download hashes and preservation of an existing tool installation.
- Fourteen connector tests passed, including a probe with no pending account request and a failed probe that requests no cookies or permissions.
- Updated frozen worker exclusion/owned-source audit passed: 1,175 payload files, 1,644 frozen modules, zero findings.
- Full backend suite after transient-download recovery: 165 passed. Packaging suite: 43 passed. Native library: 95 passed, two live Google tests intentionally ignored to preserve the owner grant; the app and native-host test executables also returned success.
- Final production frontend build and TypeScript check passed. Complete final UI/accessibility suite: 85 passed in 7.2 minutes.
- Eleven real media cases passed: compatible H.264/AAC and silent H.264 retained byte-for-byte; H.264/Opus, VP9/Opus, AV1/Opus, HEVC/AAC, 10-bit H.264, 4:4:4 H.264, MJPEG/PCM, MOV and M4V produced one compatible MP4, with incompatible sources removed. Both media executables are x64 and require only Windows system DLLs.
- Final retry-hardened Store archive verified: all 2,213 non-manifest application/resource files match the actual locally signed preview byte-for-byte. Only identity and resulting signature/package metadata differ.
- Installed acceptance passed on this existing Windows host with an empty isolated profile, registered Start-menu activation and a minimal PATH: included video tools, three local transfers, public YouTube download before account/gallery setup, visible left-click video playback, explicit-consent gallery acquisition/version checks, external native-host probe, approval start/cancellation without reading account cookies, upgrade retaining library/settings/volume/history/duplicate detection/tools, and removal retaining media while removing owned connector registration.
- Original profile hashes and browser registrations were restored. Temporary machine certificate trust was removed and the app-scoped debugging setting restored. Private sessions and the existing Google grant were not used or revoked.
- Earlier attempts exposed harness races (startup probe and asynchronous cancellation), a hidden-autoplay assumption and a test-created Explorer handle; these were corrected. A transient publisher timeout prompted bounded downloader retries and a fresh rebuilt-package lifecycle test. Failed attempts remain private diagnostics rather than acceptance.
- Final Store MSIX SHA-256: 5d83541361faab502d2c1505383ddf8f16d020b5b528d5f5117d13adb6e1fb56. Matching host-acceptance.json, archive verification, checksums and source/notice companions: release-artifacts/msix/0.2.11.0-store-resubmission.
- Microsoft signing/certification and browser-store approval remain external publication steps. Browser approval coverage here is controlled; no full live private-account sign-in success is claimed.

## Resubmission material

Prepare a new 0.2.11.0 Store-identity MSIX and checksum/source/notice companions; preserve 0.2.10 artifacts as historical evidence. Provide reviewers a public-link download example requiring no account, exact gallery setup and extension approval steps, and expected success/error behavior. Describe the tested host/profile and distinguish controlled account-response tests from live private-account evidence. Upload only the reviewed Store-identity unsigned MSIX; Microsoft handles Store signing and certification.

## Media build references

The exact source/assembler/compiler/build-tool URLs and hashes are recorded in packaging/media-tools/sources.json. AV1 decoding follows the upstream [dav1d build instructions](https://github.com/videolan/dav1d/blob/1.5.3/README.md); its source is pinned to the [official VideoLAN release](https://downloads.videolan.org/pub/videolan/dav1d/1.5.3/). These are build-time references, not additional end-user setup steps.

## Workflow follow-up

[Development plan 07](development-plan-07.md) covers repeatable branch/tag EXE and MSIX workflow execution. Its workflow evidence is separate from the installed-app acceptance recorded above.
