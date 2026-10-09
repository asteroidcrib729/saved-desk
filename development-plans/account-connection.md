# Connect browser accounts and sessions

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** Current procedures cover direct regular Firefox profiles, unpacked Chromium/temporary Firefox connectors, verified Instagram/X connections and separate YouTube browser approvals. Public-only platforms gain no private capability from approval.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

**Current 0.2.10 scope:** Facebook/TikTok/Pinterest are public-link only; Pinterest OAuth is cancelled. Google lifecycle acceptance is controlled per owner choice, with the live grant preserved. YouTube account playlists still use separate browser approval. See [current verification](scope-and-lifecycle-0.2.10.md) and [publication scope](publication-scope-and-cleanup.md).

**Historical 0.2.8 verification:** Debug/release targets and installer are rebuilt. Native account, download, HTTPS, regression and packaging evidence is recorded in [authentication verification](account-authentication-implementation-0.2.8.md). The owner reports successful Google browser sign-in and identity checking. Expiry/refresh/revocation acceptance and new private-media routes remain pending.

**Historical 0.2.8 authentication implementation:** The native Google Desktop identity flow and shared account/capability foundation are implemented. The owner-supplied Google Desktop configuration is installed locally, and the owner reports successful sign-in and identity checking. Remaining lifecycle acceptance is pending. This does not enable private YouTube downloading. Other provider flows and private-media adapters remain pending. Existing Instagram/X private and public/CDN download paths are preserved. See [setup and owner actions](account-authentication-setup.md). Historical 0.2.7 release archives remain unchanged.

**Historical account-authentication proposal (8 October 2026):** [Development Plan 04](development-plan-04.md) supersedes the session-only account model for YouTube, Facebook, TikTok and Pinterest and defines optional Discord identity. The owner reports successful private Instagram/X downloads, including a 504-item Instagram collection. The accepted baseline for the other five remains public/shareable-link downloading. The full replacement remains in progress; the 0.2.8 implementation slice is described above.

**Current architecture - 0.2.10:** gallery-dl and FFmpeg are external user-installed tools, excluded from the new installer. See [licensing and setup](licensing-and-external-tools.md). Older bundled-tool, no-Python and unresolved-source statements below describe their recorded earlier builds; they do not apply to the new payload or clear old installers.

This build includes native account connection and live download adapters. Choose the **profile where you already sign in**: regular Firefox profiles can connect directly; other browsers use the companion connector. No cookie export, password field, or pasted session token is used.

## First connection on this computer

For a regular **Firefox** profile, select Firefox on Accounts, choose the named profile, and click **Connect using this browser** for the desired platform. The native provider reads only that platform's rows from the selected profile's session store, without modifying/copying the database or reading unrelated-site sessions, and verifies Instagram/X account identities. For YouTube, Facebook, TikTok and Pinterest it approves the selected browser session; access is checked when content is requested. Profile discovery never reads/decrypts cookies. The connector instructions below are the supported development route for other browser families and custom Firefox profiles when the direct provider is unavailable.

1. Open SavedDesk → **Accounts**. Choose your browser.
2. Expand **First time? Set up the browser connector** and click **Set up connector and open its folder**. This registers only SavedDesk's native messaging host for that browser under your Windows user's registry; administrator permission is not needed.
3. For Chrome/Edge/Brave/Vivaldi/Chromium, open the browser's Extensions page, enable Developer mode, choose **Load unpacked**, and select the opened `chromium` folder. Pin **SavedDesk Browser Connector** to the toolbar.
4. For Firefox, open `about:debugging` → **This Firefox** → **Load Temporary Add-on**, then select `manifest.json` in the opened `firefox` folder. This development add-on must be loaded again after Firefox restarts. Permanent browser-store delivery is a separate future submission.
5. Select the browser profile where you are logged in. Open the selected platform in that profile and make sure you can view the intended content.
6. In SavedDesk, click **Connect using this browser** for Instagram, X, YouTube, Facebook, TikTok or Pinterest. Open the SavedDesk toolbar button in your browser and click the platform-named **Approve connection** button. Approve the browser's permission prompt.
7. Wait for **Connected as @your_username** in SavedDesk. The app performs an authenticated current-account request before showing this state. Finding cookies alone never marks a verified account connected. For the four additional platforms, the result is **Browser session approved**, not a verified username. The downloader then uses only that platform's scoped session and checks permission for the requested content.

Browser-store approval is outstanding. The source connector packages are usable development packages; this is not yet a one-click browser-store release. Managed policies may disallow extensions or native messaging. Firefox containers/partitioned cookies are rejected with an explanation instead of silently selecting another session. Other Firefox forks and Opera have not been validated.

## Additional platform sessions and limits

After updating the app, **reload SavedDesk Browser Connector on the browser Extensions page**. Its new optional permissions cover only the selected YouTube, Facebook, TikTok or Pinterest origin; it does not request Google-wide access. Select the platform in Add download and paste a full supported link. An approved session is used automatically for new jobs on that platform. Existing anonymous jobs remain anonymous.

These four approvals validate the browser session's required, unexpired cookie scope, not a provider current-account endpoint. They are labelled accordingly. Facebook/TikTok/Pinterest support public links only; their browser approvals are transport, not verified private capability. YouTube account playlists use browser approval; general private-video access is not established. Public extraction can still fail because of provider or parser restrictions. The new session namespace follows its credentials, so rotating them creates a separate download scope. A draft or old job cannot silently use another approved session; add a new download after reapproval when necessary. Instagram/X keep their verified account identity behavior.

Reddit support has been removed. Discord attachment downloads need only the complete media link and no account connection, bot or server setup. Existing browser approvals for other platforms remain unchanged.

## If the approval button stays disabled

A disabled **Approve connection** button means the connector has not received a valid waiting request from SavedDesk. Signing in to Instagram/X alone does not enable it.

Select **Google Chrome** in SavedDesk's Accounts screen. If an earlier request is still waiting, cancel it, then click **Connect using this browser** for one platform. Open the connector in that same signed-in Chrome profile. Use **Check connection again** if the popup was already open; the approval button should then name the selected platform. Connect the other platform after the first finishes.

A Chrome connection defect was corrected on 4 October 2026: setup now writes standard Windows host/manifest paths instead of filesystem paths beginning with `\\?\`. Installed Chrome rejected the earlier executable path before the popup could enable approval. After updating SavedDesk, run **Set up connector and open its folder** once if the extension reports a native-host communication error. In `chrome://extensions`, reload SavedDesk Browser Connector to load the updated retry controls. Approval failures no longer permanently disable the controls.

**Open browser to sign in** only opens the sign-in page; it does not start or renew an app connection. Check the text beneath the extension button for setup, profile mismatch or expired-request instructions.

## If permission is received but the account is not connected

Permission approval and account verification are separate steps. **Permission received** means Chrome delivered the selected session to SavedDesk. It does not mean Instagram/X accepted the app's verification request. Only a successful authenticated current-account response allows **Connected as @username**.

The verifier uses Instagram's authenticated web account settings (`/api/v1/accounts/edit/web_form_data/`) with CSRF and same-origin headers. X now uses its authenticated signed-in account list (`https://x.com/i/api/1.1/account/multi/list.json`) with the pinned engine's browser bearer/CSRF headers. The previous X settings and `verify_credentials` routes both returned HTTP 404 for the owner's session and are no longer retried. Both generations of the account-list response are supported. When several X accounts are signed in, the active `twid` browser hint must match exactly one numeric identity returned by the authenticated route; the first listed account is never selected arbitrarily. Ambiguous lists, mismatches and missing identities fail without connecting. A cookie ID alone never establishes a connection. For a standard Instagram browser session, the worker now makes only the authenticated settings request. After that request returns a valid current username, it derives the numeric account ID from the exact accepted session token and requires a matching scoped `ds_user_id`; any numeric ID in the authenticated response must match too. Only a unique, applicable session with a recognized bounded colon-delimited shape qualifies. Cookie presence, an arbitrary numeric prefix, a public profile, or HTTP 200 without an authenticated username cannot establish a connection. This avoids the separately throttled profile-info request without replacing stable numeric catalog keys with mutable usernames. Unsupported token shapes retain the existing authenticated-username/profile-ID resolution; there is no fallback/retry after an HTTP 429. The same check runs before a queued download and rejects a changed numeric identity before content requests. The owner confirmed successful real X connection in Google Chrome after its route correction. For Instagram, the owner confirmed that authenticated settings succeeds but the secondary numeric-ID lookup still returns HTTP 429 even after provider-claim/CSRF corrections. The owner subsequently confirmed successful Instagram connection and downloading of a real Instagram collection in Chrome after the single-request correction. These private web routes can change; one successful connection does not establish compatibility for every browser/account or verify live downloads.

The connector now follows the final verification result using read-only native account status. It shows either the connected username or the same safe failure shown in Accounts. It never reads/decrypts session files for status reporting. Keep the updated native host beside the app and reload the connector after updating it.

HTTP 401 means the selected session was not accepted. HTTP 403 can indicate a browser sign-in check or the platform rejecting the app's request. HTTP 429 means that this particular request was rejected; it does not establish that the entire account is rate-limited. Instagram can use 429 for a `useragent mismatch`, so SavedDesk now classifies that fixed reason separately as client incompatibility. A validated server `Retry-After` is displayed when available; otherwise the app says that no retry time was provided rather than inventing a cooldown. The message also distinguishes authenticated account verification from the subsequent numeric-ID lookup. Raw bodies, arbitrary server error text, headers, cookies and session values are never displayed. There are no automatic retries or alternate-route requests after a 429. HTTP 404/405/410 indicates an unavailable verification route that may require an app compatibility update. If verification fails, report the safe displayed message and platform, not cookies or exported sessions.

The connector sends its actual browser User-Agent only through private native messaging. The host validates its length and rejects control characters, then keeps it in the app's DPAPI-protected session for Instagram verification and later download requests. It does not go to React or catalog metadata. Instagram no longer uses a fixed Chrome 131 identity; legacy/direct-Firefox connections without this metadata use the pinned engine's default. Download requests remove the engine's fixed-version client hints when using an explicitly approved browser identity. Between successful Instagram requests, the verifier now retains a bounded provider-issued `x-ig-set-www-claim` as `X-IG-WWW-Claim` and refreshes CSRF from the session cookie jar before the next request. Claim tokens remain private and are never fabricated or displayed. These compatibility corrections do not guarantee that Instagram will accept the app's separate HTTP/TLS client.

Implementation references: [Instagram web account detection](https://github.com/juandiegoc30/ig-mutualcheck/blob/main/src/content.js), [X signed-in account identification](https://github.com/public-clis/twitter-cli/blob/main/twitter_cli/client.py), the locally pinned gallery-dl adapters, and [a primary report of Instagram HTTP 429 with useragent mismatch](https://github.com/instaloader/instaloader/issues/2651). SavedDesk continues to require verified identity even if a reference tool permits proceeding without verification.

## Download your content

Choose **Add download**, select the connected platform, and:

- Leave the link empty for all Instagram saved posts or all X bookmarks.
- Paste an Instagram collection link from your browser (`https://www.instagram.com/your_username/saved/collection_name/collection_id/`).
- Paste a single Instagram post/reel or X post link.

Use an optional collection name to make the remembered download easy to recognize. Video quality and profile are copied into the job; later Settings changes do not alter that job.

When a target has history, choose **Download new items**, **Download everything again**, or **Cancel**. New items skips physically available files and repairs missing assets; this decision is made before each media request. Repeat writes into a separate job folder and retains old copies. Carousel assets have separate identities within one logical post. Download result counts refer to files; library counts refer to posts.

The Downloads screen shows persistent results, **Pause**, **Cancel download**, **Resume**, **Retry unfinished items**, and **Open folder**. Pause stops the owned worker and its media tools; resume scans the target again and skips committed files. It does not promise that every interrupted HTTP stream or encoded video can resume from its exact byte position. Interrupted jobs require an explicit Resume after restart.

In Library, choose the arrow beside a post to view images and play videos inside SavedDesk, with available files/copies and Previous/Next controls. **Open with Windows** is available for unsupported codecs. Access is restricted to the current **Settings > Save location** folder. After moving existing downloads there, select **Find moved files** to relink them without redownloading. Missing thumbnails for visible posts are regenerated locally. See [media viewing and moved-file recovery](media-and-storage.md).

New videos keep only a verified playable MP4. Compatible streams avoid re-encoding; necessary conversion follows the saved advanced defaults. Failed finalization retains unfinished source for retry. See [current video behavior](media-and-storage.md#download-time-playback-compatibility).

## Reconnect or disconnect

If the platform expires your session, challenges the account, or limits requests, use the account's browser to complete sign-in/checks, then reconnect. The app does not solve platform challenges, request passwords, or automatically retry authentication indefinitely. It checks the authenticated account identity again before a queued job runs.

**Disconnect** removes the app-owned protected session and preserves downloads and history. It does not sign you out of the browser. Reconnecting another account keeps its history separate; unfinished jobs for the prior identity cannot silently run under the new identity.

## Privacy boundary and evidence

The extension has cookies/native-messaging permissions and optional Instagram/X/Twitter host scopes. It has no content scripts, external web-page message listener, browser-history permission, password access, persistent credential storage, or analytics. Sessions travel through the registered native host and a Windows pipe restricted to the current user/System, with a platform-bound five-minute nonce, bounded frames, and replay rejection. They are encrypted with Windows current-user DPAPI for reconnect-free local use and passed to the worker through private stdin. Credentials never go to React, ordinary worker events, SQL job/account rows, command-line arguments, or cookie TXT files.

Implementation follows [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), [Edge native messaging](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging), and [Firefox native messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging). Browser-store packages must preserve the approved extension IDs and include the matching native-host manifests.

Automated tests use synthetic sessions and loopback platform/media responses. They verify the account/worker/catalog boundary without opening personal browser profiles. Real account compatibility and the full current-browser matrix require account-based smoke testing; synthetic tests are not proof that Instagram/X will accept every session or that every private endpoint remains compatible.

The numeric-owner session format is also used by [Instagrapi session login](https://github.com/subzeroid/instagrapi/blob/master/instagrapi/mixins/auth.py). SavedDesk additionally requires the authenticated self-account response and matching scoped ID; it does not treat extracting a cookie ID as verification.


## Discord media links

Accounts includes a ready **Download Discord media** action. Reddit API-approval guidance and its native setup command have been removed. Discord transfers the selected image/video/audio attachment only. See [the precise instructions](discord-media-downloads.md).

## Repository and release preparation (7 October 2026)

Connector sources/public identity are tracked; generated browser packages and native hosts are rebuilt and excluded from Git. Review connector ZIP/native-host setup as part of installer acceptance. See [source audit and packaged release process](repository-and-releases.md).
