# SavedDesk 0.2.11 Store resubmission

This is the maintainer/reviewer procedure for the corrected 0.2.11.0 MSIX. It does not claim Microsoft certification or signing before approval.

## Store description dependency disclosure

Place this near the beginning of the description:

> Additional gallery downloads require a separate tools setup, and browser-account features require the SavedDesk browser connector. Public YouTube/Facebook/TikTok video links and Discord media attachment links do not require account sign-in. FFmpeg and FFprobe are included.

Until companion browser-store publication is approved, disclose that this preview uses the documented unpacked/temporary extension installation. The application cannot silently install a browser extension or grant its permissions.

## Notes for certification

The 0.2.10 missing-FFmpeg and incomplete browser-connection findings are addressed in 0.2.11.

1. Install the submitted 0.2.11.0 MSIX on Windows x64. No system Python, separate FFmpeg executable or Google OAuth developer client is required for the public-video route.
2. Open Settings > Download tools > Check download tools. Included video conversion and inspection should be ready on a fresh profile.
3. Add a currently available public YouTube video/Shorts link without connecting an account. Wait for completion and open the saved video. Platform availability/challenges can vary; distinguish a provider error from a missing local dependency.
4. For Instagram/X/Pinterest/TikTok photos, select Set up gallery downloads. Review the independent publisher downloads and consent checkbox, then choose Download and set up tools. Actual archive hashes and installed versions are checked; no manual interpreter selection is required.
5. For browser account approval, first sign in on the platform in the intended browser profile. In SavedDesk > Accounts choose that browser and expand Set up or repair the browser connection.
6. Prepare connector and open extension folder. Load the current exported extension according to the visible browser instructions. Remove an older unpacked copy before loading this version. The export is outside WindowsApps and the native host is registered for the current user.
7. Open the SavedDesk toolbar button and choose Check connection again. Return to SavedDesk and choose Check extension connection. This check reads no account cookies.
8. Click Connect for the desired platform. Open the toolbar popup again and approve that platform's permission. SavedDesk verifies/records the approved connection and returns to the foreground. Opening a website sign-in page alone does not complete this step. A missing extension is reported before waiting; a missing gallery engine is reported before Instagram/X approval.
9. Cancellation and missing/expired approval produce recoverable messages. Public downloads remain independent of optional identity sign-in.
10. Google identity under advanced controls is optional and does not authorize private YouTube media. Instagram/X private downloads and supported YouTube account playlists retain their existing scoped browser route. Facebook/TikTok/Pinterest remain public-link features.

Use only a disposable authorized account if live private-content testing is required. Any credentials Microsoft requires belong in its private certification channel, never this public document.

## Build and evidence

Use the exact Store-identity package and its matching checksum, notices, original-source archive and dependency-source archive. The Store identity remains FarazHussain.SavedDesk, publisher CN=F14492EE-882F-4921-8253-B73CEB32823A. Upload the unsigned MSIX through the MSIX package submission; Microsoft provides Store signing. Local preview certificates are only for isolated host testing and must not be submitted.

Record new automated and installed-app results in development-plan-06.md. Earlier 0.2.10 hashes, lifecycle results and owner endurance reports remain historical evidence.
