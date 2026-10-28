# SavedDesk 0.2.13 verification record

Verified on 29 October 2026 (Asia/Karachi). This record covers the registry-free transport in [plan 09](development-plan-09.md). Microsoft certification has not been received.

## Final submission artifact

Use release-artifacts/msix/0.2.13.0-store-registry-free-r2/SavedDesk_0.2.13.0_x64_unsigned.msix.

- Identity: FarazHussain.SavedDesk
- Publisher: CN=F14492EE-882F-4921-8253-B73CEB32823A
- Version/architecture: 0.2.13.0, x64
- Bytes: 416,910,287
- SHA-256: b2b090bbdb00944d15845cfb25d1dc259e1557e0438dd6bbac6db72e838cfd51
- MakeAppx validation, archive CRC and all 2,215 payload hashes passed.
- The actual archived manifest contains only runFullTrust. No unvirtualizedResources, virtualization overrides or exclusions.
- This is an unsigned Store submission package. Microsoft signs accepted Store packages. The local-test preview and certificate are not submission files.
- The earlier 0.2.13 staging candidate is superseded. Earlier published versions and their evidence do not validate this artifact.
- The installer was built before the source changes were committed. Its recorded source_commit identifies the preceding commit with source_dirty=true; the payload hashes above identify the tested artifact. Hosted CI results remain separate from this local verification record.

The separately signed preview has the same 2,214 non-manifest files. Its manifest differs only by the isolated test identity/publisher. Preview unsigned SHA-256: 660a11548ef0f0055be25a2255c3d913faf1fa84db08b4881edf96943377f636. Signed preview SHA-256: 3bad0e44e1d8812ee392654dcba9b243c8c094c759ca81e709a94e53d1f5038c.

## Executed checks

| Area | Result and practical boundary |
| --- | --- |
| Native tests | 102 library tests and 6 native-host platform tests passed; 2 explicitly live Google tests remained ignored. The final release compiled successfully. |
| Backend | Full 165-test suite passed before the fixed video error categories were added; all 16 affected compatibility tests then passed, including redaction/category coverage. |
| Packaging | 65 tests passed, including rejection of the denied capability and virtualization overrides. |
| Extension | 20 tests passed, including missing pairing, declined permissions, server proof, selected-platform scope and code-only storage. |
| Frontend | Production build/type checking passed. The initial UI run passed 85 of 86 checks; the stale retention-text expectation was corrected and its targeted rerun passed, including the masked pairing field. This is not represented as a fresh single full-suite run. |
| Real browsers | Chrome and Edge loaded the actual extension against the native prototype in isolated browser/app profiles. Mutual authentication, invalid origin/proof rejection, synthetic Instagram/X approval, provider rejection, restart persistence, cancellation and unpairing passed. No owner account was used. |
| Installed MSIX | Normal registered activation on this Windows 10 build 19045 host passed installation, three local transfers, a live public YouTube MP4 download and user-click playback, gallery installation, pairing, upgrade retention, replay rejection, approval start/cancel, unpairing and uninstall. The installed HTTP probe used the real signed protocol; real-browser approval above was a separate prototype test. |
| Owner protection | Original profile hashes restored, all six browser native-host registrations unchanged, preview removed, temporary machine/user trust removed and app-scoped WebView debugging restored. UAC configuration was not changed. |
| Source audit | 1,064 candidates and 37 ignore checks passed with no findings; project version is consistent and Git whitespace checks passed. Pattern scanning does not constitute a complete secret/security audit. |
| Distribution | Worker source/exclusion audit passed: 1,175 files and 1,644 frozen modules, no findings. Media audit passed: 10 files and 5 corresponding-source archives. Licensing inventory: 414 components, 726 notice files, no missing notices, 294 source archives and complete source closure. |

The local native maintenance roundtrip also verified that unpairing preserves library and account/session data. New setup creates no native-host manifest, executable copy or registration.

## Live results and failed attempts

The originally supplied YouTube Short returned HTTP 429 / a bot verification response in diagnostics. Two earlier installed attempts also failed video acceptance and restored the owner profile and trust. Metadata extraction alone was not counted as a successful download.

The final artifact downloaded https://www.youtube.com/watch?v=jNQXAC9IVRw without account approval and played its stored MP4 in installed WebView2 (320 by 240, currentTime advanced, readyState 4). This passed on both final-artifact attempts.

The first final-artifact upgrade probe reported a connection reset. The test harness was made to consume rejected-response bodies and identify signed-probe/replay failures separately. The same immutable package then passed the entire strict lifecycle. No native application change was made between those attempts; the precise cause of that one reset is not established. Prior failed reports remain available locally. Live-provider failures remain failures even when independent lifecycle checks continue.

## Local evidence

These paths are Git-ignored and may include isolated test state; they are not publication attachments:

- .cache/chrome-approval/5be64617-1122-4914-b0c1-a9ac5d571187/verification.json
- .cache/chrome-approval/8debd657-8884-4fe9-9499-bc3a3078a899/verification.json
- .cache/certification-native/6d9b2de4-5294-4b09-ae3d-2da23ced1ac0/report.json
- .cache/msix-host/3b4d4c2d-4b9d-4156-a4ef-0e78bfe20b8f/msix-host.json
- The same directory contains public-video, gallery-setup, connector-lifecycle, trust-status, archived failed reports and profile recovery evidence.
- The final Store artifact directory contains its manifest, payload inventory, archive verification, MakeAppx log and SHA256SUMS.txt.

Removed four duplicate MSIX staging trees and the disposable worker path diagnostic: 3,867,742,931 bytes (3.60 GiB). Final packages, inventories and test evidence remain. Debug worker/notices were synchronized and their installed-payload check passed. User accounts, downloads, corresponding-source archives and current target builds were preserved. Cleanup evidence: .cache/registry-free-cleanup.json.

## Submission steps and remaining boundaries

Remove rejected package entries from the pending Partner Center submission and upload the final Store artifact above. Use [the reviewer instructions](store-resubmission-0.2.13.md), requesting only runFullTrust. Load the newly exported 0.2.13 extension and pair it with the code shown in Accounts; older native-messaging extension copies cannot use this transport.

Microsoft alone decides Store acceptance. Fresh-VM, additional Windows/GPU coverage and broader live private-account tests were not performed; those remain outside the owner's current testing scope. Existing grants were preserved. Hosted CI/Git delivery remains separate from the successful local build and installation evidence.
