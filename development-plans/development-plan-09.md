# Development plan 09 — Registry-free browser pairing, 0.2.13

The 28 October 2026 Store report again denied `unvirtualizedResources`. This plan supersedes the registry-exception and capability-reconsideration parts of plans 05 and 08. Windows 10 2004 and Windows 11 remain the supported targets.

Local implementation and verification completed on 29 October 2026. See the [0.2.13 verification record](store-verification-0.2.13.md) for exact package hashes, executed tests, failed attempts and coverage limits. Git delivery and Microsoft acceptance remain separate.

## Implementation

- Remove `unvirtualizedResources`, all registry and filesystem virtualization overrides, and all registry exclusion declarations. Keep `runFullTrust` for the desktop app and separate download tools.
- Keep default MSIX AppData and registry virtualization. The library and platform session paths do not change from 0.2.12.
- Replace external-browser native messaging with an HTTP listener bound exclusively to numeric IPv4 loopback, `127.0.0.1`. No LAN binding, firewall exception, registry registration, service, or unpackaged registration helper.
- Require explicit setup consent and a private pairing code copied from Accounts into the updated extension. The code contains a port, browser selection and a randomly generated shared secret. It is never a URL, command-line argument, telemetry event, or platform credential.
- Protect app pairing configuration with current-user DPAPI. Keep only the pairing code in the extension's local storage, with Chromium storage restricted to trusted extension contexts. Never store cookies there.
- Persist the selected local port and secrets across restarts. If another process owns the port, refuse the connection and explain how to remove and recreate pairing; do not probe or send credentials to another port.
- Require HMAC-SHA256 signed POST requests and signed responses (the secret never travels over the connection), fresh one-use challenges, exact numeric Host, bounded headers/body/deadline/concurrency, permitted extension origins when supplied, matching browser/version, existing platform nonce and one-use approval. Do not expose CORS access to ordinary websites.
- Retain explicit per-platform browser cookie permission, provider verification, cancellation, browser/source binding, replay protection, worker isolation and DPAPI session storage.
- Removing browser pairing deletes the protected pairing configuration and stops its listener. Existing downloaded media and platform sessions stay intact. Old native-host registrations are no longer used. Optional user-run legacy cleanup remains available; the Store app must not use it to bypass virtualization.

## Validation

Use fresh 0.2.13 evidence. Test manifest/actual archive rejection of virtualization overrides, negative HTTP security cases, persistent pairing, permission denial, scoped approvals, cancellation, removal, installed-browser traffic, and installed-MSIX lifecycle. Capture exact package hashes and owner-profile restoration. Historical 0.2.12 evidence does not validate this replacement.

The existing broader Windows 10/11 clean-guest readiness gate remains a separate, unfulfilled coverage gate; this work does not invent VM evidence. Microsoft alone decides Store acceptance.

## Delivery

Build a new Store-identity 0.2.13.0 MSIX and a separate preview identity for local testing. Keep historical release artifacts immutable. Update current setup guidance and reviewer notes; do not submit local-test certificates or signed preview packages to Partner Center.
