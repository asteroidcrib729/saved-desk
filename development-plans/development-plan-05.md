# Development plan 05: MSIX packaging and Microsoft Store submission

Started 10 October 2026 at the owner's request. This adds a Windows x64 MSIX build beside the existing NSIS EXE. The published v0.2.10 EXE and tag remain immutable. The EXE's process exit codes in INSTALLER_EXIT_CODES.md do not apply to Windows MSIX deployment.

## Packaging design

- Keep the full desktop app and its embedded static UI. Package the reviewed Python worker, Node extraction runtime, native browser host, connector extension, dependency notices and Microsoft Fixed Version WebView2 runtime. Do not wrap the EXE installer or execute its prerequisite hooks from MSIX.
- Use packaging/build-msix.ps1 and a separate -Msix native build mode. The normal Tauri configuration remains the NSIS configuration. The MSIX build overrides WebView2 to resources/webview2 and skips NSIS bundling.
- Pin Microsoft's official x64 Fixed Version CAB URL, version and checksum in packaging/msix-runtime.json. Verify its Microsoft signature, retain its complete unmodified extracted distribution and accompanying third-party notices, record every staged runtime file hash, and include licensing/WEBVIEW2-LICENSE.txt. Fixed Version security updates require rebuilt application packages; it has no independent Evergreen update mechanism.
- Generate a schema-validated MakeAppx manifest and package. Keep only an explicit resource allowlist; reject linked paths, credentials/catalogs and excluded FFmpeg/gallery-dl components. Package an x64 executable and worker, never target/debug or the whole target tree.
- Keep MSIX artifacts, staging, certificates and QA evidence in ignored directories. Never export or distribute a signing private key with a preview.

## Identity and installation behavior

The initial package uses SavedDesk.MsixPreview and CN=SavedDesk MSIX Preview. They are local testing identifiers, not assigned Store identity values. That package is not for Store submission. The owner subsequently provided a Product Identity screenshot: Name FarazHussain.SavedDesk; Publisher CN=F14492EE-882F-4921-8253-B73CEB32823A; PublisherDisplayName Faraz Hussain; PFN FarazHussain.SavedDesk_1ymgwkd96twzc; Store ID 9P60HCD8JXTX. These public values are recorded in packaging/msix-store-identity.json and selected with -Store. A Store build requires the exact Package/Identity/Name and Package/Identity/Publisher from Microsoft's Product identity page, and PublisherDisplayName matching the listing.

The app remains a medium-integrity packaged classic desktop app with runFullTrust. It needs normal filesystem access for the selected media folder and external download tools. Registry and AppData write virtualization are disabled using desktop6 properties and unvirtualizedResources, because a separately running browser must see native-host registration and share account-status files with SavedDesk. This also preserves the existing local catalog path across EXE/MSIX use. Restricted capabilities require a clear Store justification and approval; the package does not claim it has already received approval.

Do not run the NSIS and MSIX editions simultaneously. The single-instance rule and existing profile are shared. Test deployment must guard active owner processes and isolate/restore the current app profile and browser registrations. Installed application paths change after MSIX updates: until automatic connector relocation is implemented and accepted, repeat Accounts -> Set up browser connector after an MSIX update. The current build does not perform automatic NSIS removal, account migration, private-provider changes or updater implementation.

MSIX owns removal of package binaries and Start-menu registration. Because AppData/registry virtualization is disabled, local catalog/session state and user-selected downloaded media are retained. Before uninstall, unregister this package's browser connector using its packaged maintenance/unregister-connector.ps1 and the exact native-host parent directory recorded in the connector manifest. Automatic package-removal hooks are not present. Never claim the NSIS cleanup hook runs for MSIX.

The host test exposed WindowsApps execution restrictions for an unpackaged browser. MSIX connector setup now writes a content-addressed, verified copy of the native host under the established profile/connector-bin directory and registers that path. Changed host binaries receive a distinct hash directory; a modified cached binary is rejected. Linked cache folders/hosts are rejected. Normal EXE installations continue registering their installed host. Readiness checks use the correct path for the active edition.

## Acceptance

Check manifest/identity validation, x64 PE headers, excluded-resource boundaries, the complete worker proof, pinned runtime payload hashes, MakeAppx validation and archive extraction. On this host, test installation, packaged app launch, local transfers, persisted settings/player preferences/history, duplicate detection, browser-host registration, upgrade and removal without modifying owner content. A self-signed test certificate establishes local test trust only; it is not a publicly trusted release signature.

The machine currently runs Windows 10 build 19045. Broader Windows/GPU testing and VMs remain outside scope. New provider sign-in grants, private content and production live-platform certification are not claimed by MSIX packaging checks.

## Owner actions for Store publication

1. The correct MSIX product and identity are already confirmed by the owner's Product Identity screenshot. Keep this SavedDesk product; no new reservation or replacement identity is needed.
2. Open SavedDesk -> Manage packages / its MSIX submission -> Packages. Upload the Store-identity SavedDesk_0.2.10.0_x64_unsigned.msix produced under release-artifacts/msix. Do not upload the SavedDesk.MsixPreview package, certificate or upgrade-test-only fixture. The EXE/MSI URL form and /S option are not used here.
3. Complete the listing, screenshots, availability, age ratings and privacy/terms URLs. Check x64 and en-US. If the portal reports an already-used package version, increment the real application version consistently and rebuild; do not change an existing public asset.
4. Explain the restricted capabilities in the submission and respond to Microsoft's review. Microsoft supplies signing for Store distribution. Independent sideloaded releases and trusted EXE signing are separate requirements.
5. Review package validation and certification results before public distribution. The local-preview lifecycle tests exercise the same application/worker/runtime binaries, but they do not establish certification of the final Store identity. Windows App Certification Kit acceptance of the final identity remains outstanding.

### Capability explanations for the submission

runFullTrust: SavedDesk is a classic Windows desktop application. It runs a local media worker and a browser native-messaging host, and invokes separately installed download/conversion tools with the user's selected settings. It needs normal desktop process and filesystem access to save media to the user-selected folder. It does not request administrator rights for ordinary operation.

unvirtualizedResources: A separately running Chrome/Edge/Firefox browser needs to read the user's native-messaging host registration and share local connector-status files with SavedDesk. Per-package registry/AppData virtualization would hide that registration and separate the connector from the application's existing catalog. Unvirtualized access preserves the established profile when moving from the EXE edition. Package removal retains user-selected media, catalog and sessions; connector removal currently uses the explicit ownership-checked cleanup script.

### Local test commands

```powershell
./packaging/build-msix.ps1 -ReuseWorker
./packaging/create-msix-test-packages.ps1 -ReviewDirectory <new-preview-output-directory>
./packaging/test-msix-with-temporary-trust.ps1 -ReviewDirectory <same-preview-output-directory> -Run
```

The last command opens UAC for a temporary LocalMachine TrustedPeople certificate entry and a saveddesk.exe-scoped WebView2 debugging value. Both are restored afterward; no global browser debugging flag is enabled. It runs application tests as the ordinary user and removes that entry afterward, with a 15-minute helper timeout. The private signing key is nonexportable and removed immediately after signing. The preview signing script refuses the Store identity, and the trust helper refuses an unrelated certificate. Test-only package version 0.2.11.0 exercises upgrade of the unchanged 0.2.10 binaries; it is not a released application version.

Sources: [Manual packaging](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-manual-conversion), [MakeAppx](https://learn.microsoft.com/en-us/windows/msix/package/create-app-package-with-makeappx-tool), [virtualization](https://learn.microsoft.com/en-us/windows/msix/desktop/flexible-virtualization), [WebView2 distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution), [Store publishing](https://learn.microsoft.com/en-us/windows/apps/publish/get-started), [package signing](https://learn.microsoft.com/en-us/windows/msix/package/sign-msix-package-guide).

## Actual results

Verified on 10 October 2026:

- Store package: release-artifacts/msix/0.2.10.0-store-final/SavedDesk_0.2.10.0_x64_unsigned.msix; 387121203 bytes; SHA256 4f3c4749ac9faba64b2ea97500b49e0b338d805f95f065ca1a98472f93da77cb. Its Name/Publisher/PublisherDisplayName match the owner's Product Identity screenshot. MakeAppx schema/semantic validation, archive CRC and all 2140 payload-file hashes passed.
- Separate local unsigned package SHA256 3fe0af768e1946ac5c6c5bda44f2f9669572cf895de1584d82caf63adab838d3; local test-signed package SHA256 219e6fd5a42523d0a17691c99897497cb27cd397b3ba358421a7c86e10182d99. Apart from AppxManifest.xml, all 2139 payload files match the Store candidate exactly.
- Native library suite: 90 passed, 2 unrelated explicit live Google tests ignored. Packaging suite: 34 passed. Frontend compilation/TypeScript and native release compilation passed. Worker proof: 1130 files and 1643 frozen modules; licensing inventory: 409 components, 718 notices, 289 corresponding-source archives, no missing sources/notices.
- The corrected local preview passed signed installation, registered Windows activation, bundled Fixed Version WebView2 use, three local worker transfers, unpackaged-process native-host execution/framing, upgrade, settings/volume/library/history/duplicate retention, explicit owned connector cleanup, package removal and media retention. The upgrade fixture changes package metadata to 0.2.11.0 while retaining the same application binaries; it is not a new application release.
- The original owner profile was restored and verified against its pre-test file hashes. Browser registrations were restored. Temporary CurrentUser/LocalMachine test trust and the per-app debugging setting were removed. The signing private key was never exported and was removed after signing. No private-media download or Google-grant revocation was performed.
- Earlier attempts found and fixed test-harness restoration issues and the real WindowsApps browser-host launch incompatibility. Superseded initial MSIX packages are explicitly marked non-distributable; retained failed-test evidence is not a pass. The final completed host report and acceptance-summary.json record the corrected build only.
- Repository audit: no findings; generated runtimes, MSIX assets, public test certificates, test profiles and machine evidence remain ignored. Source changes are local working-tree changes, not a new published tag.

Outstanding: Windows App Certification Kit acceptance on the final Store identity, Partner Center capability/content review, Store signing and Store publication. These are not inferred from successful local preview tests. Independent trusted EXE signing remains separate. VMs, other Windows/GPU combinations, private-provider tests and app-managed automatic updates remain outside this packaging task.

## GitHub Actions MSIX generation

Added `.github/workflows/build-msix.yml` as a separate manually triggered Windows x64 MSIX build. It checks out the dispatch commit, validates consistent project versions and the historical-preview quarantine, uses the existing pinned Node/Python/Rust setup, and runs the worker, packaging, connector, frontend, UI and native checks. It builds a fresh native MSIX edition with the audited worker and pinned complete Microsoft Fixed Version WebView2 runtime.

The default `store` choice reads the confirmed public identity from `packaging/msix-store-identity.json`; `preview` retains the separate local test identity. MakeAppx validation and actual archive CRC/payload checks remain enabled. The companion review set includes connector files, notices, original and matching dependency source archives, CI provenance and refreshed SHA-256 checksums. Actions pins use the same reviewed immutable commits as the existing workflows. Repository permission is limited to `contents: read`; no signing credentials, publication, certificate trust or installation are performed.

Artifacts are retained for 30 days. Commit and push this workflow with all MSIX implementation prerequisites before running it from `main`; the older `v0.2.10` tag predates that implementation. Future tagged runs must use a new tag matching the application version. Successful generation is build/archive evidence only: the exact CI package still needs its own acceptance and Partner Center certification. Local validation is recorded separately from any future hosted workflow result.

Local workflow validation on 10 October 2026: actionlint 1.7.12 passed; all 16 PowerShell steps parsed and embedded Python compiled; all 34 packaging tests passed. Artifact collection was exercised against a copied existing Store MSIX: all 2140 payload files, 10 companion-file checksum entries and 289 dependency source archives passed verification. The original-source archive includes the workflow and MSIX implementation while excluding local profiles, credentials, caches and build artifacts. This reused the already verified local package; it is not a new hosted build or installer lifecycle result. A hosted run remains pending commit/push of the workflow and prerequisite MSIX source changes.

### Hosted runner correction

The first hosted MSIX run at commit `8e4c784` passed the application tests, fresh native release build, MakeAppx packaging and actual MSIX archive verification. Final artifact collection correctly refused an incomplete redistribution record: the shared collector required the EXE offline WebView2 installer review, even though MSIX ships the Fixed Version runtime. Local validation had an existing EXE prerequisite cache and did not expose that fresh-runner distinction.

The collector now selects an explicit WebView2 build mode. MSIX uses `fixed-runtime`, checks the pinned Microsoft runtime version/source/CAB review and every staged runtime file, includes the matching Microsoft terms, and rejects altered, extra or linked payloads. The EXE mode retains its separate installer signature/hash/terms requirements. MSIX requires complete dependency notices and sources before native release compilation; a failed gate prints its findings. Regression fixtures cover absent EXE caches, changed runtime files, wrong provenance/signature, missing terms, unsafe inventory paths and independent EXE/MSIX reviews. This correction preserves the redistribution gate rather than treating an incomplete review as a pass.

Local correction verification: all 40 packaging tests passed. The full collector, exercised against an isolated notice tree with no EXE review record, cleared all 409 components, included the matching Fixed Version runtime notice and reported no source-review findings. Actual staged runtime hashes also passed. Hosted acceptance of this corrected revision must be established by its own subsequent run.
