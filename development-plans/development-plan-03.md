# Development Plan 03: distribution without unresolved bundled tools

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** External-tool distribution, current notices/source closure and exact 0.2.10 host installer checks pass. Old previews remain quarantined; signing and publication follow their agreed schedule.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

**0.2.7 follow-up:** Offline WebView2 setup now covers fresh installs and upgrades; private collections and sustained native tests are recorded in [runtime and performance evidence](runtime-private-and-soak-0.2.7.md). Private-content testing is owner-managed; optional testing is outside the current publication scope, signing follows source publication, and future features remain planned.

This cycle addresses licensing architecture, external-tool setup and verification for SavedDesk 0.2.7. Plan 02 feature/security work remains separate; encrypted SQLite is still pending.

- Keep original source, documentation and branding MIT.
- Exclude gallery-dl/imageio-ffmpeg/FFmpeg from shipped binaries instead of relabeling them.
- Preserve gallery downloads, Instagram/X authentication, scoped decisions and private session handling through a user-selected Python environment.
- Select FFmpeg separately through Settings; persist paths outside the catalog and repository.
- Audit frozen modules, complete file payload and owned adapter source; reject stale proof.
- Remove obsolete installation-owned dependencies on upgrade and compare installed files with the audited manifest.
- Record notices and sources for the actual remaining distribution; keep old previews explicitly blocked.
- Validate source/native/external-process tests, new packaging, host lifecycle and disposable live links. Keep signing and clean-machine limits explicit.

Architecture, exact user setup and verification are described in [licensing and external tools](licensing-and-external-tools.md). Current test results belong in [implementation progress](implementation-progress.md) and [artifact details](development-artifact.md), with installer-bound evidence kept outside Git.

Completed verification: archive/file/source exclusions, current notices/source records, old-payload removal on host upgrade, seven supplied live links, isolated native external-gallery integration and original-profile restoration. Original code remains MIT. Trusted signing is unavailable; a clean-machine test has not been performed. Old binary previews remain uncleared.

The 0.2.5 verification cycle repairs stale target staging and adds repeatable, isolated machine acceptance. See [machine testing](machine-acceptance.md). The owner excludes VM testing for this cycle.

0.2.5 completed: regenerated and audited target trees, 309 automated cases, 14 desktop scenarios, minimal-environment host upgrade/uninstall with tool persistence, seven matching-installer live cases, and verified owner restoration. Signing remains unavailable. Full evidence and limitations: [machine acceptance](machine-acceptance.md).

## 0.2.6: owner-selected follow-up scope

Signing and Git/GitHub/browser-store delivery are explicitly on hold. Plan 02 encrypted SQLite, portable recovery and automatic updates remain planned and are not implemented in this cycle.

Expand testing on the existing Windows host (no VM): physical Intel HD Graphics 520 inventory, existing runtime prerequisites and installer branch inspection, missing/invalid external-tool recovery, automatic and forced-software codec finalization and native WebView decoding, and the already supplied seven live links plus isolated account/content cases. Other physical Windows/GPU configurations cannot be established from this PC.

Fix one-click Resume by waiting off the UI executor for the old worker generation to leave the active map, rechecking job state before queueing. Never resurrect cancelled/deleted jobs; completion updates only running jobs. Add delayed-shutdown race tests and immediate native stop/resume acceptance.

Move checksum-verified previews 0.2.0 through 0.2.3 into ignored test-only quarantine. Keep their immutable bytes for upgrade regression; release collection, acceptance and draft/upload selection must exclude the prohibited versions. Quarantine does not clear their historical licensing.

## Historical completed 0.2.6 follow-up

The requested host testing, one-click shutdown/resume repair and historical-preview quarantine are implemented and verified. See [the exact test matrix and remaining scope](machine-follow-up-0.2.6.md). Current debug/release targets and installer are 0.2.6; all seven supplied live links pass on identical installed bytes. Other physical systems and real absent-runtime installation remain unverified. Signing/Git/store delivery stays on hold and Plan 02 encryption/recovery/updates stay planned.

## Completed 0.2.7 distribution cycle

The external-tool architecture, current-payload licensing review, refreshed debug/release targets, installer lifecycle, seven public links, synthetic account boundaries and thirty-minute performance checks passed. Offline WebView2 setup covers both fresh installs and upgrades. This cycle is complete within the owner-selected scope; signing follows future source publication and private-content testing is owner-managed. No further hardware, absent-runtime-machine or multi-hour test is required to publish the source.
