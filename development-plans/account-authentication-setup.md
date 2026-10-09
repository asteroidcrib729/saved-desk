# Account authentication setup and owner actions

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** The README gives complete per-platform connection steps. Google identity is optional and separate from YouTube browser-approved playlists; public Facebook/TikTok/Pinterest downloads need no OAuth registration.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

**Current follow-up (0.2.10, 9 October 2026):** The app guidance and native/preview registry now exclude private Facebook/TikTok/Pinterest content and remove Pinterest OAuth prerequisites. Existing browser approvals remain available for supported public links; Instagram/X and YouTube playlist routes are preserved. Google lifecycle acceptance uses controlled native credentials and provider responses, as the owner explicitly requested, preserving the current live Google grant. See [scope and verification](scope-and-lifecycle-0.2.10.md) and [owner-reported X endurance](owner-x-endurance.md). Historical version results below retain their original scope.

**0.2.9 Watch Later fix:** The native and worker URL validators now recognize Watch Later (list=WL) and Liked videos (list=LL). Both require an approved YouTube browser session; Google identity alone does not supply it. Unknown short IDs and malformed URLs remain rejected. See [fix and verification](watch-later-fix-0.2.9.md). On 9 October 2026, the owner confirmed that the two-video Watch Later playlist downloaded successfully using this browser-approved route. This confirms the reported download, not completion of the OAuth media replacement or general private-video acceptance.

**Owner scope decision (9 October 2026):** Pinterest remains public/shareable-link only; its OAuth and secret-board work is cancelled. Facebook and TikTok also exclude private/restricted content. Their optional identity-only integrations are under feasibility review, not authorized implementation or a requirement for public downloads. Instagram/X account downloading and the existing Google identity/YouTube browser-approved playlist workflow remain. See [Facebook/TikTok requirements](facebook-tiktok-authentication-feasibility.md). The 0.2.10 app implements this guidance and provider-status revision. Browser approval controls remain; no universal content-visibility classifier is claimed.

Updated 9 October 2026. Implementation slice: 0.2.8. [Development Plan 04](development-plan-04.md) remains the full plan, not a claim that every phase is complete.

## What is built

- Native provider registry distinguishes identity flow, private-media capability and setup requirements.
- Google Desktop identity flow: system browser, random-port IPv4 loopback, one-use state, S256 PKCE, five-minute timeout, cancellation and authenticated Google userinfo subject.
- Google identity keys use provider, issuer, registered client and stable subject; changing a display name or refresh token does not change ownership.
- Versioned Windows current-user DPAPI storage; atomic replacement; single-flight refresh; disconnect invalidates late responses. Remote revocation is a separate explicit operation.
- Google Desktop OAuth JSON import is native-only and rejects Web client files and unapproved endpoints. Google's installed-client credential, when present, stays in the protected envelope. It is not a confidential server secret.
- Accounts distinguishes legacy browser approvals from verified identity and media capabilities. These OAuth credentials are not sent to workers or substituted for browser cookies.
- Existing Instagram/X connections, legacy public-link paths, Discord attachments, download ownership and media files remain separate. No legacy history is silently adopted by a Google identity.

The explicit **Reset Google identity setup** confirmation removes only this local OAuth configuration and recovers corrupted envelopes; it leaves remote grants and legacy browser approvals alone.

Google uses authenticated HTTPS userinfo after exchanging the authorization code; the implementation does not parse or trust an unverified ID-token payload. The provider subject stays in the protected envelope. Only a hashed account key, display name, granted scope names, expiry, public client ID and redacted status reach the UI.

This is a Google identity integration, not a private YouTube downloader. General private-video media for YouTube is not implemented. Private Facebook/TikTok/Pinterest content is excluded by the owner; their official identity integrations are not implemented. Discord attachment downloading already works without an identity connection.

## What you need to do now for Google identity

This is the only newly implemented live identity flow. The owner-supplied Google Desktop JSON in the ignored oauth-clients directory was validated and its configuration stored locally using current-user DPAPI. The native app successfully decrypted it in an isolated profile; no credential was exposed in its status. The owner subsequently reported successful browser sign-in and the message 'Google identity checked. This grants no private-media capability'. Registration/import and initial sign-in/check are complete on this machine; they do not prove an expired-token refresh or remote revocation. Steps 1-7 below describe setup and lifecycle checks on another installation. The next download decision is the YouTube media use case described below.

1. Open [Google Cloud Console](https://console.cloud.google.com/) using the account that will own SavedDesk's registration. Create a dedicated SavedDesk project. Using a dedicated project avoids revocation affecting unrelated applications.
2. Open Google Auth Platform. Configure Branding with the application name and support/developer contact. For owner testing, choose the appropriate Audience/testing mode and add your Google account as a test user if the console requires it.
3. In Data Access, configure only basic account identity permissions: OpenID and profile. Do not add YouTube video scopes on the assumption that they allow offline downloading. This implementation requests `openid profile` and does not need YouTube Data API activation.
4. In Clients, choose **Create client > Desktop app**. Do not choose Web application. Name it SavedDesk Desktop and download its JSON configuration.
5. Keep that JSON outside the checkout or in the explicitly ignored local oauth-clients directory. Do not include that directory in publication. In the newly built Windows app, open **Accounts > Verified identity and download access > Configure Google Desktop sign-in > Import Desktop OAuth JSON**. Select the downloaded file. The app reads it natively and stores its configuration in the current user's protected envelope; the original file is not copied into the repository.
6. Select **Sign in with Google**, choose the intended account in the system browser and grant the displayed identity permissions. Return to the app. It should display the verified name and the identity-only limitation.
7. Select **Check or refresh identity**. Test **Cancel Google sign-in** during a second attempt and **Disconnect Google identity** when finished. Disconnect is local. **Revoke Google access** additionally requests remote revocation, after a confirmation explaining that Google revokes the project's grants.
8. Report any non-secret error and whether the callback completed. Do not send the JSON, client credential, token, callback URL or cookies in chat.

You may enter the public Desktop client ID instead of importing JSON. Import is preferred because some registrations include an installed-client credential used during token exchange. Confidential Web client secrets are never accepted. Google's native-app flow, loopback and PKCE requirements are documented in [Google's native OAuth guide](https://developers.google.com/identity/protocols/oauth2/native-app); authenticated identity comes from [Google userinfo](https://developers.google.com/identity/openid-connect/openid-connect).

Live Google sign-in and initial identity checking are owner-reported successes. Synthetic/native tests and the owner result do not establish production provider approval, expired-token refresh, revocation or private-media access.

## YouTube private media is a separate requirement

Google identity does not provide a transferable browser session or a playable private-video URL. A permitted media/export route must be selected and verified before private YouTube downloading can be implemented. YouTube API clients have download/offline-use restrictions; account sign-in does not waive them. See [YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies).

The owner selected public videos within private playlists, and confirmed the two-video Watch Later result below. Other own-upload or shared private-video use cases are not selected by that result. A private playlist and a private video are different resources and need different access handling. If pursuing an API-based audiovisual download product, obtain the applicable provider approval/permission first. Do not register broad scopes or supply private links as a substitute for this route decision. Existing public links keep their current download path.

## Selected YouTube use case: public videos in private playlists

The owner selected this case after reporting successful Google sign-in and identity checking. A private playlist is a restricted listing; its videos may still be public. Google identity is complete for the reported initial sign-in/check, but the Google OAuth grant is not used by the current downloader.

The existing finite-playlist path already accepts approved YouTube browser sessions. This is a legacy transport candidate for owner-managed testing, not a claim that the OAuth replacement or all private-media capabilities are complete. It does not use YouTube Data API playlist discovery or require additional Google OAuth scopes. A fresh browser approval must come from the profile that can open the target playlist; the Google identity must not be treated as proof that another profile's cookies belong to the same account.

1. In the intended browser profile, open the two-video Watch Later playlist or a normal private playlist containing public videos and verify both entries are visible.
2. In SavedDesk, open Accounts > Browser connections and legacy approvals. Choose that browser/profile and use YouTube > Reconnect from browser (or Connect using this browser). Approve the SavedDesk connector if required.
3. Open Add download, choose YouTube, paste the actual https://www.youtube.com/playlist?list=... URL and choose Download new items. A watch URL containing a list parameter downloads only that video. Watch Later (list=WL) and Liked videos (list=LL) are supported in 0.2.9; they require browser approval. Ongoing radio/Mix playlists remain unsupported.
4. Check completed status, saved/already-available counts and playback. Retry with a changed browser approval by adding a new job; old jobs remain bound to their original approved session.
5. Report the exact redacted failure if it does not complete. The owner confirmed the two-video Watch Later download on 9 October 2026. Broader private-playlist acceptance and the inaccessible-account live control remain unverified.

Three existing synthetic regression checks passed for same-origin in-memory YouTube cookies, wrong-session rejection before engine/network access, and bounded playlist-ID resolution/host decisions. The owner subsequently confirmed live Watch Later downloading; these synthetic checks do not extend that acceptance to other account/content combinations. Official downloader guidance: [yt-dlp cookies and playlists](https://github.com/yt-dlp/yt-dlp/wiki/FAQ).

## Pinterest: public links only

The owner withdrew Pinterest OAuth/private-content work on 9 October 2026. Continue supported public pin/board links. No secret-board scopes, confidential OAuth service or private fixtures are required. The app registration was owner-reported pending approval; SavedDesk has not cancelled it with Pinterest.

Legacy browser approval remains in the current 0.2.10 application; it must not be described as verified identity or supported secret-board access. The 0.2.10 build updates the guidance and provider status; it does not implement universal visibility classification in the extractor.

## Facebook: optional identity only

Official Facebook Login create-app, permissions and manual web/desktop documentation was reviewed on 9 October 2026, resolving the earlier retrieval limitation.

If identity is selected later: create a Meta app with Facebook Login, request public_profile only, inspect increased-access/live-mode requirements for non-role users, configure supported redirects and data/deauthorization handling, and keep the documented exchange secret on an owner-controlled service. Business verification depends on actual dashboard requirements. Email, private/group/Page media permissions are outside scope.

Public videos/Reels keep the existing adapter. Basic identity does not deliver media URLs or replace browser cookies. No new registration is required for public-link downloading. See [verified requirements](facebook-tiktok-authentication-feasibility.md#facebook-requirements-if-identity-is-selected).

## TikTok: optional identity only

Desktop Login Kit documents localhost/127.0.0.1 callbacks and mandatory hexadecimal SHA-256 PKCE. Minimal identity uses user.info.basic. Production adds verified website/policy URLs, a working demo and provider review; confidential exchange/refresh secrets must stay off the distributed desktop.

Keep public video/photo links. No private/followers-only or Data Portability work remains in scope. Public-video-list permission does not supply an arbitrary share-link media download. No Login Kit registration is needed merely for current public downloads. See [verified requirements](facebook-tiktok-authentication-feasibility.md#tiktok-requirements-if-identity-is-selected).

## Discord

**Nothing is required from you for the current attachment feature.** Keep using a fresh full `cdn.discordapp.com/attachments/...` URL, including its signed query. No bot, server administration or developer application is needed.

Optional Discord identity is deferred because it adds no access to the attachment workflow requested. Only if you later want identity: create a Discord developer application and configure a reviewed OAuth identity flow/service using `identify`. That would still not grant private-channel history or renew arbitrary expired media links. [Discord OAuth documentation](https://docs.discord.com/developers/topics/oauth2).

## Shared owner decisions and remaining development

Facebook/TikTok implementation is conditional on selecting a useful identity/public feature. No new registration, secret service or private resource is required now. If selected, agree service ownership, domain, hosting, secret custody, retention and review requirements before deployment; the service does not exist.

Controlled Google lifecycle acceptance is the owner-selected scope for this cycle; actual account revocation and expired-token refresh are optional future live checks. Account-boundary/public-download regressions remain relevant. Private Facebook/TikTok/Pinterest adapters and fixtures are cancelled rather than pending. Discord remains media-link only without sign-in.

The 0.2.10 account labels, help and native provider registry implement the public-only guidance and remove Pinterest OAuth requirements. Browser transport controls and existing download history remain. No additional Windows/GPU coverage, multi-hour test, signing purchase or Git publication is required for this review. SQLite encryption, portable recovery and automatic updates remain planned.
