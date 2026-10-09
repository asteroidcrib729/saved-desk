# Account authentication implementation and verification: 0.2.8

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** This is historical 0.2.8 evidence. Google lifecycle acceptance is now complete through controlled 0.2.10 tests, preserving the live grant. Private Facebook/TikTok/Pinterest work is excluded.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

Recorded 8 October 2026. This is the implemented slice of [Development Plan 04](development-plan-04.md), not completion of every provider/private-media integration. [Owner setup and outstanding actions](account-authentication-setup.md) contains precise registration and service prerequisites.

## Implemented behavior

- Native Google Desktop OAuth: system browser, random-port IPv4 loopback, S256 PKCE, random state, single-use callbacks, five-minute timeout and cancellation. Authenticated HTTPS userinfo supplies the stable subject; no ID-token payload is trusted.
- Versioned current-user Windows DPAPI storage protects configuration and grants. Atomic writes, single-flight refresh, stable identity namespaces and generation checks prevent late responses from restoring cancelled/disconnected credentials.
- Accounts supports configure/import, sign-in/cancel, identity check/refresh, local disconnect, confirmed remote revocation and corrupt-storage reset. Tokens stay native; public configuration, opaque identity keys and redacted status reach React.
- The five-provider registry separates identity, setup and media capability. Legacy browser approvals remain available with accurate labels. OAuth is not sent to workers or substituted for session cookies.
- Instagram/X ownership, sessions, public/CDN download paths, catalog and media remain separate. No transactional adoption of legacy history or new private-media adapter is claimed.
- Default packaging builds a fresh worker. Explicit -ReuseWorker requires complete payload/exclusion/source proof and fails closed on stale proof.

## Verification

| Check | Result |
| --- | --- |
| Native application/library | 81 passed, including 26 authentication cases |
| Native connector host | 8 passed |
| Worker/downloader | 154 passed |
| UI/accessibility | 80 distinct final-suite cases covered by the regression run and targeted reruns |
| Packaging | 13 passed |
| Browser connector | 12 passed |
| Live Windows HTTPS | Google unauthenticated userinfo returned 401; deliberately invalid token grant returned 400 |
| Real native account UI | Eight checks passed: registry/setup, invalid-ID rejection, UI-to-native save, DPAPI protection, no inferred identity, restart persistence, packaged worker/catalog and local reset |
| Real native download smoke | Files, SQLite, skip/repeat, cancellation and reload passed |
| Debug/release payload | Complete staged worker/source/exclusion manifests passed |

The [native tests](../desktop/src-tauri/src/auth/tests.rs) cover callback validation/replay, real loopback sockets, expiry/cancel races, Desktop import, credential redaction, DPAPI storage, refresh rotation/account binding, single-flight refresh, disconnect/revoke failures, identity-only capabilities and preservation of legacy catalog bytes.

The initial 79-case UI run passed 75 and failed four: three timeouts during native compilation and one real duplicate-heading ambiguity. The heading and dialog focus restoration were corrected. The final targeted 13-case rerun passed all prior failures and the added reset case; the final inventory is 80. This is aggregated coverage, not one fresh 80-case run. The worker's full clean run passed 154 after its PATH fallback fixture was isolated from a host FFmpeg override.

One isolated native launch exited early after the final rebuild. The subsequent download smoke and account/restart harness passed on the same final debug binary; no reproducible startup failure was found. The initial failure is not counted as a pass.

Live Google HTTPS transport is verified. Registered account consent, code exchange, refresh and remote revocation still require owner live acceptance. No real private account/content result is claimed by synthetic/native tests. The earlier 504-item Instagram result remains owner-reported evidence.

## Final build identity

Debug and release targets and the NSIS installer were rebuilt after the final cancellation-message fix.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| debug | 18935808 | `7823d39daa3c6cf5b50eb66291a329c3d376af4992a2b4336d18f4fd2516405b` |
| release | 14444544 | `c5d56e0f19d28dd9e7b86fe7745527fca527aab5be6220b3695777b1d795e46a` |
| installer | 262811163 | `477f919061c89692a15afa6d1e759686bf390864c0a361cc8d40444a5229e72e` |
| native_host | 1976832 | `260692219b486d6245ebd240c7f570492a5486c32dc1175e6314c278bae4135b` |

Artifact paths are recorded in .cache/authentication-0.2.8-verification.json:

- desktop/src-tauri/target/debug/saveddesk.exe
- desktop/src-tauri/target/release/saveddesk.exe
- desktop/src-tauri/target/release/bundle/nsis/SavedDesk_0.2.8_x64-setup.exe
- desktop/src-tauri/target/release/saveddesk-native-host.exe

The build retains Microsoft's verified offline WebView2 prerequisite 1.3.275.13. This installer was built and its staged payload verified; a new installation/upgrade/uninstall cycle is not claimed here. Recorded 0.2.7 lifecycle evidence is historical. The installer remains unsigned as agreed; signing follows publication. Historical 0.2.7 archives remain immutable.

## Distribution checks

The worker exclusion audit passed for 1,130 files and 1,643 frozen modules. Gallery-dl and FFmpeg remain separately selected external user tools, excluded from the redistributed worker/installer. The inventory records 409 components and 718 notices, no missing notice component and a cleared current-payload redistribution flag. Corresponding-source collection contains 289 archives, no download failures and complete source closure. No new Python package or combined gallery-dl/Requests worker was introduced.

Source-candidate, ignore, version and Markdown-link validation is recorded in .cache/git-readiness-audit.json. This pattern/path scan is not a complete security assessment. Native evidence is .cache/native-authentication/7c302db1-9306-4184-ae9e-2594ef83bed1/result.json. Build logs are .cache/authentication-0.2.8-prototype-final.log and .cache/authentication-0.2.8-release-final.log. Generated and isolated-test artifacts remain excluded from source publication.

## Remaining owner actions and engineering

- Google: register a dedicated Desktop client, import locally and run identity/refresh/cancel/disconnect/revoke acceptance. Decide the permitted YouTube media/export use case separately.
- Pinterest/TikTok: obtain eligible approved registrations/products/scopes; decide ownership/domain/hosting/secret custody for confidential HTTPS exchange. Service and provider/media adapters still require implementation.
- Facebook: confirm current official permissions and a usable route for the intended content before registration/adapter implementation. Provide public documentation or non-secret permission descriptions.
- Discord: no new setup for fresh attachment links. Optional identity adds no server-history capability and remains deferred.
- Supply disposable authorized and denied private resources after their media adapters exist. Private testing remains owner-managed.
- Production provider review, privacy/use-case/deletion pages and publisher configuration remain provider-specific tasks. Never send credentials in chat or commit configuration/secrets.

Extra Windows/GPU coverage and multi-hour testing are outside scope. Git publication and signing retain their agreed schedule. SQLite encryption, portable recovery and automatic updates remain planned.


## Owner-supplied Google configuration follow-up

The owner provided a Google Desktop client JSON in the local oauth-clients directory. Its client type, size, client/credential format and exact Google endpoints were validated without printing credentials. Configuration was saved in the normal app-local-data OAuth envelope with Windows current-user DPAPI and atomic replacement. Existing grants, browser sessions, catalog and media were preserved.

An isolated profile copied the encrypted configuration and the actual 0.2.8 native build accepted it. The native status did not expose the installed-client credential, showed no verified identity without consent and kept private YouTube capability disabled. Sanitized evidence: .cache/native-oauth-configuration/1fa381cf-d572-473f-80da-f79db68380de/result.json. This was a local decryption/status check; no Google authorization/token request was made.

The complete oauth-clients directory is ignored, including files with arbitrary names; repository-audit probes cover JSON and other local files in that directory. These local configuration and documentation changes do not change desktop binaries or their recorded hashes. The next owner step is Accounts > Verified identity and download access > Sign in with Google, followed by the browser account/consent prompt and live lifecycle acceptance. New private-media adapters remain pending.


## Owner-reported Google sign-in acceptance

The owner reports completing Google browser sign-in and receiving: 'Google identity checked. This grants no private-media capability'. This is successful owner-run identity acceptance, not an error. Initial authorization and a subsequent authenticated identity check are reported as passing. It is not proof of expired-token refresh, remote revocation, production provider approval, channel selection or private-video downloading; those earlier evidence boundaries remain in force.

The implementation requests identity scopes only. No further registration/import/reconnection is needed to repeat the completed step. The next download work requires distinguishing public videos in private playlists, the owner's uploaded videos and videos shared privately by other owners. Remaining media work is an adapter/access-route task; it is not resolved by renaming the status or adding an unverified capability flag.
