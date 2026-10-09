# Licensing architecture and external tools

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** The README includes complete separately installed gallery-Python/FFmpeg setup. Current distribution excludes these tools; neither MIT nor upstream licenses changed.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

**Current follow-up (0.2.10, 9 October 2026):** The app guidance and native/preview registry now exclude private Facebook/TikTok/Pinterest content and remove Pinterest OAuth prerequisites. Existing browser approvals remain available for supported public links; Instagram/X and YouTube playlist routes are preserved. Google lifecycle acceptance uses controlled native credentials and provider responses, as the owner explicitly requested, preserving the current live Google grant. See [scope and verification](scope-and-lifecycle-0.2.10.md) and [owner-reported X endurance](owner-x-endurance.md). Historical version results below retain their original scope.

**0.2.7 follow-up:** Offline WebView2 setup now covers fresh installs and upgrades; private collections and sustained native tests are recorded in [runtime and performance evidence](runtime-private-and-soak-0.2.7.md). Private-content testing is owner-managed; optional testing is outside the current publication scope, signing follows source publication, and future features remain planned.

Since 0.2.4, SavedDesk keeps original code under MIT and stops redistributing gallery-dl, imageio-ffmpeg and FFmpeg/FFprobe executables. The frozen worker retains Requests, yt-dlp/EJS, CPython and the standalone Node runtime under their recorded terms. Gallery operations use an explicitly selected user-installed Python environment. Video preparation uses separately obtained FFmpeg. No GPL or Apache license was changed, and no upstream exception or permission was obtained.

## What this resolves

The old installer combined GPL-2.0-only gallery-dl and Apache-2.0 Requests in one frozen worker. Its Gyan FFmpeg binary also lacked established complete corresponding-source/build correspondence. Those combinations are excluded from the new distributable. Requests remains in the MIT worker; gallery-dl is not there. The old binaries through 0.2.3 remain uncleared and must not be published based on the new review.

A subprocess alone is not a universal licensing exception. GNU distinguishes both communication mechanisms and semantics when assessing combined programs. The important distribution change here is that SavedDesk does not supply the unresolved packages or FFmpeg binary. The user acquires tools independently for local use. Republishing a selected tool environment would require its own review. This implementation does not certify gallery-dl's upstream Requests combination. See [Apache compatibility](https://www.apache.org/licenses/GPL-compatibility.html), [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html#MereAggregation) and [FFmpeg legal guidance](https://ffmpeg.org/legal.html).

## Windows setup

1. Install Python 3.14 from [Python's official downloads](https://www.python.org/downloads/windows/), with the interpreter available as `python` in a new PowerShell window.
2. Create an environment outside the SavedDesk installation and install the supported versions directly from PyPI:

```powershell
python -m venv "$env:LOCALAPPDATA\SavedDeskTools"
& "$env:LOCALAPPDATA\SavedDeskTools\Scripts\python.exe" -m pip install gallery-dl==1.32.14 requests==2.34.2 yt-dlp==2026.8.19 yt-dlp-ejs==0.8.0
```

3. In **Settings > Download tools > Gallery Python environment > Choose file**, select `%LOCALAPPDATA%\SavedDeskTools\Scripts\python.exe`.
4. Obtain FFmpeg separately from a supplier linked by [FFmpeg's download page](https://ffmpeg.org/download.html). Extract it outside SavedDesk's installation folder. Select its `ffmpeg.exe` in **Settings > Download tools**. Keep `ffprobe.exe` alongside it when supplied.
5. Run **Settings > Check your setup**. Instagram/X/Pinterest and TikTok photos require the gallery environment. Video preparation/previews require FFmpeg. Basic library browsing, image viewing and local history do not require either installation.

No selected executable is copied into the app. Paths persist in private `external-tools.json` alongside app data, outside Git. Choose trusted tools: selecting an executable authorizes running it. Changes are refused while the worker or download queue is busy. Empty configurations produce actionable setup messages; frozen builds never silently substitute their embedded interpreter for gallery Python. A renamed or removed tool must be selected again.

## Process and privacy boundary

The installer ships only SavedDesk-owned MIT adapter source in `worker/_internal/external-adapter/`. The selected Python runs this source with `-I -B` (isolated imports, no installation-folder bytecode writes); dependencies come from its own environment. Cookies stay in stdin JSON frames, not command-line arguments, logs or temporary cookie files. Per-item transfer approval, job/item scoping, completion acknowledgement, sequence validation and heartbeat supervision remain in place. Process descendants remain supervised by the native Windows job object.

Instagram/X account verification and Firefox connection run in this same external environment. Browser approval for other platforms remains in the built-in worker. YouTube/Facebook/TikTok videos and Discord attachments retain their existing engine paths. Node is a separately launched runtime supplied with its original notices.

## Distribution proof

`packaging/build-worker.ps1` excludes both Python namespaces, replaces the generated resource tree rather than merging stale files, and copies only owned adapter source. `packaging/audit-worker-bundle.py` opens the actual PyInstaller archive, checks module names and all adjacent files, rejects excluded packages and FFmpeg/FFprobe executables, and compares adapter files with original source. [BUNDLE-REVIEW.json](../licensing/BUNDLE-REVIEW.json) records the complete hash manifest. A stale, missing or failed proof prevents licensing clearance.

`collect-licenses.py` derives the current inventory and source status from that proof plus runtime provenance, verified notices and archive acquisition. The installer receives this final inventory after worker generation. `test-installed-payload.ps1` checks every installed worker file against the manifest, including extra stale files. NSIS removes known obsolete gallery/imageio directories during upgrades without touching user data.

Current dependency sources accompany review assets. Full notices for permissive/MPL/PSF/runtime components remain required; removing the two unresolved tools does not waive other obligations. Signing, installer lifecycle and provider evidence remain separate hash-bound gates. No new trusted signature or clean VM is implied by this licensing change.

The 0.2.5 machine audit additionally found and repaired stale target resource copies. Debug and release resource staging now replace known generated trees and check the complete worker manifest before success. First-run missing-tool recovery, persisted selections, stripped developer environments, spaced install paths and seven installed live cases pass; see [machine acceptance](machine-acceptance.md).

## Historical 0.2.6 verification

The same external-tool distribution boundary passed the expanded [machine follow-up](machine-follow-up-0.2.6.md): actual frozen modules/file manifests, selected external tool setup, 44 codec cases, installed upgrade/uninstall and seven live platforms. MOV/M4V/AVI now enter video finalization. Missing FFmpeg feedback points to Settings > Download tools. No upstream licenses or independently acquired tools were republished. Old previews through 0.2.3 are quarantined and blocked.
