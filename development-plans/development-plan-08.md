# Development plan 08 — Store capability reconsideration, 0.2.12

The 21 October 2026 certification report for Product 9P60HCD8JXTX denied `unvirtualizedResources` under 10.6.3. This plan addresses the requested virtualization evaluation, minimum scope, normal uninstall remnants, and user disclosure. Windows 10 2004 and Windows 11 support remain required by the owner. No approval is promised before Microsoft reviews the new submission.

## Section 01 — Architecture

1. Retain default MSIX AppData filesystem virtualization. Do not declare a filesystem opt-out or excluded AppData directory.
2. Keep the browser-visible native host, manifests, exported extension and cleanup helper in Documents/SavedDesk Browser Connector, created only after explicit setup consent. Unpackaged EXE behavior retains its existing profile location.
3. Declare Flexible Virtualization exclusions for only the six owned per-user native-messaging host keys and retain a registry-only compatibility fallback for older supported builds. Microsoft's platform matrix and feature guide give inconsistent version availability. Verify effective isolation on each supported build; do not claim that all Windows 10 versions require the broad fallback.
4. Make the browser-launched host an IPC relay. Only the application reads the catalog and writes private handshake receipts. Use the existing user-SID ACL and local named-pipe framing, with a separate bounded status channel.
5. Provide in-app connector removal and an exported cleanup tool usable after uninstall. Preserve media, catalog, account data, unrelated registrations, changed binaries and unrelated files.

## Section 02 — Verification and evidence

- [x] Manifest tests and actual-archive validation reject filesystem exceptions and registry scope expansion.
- [x] Native unit and real app/host round-trip checks validate account status, readiness and unchanged authorization consent.
- [x] Cleanup integration tests use only disposable Temp files and uniquely named certification HKCU keys; assert library/account and unrelated installation preservation.
- [x] Frontend typecheck, static export and UI regressions cover setup consent, visible retention wording and deliberate connector removal.
- [x] Packaging/worker/connector regressions pass with consistent 0.2.12 metadata.
- [x] Normal MSIX uninstall was observed on the existing Windows 10 host before manual cleanup; the exported helper then ran after removal. Package hashes, OS build, remnants and owner restoration are recorded. Fresh-client VM coverage remains pending.
- [x] Reviewer justification and user documentation describe measured behavior, the compatibility fallback and unverified build-specific isolation accurately.

Fresh Windows 10 and Windows 11 installed-MSIX evidence must be bound to the final package before a submission-readiness gate can pass. Local unit tests and EXE tests are not substitutes for those runs. Historical 0.2.11 package results cannot be attached to 0.2.12.

## Section 03 — Delivery

Update the original checkout only with the reviewed source changes. Keep prior release artifacts immutable. Build a fresh Store-identity unsigned MSIX, verify its archive and include the revised capability justification. Microsoft signs approved Store packages; temporary test certificates are never uploaded. Partner Center publication/submission remains a separate account action.
