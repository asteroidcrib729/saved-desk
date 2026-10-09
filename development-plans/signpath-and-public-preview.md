# SignPath application and unsigned preview preparation

**Updated:** 9 October 2026. Current app: 0.2.10. This document supersedes the earlier rule that all public binary previews must wait for signing. It does not change application behavior, licensing, quarantined previews or strict signed-production acceptance.

## Current state

- Public source/default branch: [asteroidcrib729/saved-desk, main](https://github.com/asteroidcrib729/saved-desk).
- Hosted [source checks](https://github.com/asteroidcrib729/saved-desk/actions/runs/37956592973) and [Windows release build](https://github.com/asteroidcrib729/saved-desk/actions/runs/37960062238) passed.
- Existing tag v0.2.10 refers to source commit 12e7861d60a32763b7914fcc8848544a364849f1. Do not move/recreate it for documentation changes.
- Its nine GitHub draft assets are retained unchanged. Exact installer SHA-256: **19e8b9d810888d686843f80dd72c7e0467bc6912ca38e603e1f6951f701f4dc6** (265,106,670 bytes). This differs from the earlier local build; use the hash matching the actual release.
- The supplied workflow ZIP matched GitHub's archive digest; all nine assets and eight checksum entries matched. Review verified 304 corresponding-source records and 258 nongenerated source files against the tag. Only the regenerated macOS ICNS differs; Windows icons and application code match. Generated licensing records were reviewed separately. The original manifest honestly retains source_dirty=true.
- Eleven guarded host lifecycle checks passed for this GitHub-built installer, with all 386 original profile files verified unchanged. Existing-host evidence is not VM/absent-runtime-machine acceptance.
- The installer is unsigned, and fresh seven-platform live-download acceptance is not cleared for its hash. Those strict gates remain false.
- No SignPath organization, certificate, API token or approved signing configuration is available. The current workflow supports unsigned review/Azure signing only. Approval must not be assumed.

## Policy and preview tool

The root [Code signing policy](../CODE_SIGNING_POLICY.md) states pending status, maintainer roles, privacy, a narrowly scoped unsigned-prerelease exception and the intended approved signing process. The README and prepared release page use the heading/link required by the [Foundation conditions](https://signpath.org/terms.html). The acknowledgement remains conditional until approval and operational signing; no current sponsorship is represented.

`packaging/prepare-public-preview.py` verifies the complete original asset inventory against the retained GitHub digest receipt and original checksums/manifest. It rejects quarantined versions, unreviewed source differences, missing source/notice archives, mismatched installer evidence, missing lifecycle/restoration checks, signing claims and changed/corrupt assets. It reads the already reviewed evidence; the receipt is not an independent cryptographic attestation and must originate from the reviewed GitHub verification, not fabricated metadata.

The tool writes a separate report, public verification ZIP, supplementary checksums and release-page body. It never modifies an existing original asset, overwrites an output directory or publishes a release. `public_release_ready` continues to mean strict signed-production readiness; `unsigned_preview_ready` is a distinct preview-policy result. `build-release.ps1 -PublicRelease`, signature checks and release-evidence.py remain unchanged.

Run from the project root after reviewing the inputs:

```powershell
.\.venv\Scripts\python.exe packaging/prepare-public-preview.py --tag v0.2.10 --assets release-artifacts/github-v0.2.10-37960062238 --evidence .cache/github-release-0.2.10-verification --output .cache/signpath-preview-v0.2.10
```

Output remains ignored. Only the explicitly reviewed files below belong as new draft release attachments:

- SavedDesk-preview-verification-0.2.10.zip
- PREVIEW_SHA256SUMS.txt
- unsigned-preview-review.json

Use release-page.md as the GitHub release description, not as a replacement for the original hashed release-notes.txt. Do not replace original acceptance-review.json, manifest, checksums, sources or installer. Original reports predate the host follow-up; the supplement explains the later result and outstanding gates.

## Owner actions before submitting

1. Verify GitHub two-factor authentication is enabled for your account. Enable SignPath MFA when that account becomes available; do not share recovery codes or credentials.
2. Review the prepared v0.2.10 draft notes/assets and choose to publish it as an **unsigned prerelease**, retaining the prerelease designation rather than marking it a stable production release. The maintainer makes this public-distribution decision; preparation does not publish automatically.
3. Open the repository, policy and download page while signed out. Confirm that the Windows installer and companion archives are visible, the signing policy is linked, and pending/unsigned status remains explicit.
4. Complete the SignPath form using the fields below and submit it yourself, including any required consent/reCAPTCHA. No application is submitted by repository preparation.
5. Respond honestly to any requests for reputation or technical review. A new repository and maintainer-run tests are not independent adoption evidence; approval is discretionary.

## Application values

| Field | Value |
| --- | --- |
| Project name | SavedDesk |
| Repository / homepage | https://github.com/asteroidcrib729/saved-desk |
| Download URL | https://github.com/asteroidcrib729/saved-desk/releases |
| Privacy Policy URL | https://github.com/asteroidcrib729/saved-desk/blob/main/PRIVACY_POLICY.md |
| Code signing policy | https://github.com/asteroidcrib729/saved-desk/blob/main/CODE_SIGNING_POLICY.md |
| Maintainer / email | Faraz Hussain / farazhussain5000@gmail.com |
| Maintainer type / build system | Individual maintainer / GitHub Actions |
| Category | Multimedia or Audio/Video if offered; otherwise the closest utility category. Available choices were not verified. |
| Wikipedia / company | Leave optional fields blank when not applicable |
| Discovery | AI / LLM tools; ChatGPT Codex |

**Tagline:** A free, open-source Windows application for downloading and organizing supported social media content in a local library.

**Description:** SavedDesk is a free, open-source Windows desktop application for downloading, organizing and viewing supported social media content on the user's own computer. It provides a searchable local library, integrated media playback and tools for managing downloaded files. Users initiate downloads through supported content links or supported account-based collections. The project focuses on convenient local access to content users are permitted to download.

**Reputation:** SavedDesk is a newly published, individually maintained, MIT-licensed open-source project. It does not yet have established independent download statistics or media coverage. Its source, development documentation and automated checks are publicly available. The Windows release workflow passed, and its exact installer passed installation, upgrade, application launch and uninstall checks on the maintainer's Windows system. These are maintainer-run checks, not independent certification. Include the repository and two Actions run links above. Do not describe owner/private draft downloads as community adoption or fabricate stars, endorsements or third-party review.

The releases page is a valid application download destination only once its installer is publicly available. The Foundation asks for an already released application and verifiable reputation; publishing an unsigned preview does not guarantee approval.

## Work after approval

This is a setup checklist, not a working or verified integration. Follow the assigned Foundation configuration and [official GitHub integration guide](https://docs.signpath.io/trusted-build-systems/github).

1. Enable MFA and configure Faraz Hussain's submitter/reviewer/approver roles. Enable explicit approval for every signing request. Install the SignPath GitHub App for the saved-desk repository only when required by the assigned setup.
2. Obtain the SignPath organization ID, project slug, artifact-configuration slug and signing-policy slug. Store nonsecret identifiers in a protected GitHub release-signing environment and the submitter API token as an environment secret. Never paste the token into chat or commit it. Configure the environment's required-reviewer rules appropriate for a sole maintainer; do not invent an independent reviewer.
3. Ask SignPath to review the frozen Python worker and mixed third-party payload before defining signing targets. SavedDesk's own native binaries and installer are intended targets; upstream binaries retain their existing signatures/licenses. Do not apply recursive signing to the bundled Python/Node/Microsoft payload.
4. Add a pinned official SignPath action to a GitHub-hosted release workflow. Upload unsigned inputs as an Actions artifact before submitting its artifact ID, wait for the approved signed result and verify origin/product/version restrictions. Exact identifiers/action revision/artifact rules must follow the approved account configuration rather than guessed values.
5. Signing nested application executables changes the installer payload: arrange signing before final installer assembly, then sign the installer. A signed outer installer alone does not satisfy the existing all-SavedDesk-executable signature gate. Do not weaken that gate to conceal a configuration mismatch.
6. Use a new source version/tag for the signed release. Verify trusted signatures/timestamps, generate new hashes/manifests and repeat exact-installer lifecycle tests. Keep unsigned v0.2.10 immutable. Complete or explicitly revisit the still-unmet signed-production live-platform gate before production publication; do not relabel historical results.
7. Change the policy acknowledgement from conditional to operational only once approval and signing actually exist. Publish the verified signed release with its corresponding source/notices and updated user guidance.

## Validation and publication record

All 29 packaging checks passed, including sixteen new preview success/failure cases. The exact GitHub asset set passed preview validation with unsigned_preview_ready=true and public_release_ready=false. Source/ignore audit and Markdown links are checked before delivery. The public draft is prepared without publishing it, and source documentation is delivered on main. Actual test counts, commit and draft preparation are reported in the task result. No application/runtime code, historical archive, installer signature, source tag or owner account grant is changed by this work. No fresh runtime build is required for documentation and additive release tooling.
