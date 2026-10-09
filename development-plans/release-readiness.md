# Licensing, Windows acceptance and signing

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** Current notice/source and exact host installer gates pass. The unsigned 0.2.10 build is a review asset; trusted signing and fresh hash-bound live acceptance remain public-binary gates.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

## Historical 0.2.7 follow-up

Offline WebView2 setup covers fresh installation and upgrades. The corrected installer passed the owner-authorized host lifecycle; 317 regression cases, 90 synthetic account cases and 13 controlled runtime cases passed. All seven supplied public links and the thirty-minute native test also passed. The owner will conduct further private-content testing manually. Full results are recorded in [current evidence](runtime-private-and-soak-0.2.7.md). Source publication is a separate next action, signing follows it, and encryption/recovery/application updates remain planned.

## Historical 0.2.6 verification (8 October 2026)

**317 automated cases, 15 desktop scenarios, 44 codec/playback combinations, seven controlled NSIS prerequisite cases, host installer lifecycle and all seven supplied live links passed.** Resume now waits safely for worker shutdown with one click. Gallery MOV/M4V/AVI inputs enter video finalization. Previews through 0.2.3 are hash-preserved in ignored quarantine and blocked from collection/publication. Debug/release targets and the unsigned installer are current.

Installer: **47,591,412 bytes**, SHA-256 **`bc902bace41a824990476f6f003bafc3c3a65ef1f660aeea63059e70cf24c8b2`**. Review set: `release-artifacts/v0.2.6/`. [Full follow-up report](machine-follow-up-0.2.6.md) distinguishes real host/live tests from controlled prerequisite cases and retained failures. Signing and Git/GitHub/browser-store delivery are on hold; encrypted SQLite, portable recovery and automatic updates remain planned. Other physical Windows/GPU and actual absent-runtime installations remain unverified. The 0.2.5 and earlier records below are historical.

## Historical 0.2.5 rigorous host verification (8 October 2026)

Debug/release builds and installer resources are refreshed. A stale nested debug worker and leftover release-stage packages were found and removed; the build now replaces known generated trees and checks their full manifests. **309 automated cases and 14 real desktop scenarios passed**, followed by host installation/upgrade/uninstall and all seven supplied live links on the same installer. Original profiles, sessions, registrations and shortcuts were restored. See [full machine results, retained failed attempts, timings and remaining issues](machine-acceptance.md).

Installer: **47,576,177 bytes**, SHA-256 **`aa5d1519d0a5001254de34c306f9a20ad6bbf2473820403c3d28888e78cb05c5`**, **NotSigned**. Current-payload licensing/source, host installer and live-provider gates pass; trusted signing remains false. New users install/select gallery Python and FFmpeg separately. This host verification does not establish absent-prerequisite behavior on another Windows machine. The current preview is `release-artifacts/v0.2.5/`; earlier records below remain historical.

## Previous 0.2.4 review

Updated: 8 October 2026. Current source version: **0.2.4**. Original SavedDesk code remains MIT. The new distribution excludes gallery-dl and the unreviewed FFmpeg executable; see [architecture, exact setup and verification](licensing-and-external-tools.md).

| Issue | Current approach | Evidence/limit |
| --- | --- | --- |
| Original license | MIT, unchanged | Root LICENSE and aligned package metadata |
| Gallery-dl/Requests combination | Gallery-dl is not redistributed in the frozen worker or adjacent payload | Actual archive/file exclusion proof; upstream combination is not certified |
| FFmpeg source correspondence | No FFmpeg binary is redistributed | User selects a separately obtained executable; old binaries remain uncleared |
| Remaining dependency notices/sources | 717 notice records, 289 source archives and seven exact runtime DLL/source provenance records verified | Actual new-payload exclusion/source proof passes; old bundles remain uncleared |
| Installer lifecycle | 0.2.0-to-0.2.4 guarded host upgrade/uninstall passed, including obsolete tool removal and owner-data restoration | Host testing is not a clean-machine test |
| Signing | Real signing hooks and timestamp/trust verification retained | No trusted signing identity is available; no signature is invented |
| Live providers | All seven supplied links passed in the installed 0.2.4 preview; media playback, duplicate skipping and confirmed deletion included | Same-installer SHA-256 and owner-data restoration checked; provider/account matrix remains broader than these seven cases |

A new license label would not have solved the old combination. Separation into processes alone is also not asserted as a legal determination. Excluding unresolved third-party code from distribution is the chosen remedy. Do not repackage the separately installed environment without its own licensing review. See [Apache's compatibility statement](https://www.apache.org/licenses/GPL-compatibility.html) and [GNU's separation guidance](https://www.gnu.org/licenses/gpl-faq.en.html#MereAggregation).

Public GitHub source publication and publishing a runnable release are distinct. Keep the MIT license, scoped third-party notices and source archives. Current matching installation/public-provider acceptance passes. The production binary release still needs valid signing; source publication can proceed first. No repository or remote is created by this task. The latest post-test review clears project license, new-payload redistribution, host installer and live-provider gates; trusted signing remains false. Clean-machine status remains false.

## Historical findings and prior acceptance records

The following records describe previews through 0.2.3. Their unresolved FFmpeg and gallery-dl findings remain applicable to those old binary payloads. They are not current requests to obtain permission for tools no longer shipped.


**Current architecture - 0.2.10:** gallery-dl and FFmpeg are external user-installed tools, excluded from the new installer. See [licensing and setup](licensing-and-external-tools.md). Older bundled-tool, no-Python and unresolved-source statements below describe their recorded earlier builds; they do not apply to the new payload or clear old installers.

Updated: 7 October 2026. Current source version: **0.2.3**. This task prepares distribution; it does not publish a repository, create paid resources, submit identity documents or claim tests on an unavailable VM.

| Requested issue | Result | Remaining requirement |
| --- | --- | --- |
| Project license | MIT selected and installed at root; npm, Python, Rust and installer metadata agree | Keep copyright and license text when distributing original SavedDesk code |
| Bundled-tool notices/source | Verbatim dependency notices, exact upstream notice supplements, dependency inventory, FFmpeg configuration, source archives and SHA-256 provenance collected | Resolve the specific source/license findings below before public redistribution |
| Windows install/upgrade/uninstall | Owner authorized this Windows development host; isolated-profile 0.2.0 to 0.2.1 lifecycle passed, 0.2.2 lifecycle also passed and is recorded below | Host evidence is distinct from clean-machine testing; WebView2 and development prerequisites are already present |
| Signing/platform acceptance | Pinned SDK, certificate-store/Azure signing hooks, timestamp/trust verification and hash-bound acceptance gates implemented | Owner identity/service provisioning, actual signing and real-provider tests |

## License selection and scope

Original SavedDesk code, documentation and branding use [MIT](https://opensource.org/license/MIT). The complete text is [LICENSE](../LICENSE), with copyright **2026 SavedDesk contributors**. [Scope](../licensing/SCOPE.txt) distinguishes original work, third-party components and downloaded content. MIT permits redistribution and modification with its notice retained; it does not relicense bundled tools or confer rights in downloaded media.

Each dependency keeps its own terms. gallery-dl declares GPL-2.0-only; the bundled FFmpeg 7.1 Gyan executable enables GPL/version3 and is GPLv3-enabled. A blanket GPLv3 label would not resolve GPLv2-only component compatibility. Original MIT licensing accommodates the project's own contribution while leaving third-party obligations to be satisfied. See [GNU license compatibility](https://www.gnu.org/licenses/license-compatibility.en.html) and [FFmpeg legal guidance](https://www.ffmpeg.org/legal.html).

The installer includes `licenses/SAVEDDESK-LICENSE.txt`, `licenses/THIRD_PARTY_NOTICES.txt`, complete collected texts and the dependency inventory. A local notice bundle is also kept under [licensing](../licensing/). It is a superset including build/test dependencies, not a claim that every inventoried package is embedded in the runtime. Noninstalled optional npm packages are inventoried separately and are not flagged as missing shipped notices.

## Exact redistribution review findings

[DEPENDENCIES.json](../licensing/DEPENDENCIES.json) records the unresolved findings and missing notice components. [UPSTREAM-NOTICES.json](../licensing/UPSTREAM-NOTICES.json) records source URLs, hashes and review bases for supplemental notices. Five outstanding standalone notices were completed: same-version parent Next/Tauri distribution texts, the React publisher notice for client-only, and the normative Mozilla MPL-2.0 text for selectors. Parent-project notices are distinguished from immutable crate source references. The inventory now has no missing notice components.

1. **FFmpeg source correspondence:** the base n7.1 source is available, but the binary's exact statically linked external-library revisions, patches and build materials have not been established. A version tag and GPL text alone do not close corresponding-source obligations. Obtain the exact complete build/source bundle from the binary supplier, or rebuild FFmpeg from a recorded, redistributable dependency closure and retest the media engine. This task has not contacted upstream maintainers. The current Gyan binary remains in use until a verified replacement is ready.
2. **Upstream license combination:** gallery-dl declares GPLv2-only and imports Apache-2.0 Requests. This warrants upstream/legal review of the distributed combination; this inventory does not decide that Python imports constitute a derivative work or claim a resolved incompatibility. Preserve exact sources/licenses and obtain clarification or select a reviewed architecture/dependency replacement before asserting clearance.
3. **Runtime closure:** CPython's external DLLs and Microsoft VC runtime redistributables need their applicable notice, source and distribution records. CPython's base tarball alone does not provide all external build inputs. Use CPython's exact release build records and Microsoft redistributable terms to complete that review.
4. **Missing package notice files:** the collector lists unresolved installed packages precisely. Some are build-only npm components whose distributions omit standalone license files. This historical missing list is now resolved by the review bases above and checked notice hashes; the inventory contains 411 components and 720 notice records. Runtime sources include seven exact CPython external tags/commits, with actual shipped DLL hashes in [RUNTIME-REVIEW.json](../licensing/RUNTIME-REVIEW.json). Installer terms retain the CPython Windows redistribution conditions verbatim. Exact runtime build flags and applicable redistribution review remain distinct from source collection. An unresolved build-tool notice does not automatically mean that binary is shipped, but the scope review still must be recorded.

`collect-licenses.py --sources` collects exact PyPI sdists checked against PyPI SHA-256 values, Rust crates checked against Cargo.lock, CPython/Node sources and the base FFmpeg tarball. Node source SHA-256 is checked against its official SHASUMS256 file. CPython/FFmpeg downloads have recorded hashes; that alone is not independent publisher verification. PyPI checksum metadata is cached by exact version and included in the source bundle so repeated collection rechecks local hashes without repeating metadata requests. Output is ignored `.cache/redistribution-sources/`, with `SOURCE-PROVENANCE.json` explicitly reporting **source_closure_complete: false**. Source archives are attached to review assets, not stored in Git. No fabricated written source offer or clearance statement is used.

```powershell
.\.venv\Scripts\python.exe packaging/collect-licenses.py --sources
# Optional recovery for missing upstream license texts with immutable commit metadata:
.\.venv\Scripts\python.exe packaging/review-missing-notices.py
.\.venv\Scripts\python.exe packaging/collect-licenses.py
```

## Prepare a disposable Windows test environment

No Windows Sandbox executable or accessible clean VM is available on this development host. The test's read-only `-Check` correctly refuses this host: it is not a disposable guest and already has SavedDesk user data. Hyper-V inspection is also denied by the OS. The following setup requires your administrator action and may require a reboot; it has not been performed here.

1. Check your Windows edition, virtualization support and [Sandbox prerequisites](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-overview). On a supported Windows Pro/Enterprise/Education host, enable **Windows Sandbox** through **Turn Windows features on or off** and restart if requested. Alternatively, create a fresh Windows 10/11 x64 VM in Hyper-V/VMware/VirtualBox with a fresh local user. Do not reuse your normal profile or map your AppData/browser folders.
2. Build the current installer, keeping the previous installer for the upgrade test:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/build-release.ps1 -Tag v0.2.1
   ```

   The prior local preview is `release-artifacts/v0.2.0/SavedDesk_0.2.0_x64-setup.exe`. In a fresh checkout, obtain the actual prior release separately and check its published SHA-256. Never run an unverified arbitrary installer.
3. Prepare the guest input/evidence directories:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/prepare-sandbox.ps1 -Installer release-artifacts/v0.2.1/SavedDesk_0.2.1_x64-setup.exe -PreviousInstaller release-artifacts/v0.2.0/SavedDesk_0.2.0_x64-setup.exe
   ```

4. Open the printed `SavedDesk.wsb` file. It maps only dedicated installer/scripts inputs read-only and a dedicated evidence folder writable. Clipboard sharing is disabled. Networking is enabled for the WebView2 bootstrapper; no owner content or browser sessions are mapped. The guest test installs the prior build per-user, runs three built-in local transfers through the installed packaged worker, saves preferences, registers the Edge native host, upgrades with `/UPDATE`, verifies history/media/settings/player-volume/duplicate preservation and notice availability, then uninstalls. It checks that app binaries and its connector registration are removed while the user catalog and sample media remain.
5. Keep the printed evidence folder after the guest closes. A passing test creates `clean-windows.json` plus screenshots and sample-state evidence. Copy the report into `.cache/release-acceptance/` for that exact installer. Failed tests retain their error report. Do not edit a failure into a pass.
6. For a separate VM, copy just the two installers and `test-clean-windows.ps1`/`guest-smoke.mjs` into the guest. Run the equivalent command with `-FreshGuest`, absolute installer paths and a dedicated evidence directory. The script checks VM/Sandbox detection and absence of existing catalog/registration before any installation. It never enables Windows features or deletes owner downloads.
7. In another fresh guest, manually check standard interactive setup, Start-menu launch, publisher prompt, restart/reopen, upgrade, ordinary Apps uninstall, offline launch with WebView2 already installed, and failure/help behavior without WebView2 or network. The automated silent test does not cover every installer wizard or network condition. Windows acceptance requires both the recorded automated run and this manual matrix, including a normal standard-user VM for any guest-specific bootstrap behavior.

The browser extension is still an unpacked/temporary connector preview; browser-store review and distribution are separate future work. The installer cleanup hook removes only registry references whose manifest and native-host paths match this installation. `/UPDATE` preserves registration. Uninstall deliberately keeps downloaded content and app user data.

## Obtain a publicly trusted signing identity

Use **Azure Artifact Signing** if your individual/organization identity and country are eligible, or a CA-issued code-signing certificate with a supported hardware/cloud private-key provider and accessible Windows certificate-store entry. Do not use a self-signed certificate to claim public trust. Azure requires a paid eligible subscription and identity validation; verify eligibility before paying or creating resources. See [Azure setup](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart), [eligibility/FAQ](https://learn.microsoft.com/en-us/azure/artifact-signing/faq) and [signing integration requirements](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-signing-integrations).

For Azure:

1. In Azure Portal, select your eligible paid subscription and create an **Artifact Signing account**. Record its exact region endpoint from Microsoft's table, account name and subscription/tenant IDs.
2. Submit **Identity validation** as the actual individual or organization. Complete Microsoft's required verification directly with Microsoft; do not put identity documents or billing details in this project or send them through chat.
3. After validation succeeds, create a **Public Trust** certificate profile. Record its profile name. Grant your signing identity **Artifact Signing Certificate Profile Signer** scoped to that profile.
4. On the signing machine install the Windows SDK x64 SignTool, a supported .NET x64 runtime (Microsoft specifies .NET 8; the pinned provider permits major roll-forward), VC runtime prerequisites and Azure CLI. Run `az login` with your signing identity and select the correct subscription. The project signs using AzureCliCredential only. The SDK archive and extracted provider DLL are hash-checked against the pin in `packaging/signing-toolchain.json`.
5. From PowerShell in the project root, allow scripts only for this process, populate public configuration and prepare the SDK:

   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   $env:SAVEDDESK_SIGN_PROVIDER = 'azure'
   $env:SAVEDDESK_SIGN_AZURE_ENDPOINT = 'https://YOUR-REGION.codesigning.azure.net'
   $env:SAVEDDESK_SIGN_AZURE_ACCOUNT = 'YOUR-ACCOUNT'
   $env:SAVEDDESK_SIGN_AZURE_PROFILE = 'YOUR-PUBLIC-TRUST-PROFILE'
   . ./packaging/setup-signing.ps1
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/sign-windows.ps1 -Check
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/build-release.ps1 -Tag vYOUR.VERSION -RequireSigning
   ```

   Replace the endpoint with the actual official region code and the version with a new unused version. `-Check` checks configuration, not service authorization. An actual signing operation must succeed and Windows must verify the timestamped public-trust chain. Own worker, native host, app and installer are signed; vendor binaries keep their upstream signatures.
6. For GitHub, create a protected **release-signing** environment with required reviewers and allowed release tags. Create an Entra application/service principal and a federated credential for issuer `https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`, subject `repo:YOUR-OWNER/saved-desk:environment:release-signing`. Grant only the certificate-profile signer role required for that principal. This requires tenant permissions on your side.
7. Add environment variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `SAVEDDESK_SIGN_AZURE_ENDPOINT`, `SAVEDDESK_SIGN_AZURE_ACCOUNT`, `SAVEDDESK_SIGN_AZURE_PROFILE`. These identify resources; do not add passwords/private keys. Run the manual release workflow with **signing_mode: azure**. Azure login is commit-pinned, uses short-lived OIDC and is invoked only for that mode. Hosted signing remains untested until provisioning and an actual workflow run.

For a hardware-backed certificate installed through its CA/token software, set `SAVEDDESK_SIGN_PROVIDER=store` and `SAVEDDESK_SIGN_CERT_THUMBPRINT` to its actual CurrentUser/My code-signing thumbprint. The private key must remain accessible through the supported provider. Run the same doctor/build commands. The script rejects missing, expired and self-signed identities; a compatible token may require its own interactive PIN approval. No PFX export or private key in Git is required.

Signing does not guarantee immediate SmartScreen reputation. Record actual publisher prompts and Defender/SmartScreen behavior on the downloaded installer; browser/Windows store acceptance is not implied by a valid Authenticode signature. [Microsoft SmartScreen FAQ](https://learn.microsoft.com/en-us/azure/artifact-signing/faq).

## Platform acceptance and public-release checks

After signing, test the **same final installer** in the clean guest. Any signature changes its SHA-256, so evidence from an earlier unsigned installer does not apply. Run `verify-release-signatures.ps1` with that installer and `.cache/release-acceptance/` to record the four own executable signatures.

Copy [the acceptance template](../packaging/platform-acceptance.example.json) to `.cache/release-acceptance/platform-acceptance.json`. Record the installer SHA-256 and real outcomes for YouTube, Facebook, Instagram, Discord, TikTok, Pinterest and X. On each platform use one public or explicitly accessible post/media link, check progress/completion and built-in playback, repeat/volume, duplicate detection, retry behavior, chosen-folder confinement and confirmed deletion of only disposable test content. For session-dependent content approve your own signed-in browser; no password, cookie export or signed Discord query string belongs in the report. Record browser/OS versions and times. Only set `passed`/`live` after actually testing.

The owner previously confirmed real Instagram connection/collection download and X connection. Those confirmations are useful history; they do not prove the newly packaged installer or every platform. Existing native platform and authenticated-account harnesses use local synthetic fixtures and can run safely without owner sessions, but cannot substitute for live-provider acceptance.

`build-release.ps1` creates installer, connector, original-source, notices and dependency-source archives, acceptance review, release manifest, notes and checksums. Normal builds remain review previews. `-RequireSigning` fails when signing is absent; `-PublicRelease -RequireSigning` additionally requires cleared redistribution, committed clean source, hash-matching Windows lifecycle evidence (fresh guest or the explicitly owner-authorized host route), verified signatures and the live-provider matrix. It does not publish. Missing evidence keeps `public_release_ready` false.

Both source-review flags remain false until the actual license/source review is completed; changing booleans alone is not completion. Keep written review evidence and replace/rebuild unreviewed dependencies where required. GitHub drafts must not be published with incomplete notices/source or failed acceptance. Public release, browser-store delivery, platform certification and a signed automatic updater are not performed by this preparation.

## Prepared local preview and guest configuration

The corrected 0.2.1 preview is built and all asset checksums/ZIP CRCs pass. Its installer is 72870696 bytes with SHA-256 `cdc06c5c92f32975b307821e46b8bd89041ed90924dddddba1a1efbac8fa28e2`. A ready configuration is `.cache/clean-windows/dc3a1603-b4fb-435e-8a37-1552c6a25d65/SavedDesk.wsb`; enable Sandbox on a supported host before opening it. The Windows guest scripts are syntax/guard checked, not claimed as an executed clean-machine test. [Artifact evidence](development-artifact.md) records the build and current limitations.

## Owner-authorized installer testing on this system

The owner explicitly requested using this development Windows system instead of waiting for a clean VM. [test-host-windows.ps1](../packaging/test-host-windows.ps1) is a separate guarded route; the original fresh-guest guard is retained. It refuses active SavedDesk processes and an already registered installed copy. It checks installer checksums, temporarily parks the exact application profiles beside their original locations, installs into a unique ignored test directory with shortcuts disabled, and restores profiles and prior native-host/manufacturer registry values in finally cleanup. Top-level owner profile files and existing SavedDesk shortcuts are hash-checked. Browser sessions are neither exported nor logged. Only empty test profiles and three local SVG samples are used.

The initial 0.2.1 attempt encountered a transient busy worker gate, one complete lifecycle passed, and a repeat diagnosed the busy gate as startup's automatic local capability probe. The test driver now waits for only that specific busy response, bounded to 30 seconds; other failures stop immediately. A pass is not fabricated from a failed attempt. The same guarded route is used for the new immutable 0.2.2 preview.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/test-host-windows.ps1 -Check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File packaging/test-host-windows.ps1 -Run
```

The current default installer is 0.2.3; `-Installer` can select another collected local preview with its matching release-manifest checksum. `host-windows.json` and screenshots remain under `.cache/host-acceptance/<unique-id>/`. Copy the actual passing report to `.cache/release-acceptance/host-windows.json` for review. The `windows_installer` gate accepts this explicitly authorized route while `windows_test_environment.clean_machine` stays false. This does not establish missing-WebView2 bootstrap, a pristine standard-user environment, public publisher trust, browser-store acceptance or provider reachability.

Seven runtime DLLs matched the installed CPython distribution byte for byte. Seven external source archives were collected from exact CPython source-deps commits and added to source packaging; the total is 292 archives with no download failures. Five standalone notice gaps are resolved. Source closure and redistribution clearance remain false for the FFmpeg external-library correspondence and gallery-dl/Requests findings. Neither a project license change nor a self-signed certificate resolves those gaps.

Trusted signing cannot be performed until the owner obtains a CA-issued code-signing identity or completes the signing-service identity validation described above. No paid account, certificate, identity submission, or external maintainer message has been created. The owner subsequently supplied seven disposable links; 0.2.3 live-provider acceptance passed as recorded below. Synthetic tests remain labeled local.

### Executed 0.2.2 result

Installer SHA-256 `c8835800b4ea139eac4625a35f087defade425ce154f1b092f4eccc61f3263dc`, 72,884,073 bytes. Host report `76ea8f39-6670-490b-abe9-03e87384db11` passed all lifecycle and owner-restoration checks. Latest acceptance review has project_license and windows_installer true, redistribution_review / trusted_signing / live_platform_acceptance false, clean_machine false. Eight release asset checksums, four ZIP CRC checks, 720 notice hashes, 147 worker tests and six evidence-gate tests passed. No root Git repository or hosted release was created. This post-build evidence does not rewrite immutable release assets.


## Live-provider acceptance harness (8 October 2026)

The owner supplied seven disposable real-provider links and authorized these tests. `packaging/test-live-windows.ps1` installs a checksum-verified collected preview into a unique ignored directory, temporarily parks the owner profile, copies only previously approved DPAPI-protected sessions with their scoped account bindings into an empty catalog, and selects a separate test media root. It never exports plaintext sessions. A `finally` block uninstalls the temporary copy, deletes its test profile, restores the original profiles and registrations, and checks owner-file hashes. Close SavedDesk before running; existing registered installations are refused.

`desktop/scripts/live-platform-acceptance.mjs` drives the installed WebView2 app through loopback CDP. Inputs are Windows CurrentUser DPAPI-protected rather than stored in tracked fixtures. Reports omit target URLs, credentials, and signed Discord parameters. The harness checks the actual download form, progress events, media playback, repeat and volume, duplicate skipping and confirmation-based deletion. It exercises pause/resume once on YouTube; it does not claim naturally failing-provider retry behavior from a successful transfer. Evidence is bound to the installer SHA-256 and is collected separately from immutable build-time release assets.

The first 0.2.2 pass downloaded six supplied links. Instagram `/reels/<id>/` was rejected by native URL validation before any provider request. The 0.2.3 fix normalizes this alias to `/reel/<id>/` at both native and worker boundaries, retaining host/path validation. The first pass also found a harness comparison bug for Windows extended-length `\\?\` paths; those paths are now normalized for the test comparison. These initial download results are not marked full playback/deletion acceptance. The corrected installer must be tested before the live gate clears.

Worker regression tests: 148 passed; release-evidence regression tests: six passed. Licensing and signing remain separate unfinished gates.


## Executed 0.2.3 result (8 October 2026)

All seven owner-supplied disposable links passed real installed-release download, built-in playback, duplicate skipping, selected-folder checks and confirmation-based deletion. Video cases also passed seek/repeat/persistent volume; YouTube passed pause/resume. Instagram's supplied `/reels/` URL exposed a local validator omission, fixed by normalizing it to `/reel/` at native and worker boundaries. Two harness assumptions about Windows paths and remembered Repeat state were corrected; successful reruns are retained rather than calling the initial failures passes.

The installer is **72,871,031 bytes**, SHA-256 **`19fe0a05f0b761ba327ef9a37c865df977ecdc9b237f3fa70377e7013637fced`**, **NotSigned**. Its guarded 0.2.0-to-0.2.3 install/upgrade/uninstall test passed, including unchanged owner profile hashes, prior registrations and shortcuts. This was the owner-authorized existing development host, not a clean VM. Tests: 148 worker, 58 native and six release-evidence checks; eight asset checksum entries and four ZIP CRC checks passed. [Detailed sanitized acceptance](live-platform-acceptance.md).

Latest post-test review: `.cache/release-acceptance/review-0.2.3/acceptance-review.json`. Project license, host installer and live-platform gates pass; redistribution review and trusted signing remain open. No Git repository, public release or signing identity was created. Immutable build-time archives were not rewritten with later test evidence or test-driver corrections.

