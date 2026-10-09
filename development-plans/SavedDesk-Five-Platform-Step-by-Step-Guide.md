# SavedDesk five-platform account and download guide

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** This focused companion remains useful; the root README now includes all seven platforms, installation, external tools, browser connector, downloads and every Settings control.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

Updated 9 October 2026; derived from [revised Development Plan 04](development-plan-04.md). This guide replaces its earlier Pinterest/private-media instructions.

## Current decisions

| Platform | Supported baseline | Authentication direction |
| --- | --- | --- |
| YouTube | Public videos/finite playlists; owner-confirmed two-video Watch Later via browser approval | Google Desktop identity implemented; not used as a download credential |
| Facebook | Supported public video/Reel links | Optional identity if a useful feature is selected; no private content |
| TikTok | Supported public video/photo links | Optional identity if a useful feature is selected; no private/export content |
| Pinterest | Supported public pin/board links | OAuth/private work cancelled; no further setup |
| Discord | Fresh selected attachment URL | No sign-in, bot or server setup |

Instagram/X verified-account private downloading remains unchanged. Current 0.2.10 retains legacy browser transport, with updated public-only guidance; no universal content-visibility classifier is implemented.

## YouTube

Google client import, sign-in and initial identity check are owner-confirmed. Controlled expired-token refresh and revocation acceptance was selected by the owner; live-owner revocation and account expiry are optional further tests. For Watch Later, approve the browser/profile that opens the playlist in Accounts, then add the full playlist URL with list=WL. Google identity does not replace this session. Other private videos are not established by that result. See [setup](account-authentication-setup.md#selected-youtube-use-case-public-videos-in-private-playlists).

## Facebook and TikTok

Continue pasted public links. Basic OAuth sign-in verifies a subject, not the ability to download media. No new registration is required for current public adapters.

If a distinct identity/public-catalog feature is selected, follow the [feasibility requirements](facebook-tiktok-authentication-feasibility.md) before implementation: minimum scopes, supported flow, confidential secret custody, provider review, lifecycle tests and accurate policies. TikTok PKCE differs from Google's. Meta public-user access depends on actual dashboard permission states.

No private/group/followers-only/export scopes or fixtures are requested.

## Pinterest and Discord

Pinterest requires no more authentication setup. Pending app review remains owner-managed; SavedDesk has not cancelled the registration externally. Secret-board and OAuth service work are cancelled.

Discord uses a fresh full cdn.discordapp.com/attachments/... media URL including its signed query. Expired links require a fresh link, not OAuth.

## Implementation and acceptance

Implement an optional identity only after a useful feature is selected. Keep public and offline behavior independent, preserve Instagram/X and YouTube playlist routes, never embed shared secrets, and test state/PKCE, expiry, disconnect/account switching, redaction and unaffected downloads. Rebuild the affected Windows targets and record actual acceptance when runtime code changes.

A profile, OAuth token, thumbnail or metadata response is not a playable media file. Encrypted SQLite, portable recovery and automatic updates remain planned; signing/publication follow the owner's schedule.
