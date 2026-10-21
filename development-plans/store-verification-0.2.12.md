# SavedDesk 0.2.12 certification remediation verification

Reviewed 21 October 2026. The implementation preserves Windows 10 2004 and Windows 11. The second certification report denied `unvirtualizedResources` under 10.6.3; [the revised justification](store-resubmission-0.2.12.md) answers its four questions. Microsoft approval remains outstanding.

## Section 01 - Delivered changes

- Default MSIX AppData filesystem virtualization is retained. The manifest declares six owned native-messaging registry exclusions and a registry-only compatibility fallback for older supported builds. Effective OS enforcement remains a build-specific verification gate.
- Shared Store connector files use Documents/SavedDesk Browser Connector after consent. The external host relays to the application, which retains private catalog/account access and handshake receipts.
- Accounts provides storage/removal disclosure and deliberate connector cleanup. An exported PowerShell helper remains available after uninstall. Cleanup preserves library/account files, changed binaries/exports and other installations' registrations.
- All application/worker metadata is 0.2.12. Actual frozen-worker startup confirms its version. The lifecycle harness observes ordinary uninstall before manual cleanup and binds results to the exact Store package.

## Section 02 - Verified results

| Verification | Result |
|---|---|
| Backend tests | 165 passed |
| Packaging tests | 64 passed, including disposable Windows registry cleanup and tampered extension preservation |
| Browser connector | 14 passed |
| UI regression checks | 86 passed |
| Native Rust tests | 103 passed; two live Google HTTPS tests intentionally ignored |
| Actual desktop/native-host round trips | Setup, private-app readiness receipt, minimal browser-scoped account status, rejected unapproved origin and cleanup passed using synthetic data and isolated test registry keys |
| Frontend | TypeScript and production static export passed in the original checkout |
| Source audit | No findings; ignored personal data was not scanned |
| Redistribution review | Worker sources/exclusions, media tools, notices, corresponding sources and fixed WebView2 runtime verified |
| Actual MSIX archive | MakeAppx validation, archive CRC, file SHA-256, manifest, identity and version passed |

These are 432 passing automated tests plus the native round-trip checks. Unit/EXE evidence does not establish installed-MSIX behavior on a fresh Windows client.

## Section 03 - Measured Windows 10 lifecycle

The existing Windows 10 client host (build 19045) passed the exact-payload preview installation, transfer/connector, upgrade, ordinary-uninstall and post-uninstall cleanup test. The owned connector key, manifest, hashed host and helper remained after ordinary uninstall; the exported helper removed the owned integration after the package was gone. Fixture media remained unchanged. Independent restoration checks verified protected profile file sets/hashes and all six browser registration snapshots. Temporary certificate trust was removed and the app-specific debug setting restored. This existing-host result does not satisfy fresh Windows 10 or Windows 11 evidence requirements. See `WINDOWS10-LIFECYCLE-RESULTS.md` in the candidate review folder for the measured details and retention boundaries.

## Section 04 - Candidate and remaining gates

Candidate: `release-artifacts/msix/0.2.12.0-store-resubmission/SavedDesk_0.2.12.0_x64_unsigned.msix`.

SHA-256: `7ee53ccd535972c15586e3027fb618507b23bb0c84795f9593a2c69285cc0d64`.

The package uses the owner-confirmed Store identity `FarazHussain.SavedDesk` and is unsigned for Partner Center. The output includes the expanded capability justification, manifest, verification reports, source/notices archives and checksums. At the time this local candidate was built, source changes were uncommitted and no push, Partner Center submission or publication had occurred. The recorded candidate and its source archive predate the later compatibility-wording correction; regenerate the final upload package from the committed source and bind new lifecycle evidence to its hash.

- [ ] Fresh Windows 10 installed-package lifecycle results bound to this exact candidate.
- [ ] Fresh Windows 11 installed-package lifecycle results bound to this exact candidate.
- [ ] Publish the revised public policy and review the current Store listing/disclosure before submission.
- [ ] Regenerate the final package from committed source so its embedded justification includes the compatibility-wording correction.
- [ ] Include the expanded capability justification and measured uninstall remnants in the new submission.
- [ ] Obtain Microsoft's restricted-capability approval and certification.

The new `packaging/store-readiness.py` gate remains false until both fresh client-OS lifecycle reports pass. No Windows test VMs were available on this laptop. An existing-host result, if recorded separately, does not satisfy this fresh-machine requirement. See the [reproduction procedure](store-resubmission-0.2.12.md) for test signing, temporary trust/UAC, restoration and readiness commands.
