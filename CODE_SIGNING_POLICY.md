# Code signing policy

**Last updated:** 10 October 2026

**Project:** [SavedDesk](https://github.com/asteroidcrib729/saved-desk)

**Maintainer:** Faraz Hussain ([asteroidcrib729](https://github.com/asteroidcrib729))

## Current status

SignPath Foundation declined SavedDesk's application twice because it does not yet have sufficient public adoption and visibility. No Foundation signing integration is active. The separate Microsoft Store MSIX route is being prepared; it does not sign the existing EXE. Current Windows preview installers are **unsigned**; no SignPath sponsorship, certificate, independent security certification or SmartScreen reputation is claimed.

If the application is approved and signing is operational, the acknowledgement will be: **Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org)**. This describes the intended future arrangement, not the current previews.

## Responsibilities

| Role | Responsible person | Responsibility |
| --- | --- | --- |
| Author / committer | Faraz Hussain | Maintain SavedDesk source, dependencies and build scripts |
| Reviewer | Faraz Hussain | Review contributions, release changes and build inputs |
| Signing approver | Faraz Hussain | Review each request and explicitly approve eligible releases |

SavedDesk currently has one maintainer; these roles do not imply independent review. Any future team or role change must update this policy. Repository and signing-service accounts must use multi-factor authentication. This is a requirement to verify during setup, not an assertion that account settings have already been checked. Signing credentials must be kept out of Git, release assets and logs.

## Unsigned preview distribution

A public unsigned **prerelease** may be approved by the maintainer after the complete asset set, corresponding sources/notices, source origin and exact-installer Windows lifecycle evidence have been reviewed. Its notes must say that it is unsigned, explain Windows publisher/reputation warnings and document outstanding acceptance checks. The preview must not be represented as a signed or fully accepted production release.

This exception permits preparation of the tested 0.2.10 GitHub build for the SignPath application. It does not clear historical previews through 0.2.3, bypass redistribution review, replace missing installer tests or convert incomplete live-platform results into a pass. The additive [preview preparation tool](packaging/prepare-public-preview.py) verifies the retained assets and writes separate evidence and release notes; it does not publish automatically or change those assets.

The strict signed-release collector remains unchanged: `packaging/build-release.ps1 -PublicRelease` requires trusted timestamped signatures and complete acceptance evidence. The `public_release_ready` field retains that stricter meaning. An unsigned preview can have `unsigned_preview_ready: true` while `public_release_ready` remains false.

## Intended signed-release process

Once approved, the signing workflow will use GitHub-hosted builds of reviewed source tags and origin verification. Every signing request will require explicit maintainer approval. Artifact rules will identify SavedDesk-owned executables and the installer, enforce product/version metadata and preserve third-party components.

Upstream binaries must not be re-signed under SavedDesk's Foundation signing policy. Microsoft's supplied WebView2 installer retains its original signature. The frozen Python worker contains third-party runtime code; its treatment must be reviewed with SignPath before choosing signing rules. No blanket rule that signs every bundled EXE/DLL is authorized.

Signed outputs will receive new checksums and manifests, signature/timestamp verification and installation checks for the resulting installer hash. Existing unsigned archives and version tags will remain immutable; a signed distribution will use a new version rather than silently replace the preview. A signature does not guarantee that content-provider behavior will remain unchanged or that Windows will suppress reputation warnings.

## Privacy, distribution and reports

The application does not automatically send its library or account credentials to SignPath or the maintainers. Future signing operates on maintainer-submitted build artifacts and build-origin information, not users' downloaded content. See the [Privacy Policy](PRIVACY_POLICY.md), including relevant third-party privacy links, and the [Terms of Service](TERMS_OF_SERVICE.md).

Official downloads are listed on [GitHub Releases](https://github.com/asteroidcrib729/saved-desk/releases). Report unexpected signatures, altered assets or security concerns to [farazhussain5000@gmail.com](mailto:farazhussain5000@gmail.com), without sending cookies, tokens, private content or unredacted logs.

For setup and remaining owner actions, see [SignPath application and preview preparation](development-plans/signpath-and-public-preview.md). The external [Foundation conditions](https://signpath.org/terms.html) and [GitHub integration documentation](https://docs.signpath.io/trusted-build-systems/github) govern service approval and setup.

## Microsoft Store MSIX packages

The separate MSIX build uses Microsoft's Store package-upload route, which supplies Store signing. It does not claim that Microsoft signs the web-hosted NSIS EXE. A Store MSIX must match the assigned identity and pass capability, packaging and policy review; the local SavedDesk.MsixPreview identity is for testing only. Local self-signed test packages require explicit test-machine trust and are not publicly trusted releases. Fixed Version WebView2 binaries retain Microsoft's signatures and applicable license terms. The existing NSIS signed-production release gates remain unchanged. See [MSIX packaging and submission](development-plans/development-plan-05.md).
