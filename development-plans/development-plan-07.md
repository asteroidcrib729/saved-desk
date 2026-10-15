# Development plan 07 - Repeatable Windows EXE and MSIX builds

Date: 15 October 2026. Follows [Store remediation plan 06](development-plan-06.md).

## Problem

The EXE workflow passed the entered application version directly to checkout as a required Git ref. A user entering 0.2.11 received a generic missing-branch/tag failure before any build. Pushing application changes to main did not create a release tag. The MSIX workflow already supported building the selected branch.

## Implementation

- EXE builds default to the selected workflow commit with release_tag empty. Versions are read and cross-checked from project files.
- An optional existing release_tag accepts vMAJOR.MINOR.PATCH or the corresponding bare version, resolves only an exact tag, and verifies the tagged application's version. Missing tags produce instructions before installing dependencies or building.
- Branch builds do not create tags or public releases. Draft creation requires a real version tag pointing to the selected source; historical quarantines and no-overwrite safeguards remain enforced.
- Use version/run/attempt-specific EXE artifact names, bind the draft download to the build job's exact artifact, and report source commit, version label and tag status in the run summary.
- Reuse the worker only after its full source/exclusion audit; retain the fresh installer and media/notices/source checks.
- Correct EXE release notes for included FFmpeg/FFprobe and explicit-consent gallery setup.
- Keep EXE offline-WebView2 and MSIX Fixed Version runtime review separate. Keep the MSIX's existing exact-commit checkout, Store identity verification and archived payload hash checks.
- Use the verified upstream Node 24 artifact download action for optional draft creation.
- Add complete normal-run, tagged-run, signing, artifact, draft and rerun instructions to the README.

## Verification

Eight isolated Git tests pass for branch/tag selection and draft safeguards. Full packaging suite: 51 passed. Both installer workflows pass actionlint 1.7.12; the release PowerShell script parses successfully. Exact-commit hosted EXE/MSIX build results are pending. No new signing service, browser-store approval, installer lifecycle acceptance or Microsoft certification is inferred from a packaging workflow.

## Maintainer operation

For EXE: Actions > Windows release preview > Run workflow > main, empty release_tag, signing_mode unsigned, create_draft off.
For Microsoft Store: Actions > Windows MSIX package > Run workflow > main, package_identity store.
Use a new run after workflow changes; old-run retries preserve old inputs and code.
