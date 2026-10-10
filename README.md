# SavedDesk

I built SavedDesk to keep supported social-media saves in one local Windows library. You can download posts and collections, search your saved content, view images, play videos and audio, and manage the files on your computer.

**Current application: 0.2.10. User guide reviewed: 10 October 2026.** The GitHub-built Windows installer has passed installation, upgrade and uninstall checks on this system. The maintainer has published it as a publicly accessible unsigned prerelease. [Current GitHub-build verification and preview policy](development-plans/signpath-and-public-preview.md) records its exact hash and limitations; [earlier local-build verification](development-plans/scope-and-lifecycle-0.2.10.md) retains its own evidence.

## Contents

- [Download and install](#download-and-install)
- [First-run setup](#first-run-setup)
- [Supported platforms and download methods](#supported-platforms-and-download-methods)
- [Accounts and authentication](#accounts-and-authentication)
- [Set up the browser connector](#set-up-the-browser-connector)
- [Add a download](#add-a-download)
- [Progress, pause, resume and retry](#progress-pause-resume-and-retry)
- [Browse and search your library](#browse-and-search-your-library)
- [View images, videos and audio](#view-images-videos-and-audio)
- [Delete downloaded content](#delete-downloaded-content)
- [Settings reference](#settings-reference)
- [Keyboard shortcuts and accessibility](#keyboard-shortcuts-and-accessibility)
- [Storage, privacy, backup and removal](#storage-privacy-backup-and-removal)
- [Troubleshooting](#troubleshooting)
- [Development and project layout](#development-and-project-layout)
- [Verification, releases and planned work](#verification-releases-and-planned-work)
- [Code signing policy](#code-signing-policy)
- [License, policies and support](#license-policies-and-support)

## Download and install

### Get the application

Open the [SavedDesk Releases page](https://github.com/asteroidcrib729/saved-desk/releases) and download the Windows x64 installer named **SavedDesk_<version>_x64-setup.exe**. Use the installer asset, rather than GitHub's automatically generated source ZIP. A source ZIP contains development files and cannot be installed as the desktop app.

The [source repository](https://github.com/asteroidcrib729/saved-desk) is public. No packaged release has been published yet. In this checkout, the tested installer is:

~~~text
release-artifacts/github-v0.2.10-37960062238/SavedDesk_0.2.10_x64-setup.exe
~~~

The GitHub-built 0.2.10 asset set is currently a draft. Its exact installer passed host installation, upgrade and uninstall checks after download and checksum verification. A documented unsigned-preview exception permits maintainer-approved publication as a prerelease; it does not claim signing or complete production acceptance. See the [Code signing policy](CODE_SIGNING_POLICY.md) and [preview evidence and publication instructions](development-plans/signpath-and-public-preview.md). Previews through 0.2.3 must not be distributed.

If a release supplies checksums, compare the downloaded installer with its entry in SHA256SUMS.txt:

~~~powershell
Get-FileHash -LiteralPath ".\SavedDesk_0.2.10_x64-setup.exe" -Algorithm SHA256
~~~

The GitHub-built 0.2.10 installer SHA-256 is:

~~~text
19e8b9d810888d686843f80dd72c7e0467bc6912ca38e603e1f6951f701f4dc6
~~~

### MSIX packages

I also provide a separate Windows x64 MSIX build. The local testing package uses a separate test identity. The Store build uses the public identity confirmed in Partner Center: FarazHussain.SavedDesk, publisher CN=F14492EE-882F-4921-8253-B73CEB32823A. Its unsigned package is intended for review; Windows requires appropriate package trust before normal sideload installation. A locally signed preview and public test certificate, when supplied, are for deliberate local testing only. Do not treat that certificate as a trusted public publisher certificate.

MSIX includes the complete Microsoft Fixed Version WebView2 runtime, so it does not run the EXE installer's runtime prerequisite. It includes the same reviewed worker, connector and dependency notices; gallery-dl and FFmpeg remain separately configured download tools. It requires Windows 10 build 19041 or later, x64. Fixed Version WebView2 updates ship through new app packages.

For local builds from source:

```powershell
./packaging/build-msix.ps1
```

If the worker has already been built and audited against the current source, add -ReuseWorker. Outputs are under the permanently ignored release-artifacts/msix directory and include the manifest, hashes and review record. Existing output directories are not overwritten.

For the confirmed Microsoft Store identity, build using its tracked public values:

```powershell
./packaging/build-msix.ps1 -Store
```

For GitHub-hosted builds, I provide [Windows MSIX package](.github/workflows/build-msix.yml). After the workflow and its MSIX packaging prerequisites are committed and pushed to `main`:

1. Open **Actions -> Windows MSIX package -> Run workflow**.
2. Select a branch containing the MSIX implementation, normally `main`. The workflow builds the exact commit selected for that run. The earlier `v0.2.10` tag does not contain the later MSIX implementation; use a new version tag for a future tagged build.
3. Leave **package_identity** set to **store** for Partner Center. Select **preview** only for the separate unsigned local test identity.
4. Run the workflow, then download its **windows-msix-<version>-<identity>-<run>-<attempt>** artifact from the completed run. Artifacts expire after 30 days.
5. Extract it, verify the `.msix` against `SHA256SUMS.txt`, and upload only the Store-identity `.msix` through the MSIX/AppX submission. Keep the companion notices and source archives with any distributed review assets.

The workflow installs locked dependencies, runs Python, packaging, connector, frontend, UI and native checks, builds the worker once, verifies the pinned Microsoft Fixed Version WebView2 runtime, builds an unsigned x64 MSIX, and validates the archived payload. It includes the connector ZIP, original source, dependency sources, notices, manifest, checksums and CI provenance. It requires no signing certificate or repository secrets and does not publish a GitHub release or install the package on the runner. Microsoft Store signing, capability approval and certification remain separate steps. The EXE workflow remains separate.

Upload an identity-correct package through an MSIX/AppX submission, not the EXE/MSI Package URL form. Microsoft supplies signing for Store MSIX distribution. The local-preview package must not be submitted under a guessed identity. See the [MSIX plan, testing limits and precise Store steps](development-plans/development-plan-05.md).

MSIX connector setup installs a hash-verified native-host copy under the existing profile\connector-bin folder, because an unpackaged browser cannot execute it directly from WindowsApps. The packaged worker and app remain inside MSIX.

Close the other edition before using MSIX: both editions share the existing catalog and settings. After an MSIX update, repeat **Accounts -> Set up browser connector**, since Windows changes the package installation path. Before removal, unregister this installation's connector using packaging/unregister-connector.ps1 with the exact native-host parent directory recorded in your connector manifest; then uninstall through Windows Settings -> Apps. Package removal retains local SavedDesk data and downloaded media. The EXE's /S parameter and process exit codes do not apply to MSIX.

### Requirements

| Requirement | What it is for |
| --- | --- |
| Windows x64 | The current packaged target; verified on the existing Windows 10 host |
| Microsoft Edge WebView2 | Renders the desktop interface; setup includes Microsoft's offline prerequisite installer |
| Writable save folder and enough free space | Stores downloaded media; preparation/conversion can temporarily need additional space |
| Internet access | Platform requests and account connection; existing local media can be browsed offline |
| Separate gallery Python environment | Instagram, X, Pinterest and TikTok photo downloads; Instagram/X account verification |
| Separate FFmpeg installation | Video preparation, compatibility conversion and video previews |
| A supported signed-in browser profile | Required for Instagram/X and YouTube account playlists; optional public-link approvals elsewhere |

Linux, macOS and native ARM64 installers are not supplied by this project. The packaged app does not need Node, Rust, npm or the development checkout on the user's PC. Its built-in worker is packaged, but gallery features still require the separate Python environment below. FFmpeg and gallery-dl are not bundled.

### Install, upgrade or uninstall

1. Close SavedDesk before installing or upgrading.
2. Run the installer obtained from the intended release. Follow its prompts; installation is for the current Windows user.
3. Let setup install WebView2 if the prerequisite is missing. Existing compatible WebView2 installations are retained.
4. Open SavedDesk from the installed shortcut. The window starts maximized.
5. Complete [first-run setup](#first-run-setup) before connecting Instagram/X or downloading videos.

The current preview installer has no trusted publisher signature; Windows may display an unknown-publisher or reputation prompt. Check the intended source and checksum before deciding whether to run it. SignPath Foundation declined the application; trusted EXE signing remains outstanding; see the [Code signing policy](CODE_SIGNING_POLICY.md).

For an upgrade, run the newer installer with the same Windows account and retain the current installation location. Your catalog, settings, volume preference, history and downloaded media are kept. A future updated connector may need to be reloaded in the browser.

To uninstall, use **Windows Settings > Apps**, locate SavedDesk and choose **Uninstall**. Uninstall removes program files and its matching native-host registrations, while retaining downloaded content and application data. Remove the browser extension separately if you no longer use it. See [complete data removal](#storage-privacy-backup-and-removal).

## First-run setup

### 1. Choose a save folder

Open **Settings > Save location > Choose folder**. Choose a writable directory with room for your collection. A new profile defaults to SavedDesk inside the Windows Downloads directory.

SavedDesk opens and saves downloaded media only within the currently selected folder. Selecting a new folder does not move existing downloads. To relocate them, move the existing folders yourself, preserving their subfolders, then choose **Find moved files**. The full recovery procedure is under [Save location](#save-location).

### 2. Install the separate gallery environment

Use the [official Python Windows downloads](https://www.python.org/downloads/windows/) to install Python 3.14. Open a new PowerShell window and ensure python resolves to that installation. The following creates a user-owned environment outside SavedDesk's installation folder and installs the versions currently supported by the app:

~~~powershell
python --version
python -m venv "$env:LOCALAPPDATA\SavedDeskTools"
& "$env:LOCALAPPDATA\SavedDeskTools\Scripts\python.exe" -m pip install gallery-dl==1.32.14 requests==2.34.2 yt-dlp==2026.8.19 yt-dlp-ejs==0.8.0
~~~

If python opens the Microsoft Store or is unavailable, use the full path of your installed Python interpreter in place of python for the first two commands. Do not use an arbitrary interpreter without the required packages.

In **Settings > Download tools > Gallery Python environment > Choose file**, select:

~~~text
%LOCALAPPDATA%\SavedDeskTools\Scripts\python.exe
~~~

The same versions are recorded in [external-tool requirements](packaging/requirements-external.txt). This environment is required for Instagram, X, Pinterest and TikTok photo posts. It also handles Instagram/X account verification. YouTube/Facebook/TikTok video and Discord adapters use the packaged worker's existing routes.

### 3. Select FFmpeg

1. Open the [official FFmpeg download page](https://ffmpeg.org/download.html) and use one of its Windows build suppliers.
2. Extract the downloaded package into a permanent folder outside SavedDesk's installation.
3. Keep ffmpeg.exe and, when supplied, ffprobe.exe together in the package's bin folder.
4. In **Settings > Download tools > FFmpeg executable > Choose file**, select ffmpeg.exe.

SavedDesk runs the selected external tools; it does not copy them into its installer or update them for you. If you move/remove a tool, select its new location. Obtain executable tools from sources you trust.

### 4. Check local setup

Open **Settings > Check your setup**, choose the browser you intend to use and click **Check setup**. Review the save-folder, free-space, engine, video-tool and connector results. Readiness states are **Ready**, **Attention**, **Needs action** and **Not checked**.

This local check does not sign in or prove that a platform will accept a particular download. Account permission and network access are checked when connecting or downloading. Keep at least 256 MiB free; real downloads and conversion often require much more.

You can use **Try sample collection** on an empty Library, or **Settings > Local connection test > Run local test job**, to run three local transfers without contacting a platform. These create test records/files in a separate test folder. They do not authenticate your accounts.

## Supported platforms and download methods

| Platform | Supported input | Account requirement and limits |
| --- | --- | --- |
| YouTube | Full video/Shorts links, finite playlist links, Watch Later and Liked videos | Public links can work without connection. Account playlists use a separately approved YouTube browser session. Google identity alone does not authorize downloads. General private-video access is not established. |
| Facebook | Public video, Reel and watch links | No new OAuth registration required. Existing browser approval is optional transport for supported public links. Private/group content, group browsing and photo-post imports are outside scope. Some public pages can fail due to extractor compatibility. |
| Instagram | Post/Reel link, your saved-collection link, or an empty link for all saved posts | A verified connection is required by the current app. Private content must be accessible to the connected account; saved collections belong to that account. |
| Discord | One fresh full cdn.discordapp.com attachment link | No SavedDesk Discord sign-in, bot, server permissions or OAuth app. Only the linked image/video/audio attachment is downloaded. |
| TikTok | Full public video or photo-post link | Private/followers-only content is outside scope. Existing public-link browser approval is optional. Photos require the gallery environment. |
| Pinterest | Full public pin, board or board-section link | Secret boards/private content are outside scope. No developer app, pending review or OAuth setup is needed. The gallery environment is required. |
| X (F.K.A. Twitter) | Post link or an empty link for all bookmarks | A verified connection is required. Protected posts must be accessible to the connected account. The browser history page is not the bookmark-download input. |

Spotify and Reddit downloading have been removed. There is no arbitrary-site downloader, Discord server/channel scraper, DRM removal, or supported ongoing YouTube live/Mix download route.

### Link examples and important distinctions

These are URL patterns: replace placeholder IDs/usernames with a real supported address.

| What to download | Input in Add download |
| --- | --- |
| All Instagram saved posts | Select Instagram and leave Post or collection link empty |
| One Instagram collection | https://www.instagram.com/USERNAME/saved/COLLECTION/NUMERIC_ID/ |
| One Instagram post or Reel | Its full instagram.com/p/... or instagram.com/reel/... address |
| All X bookmarks | Select X and leave Post or collection link empty |
| One X post | https://x.com/USERNAME/status/NUMERIC_ID |
| One YouTube video | https://www.youtube.com/watch?v=VIDEO_ID or its Shorts address |
| A finite YouTube playlist | https://www.youtube.com/playlist?list=PLAYLIST_ID |
| YouTube Watch Later | https://www.youtube.com/playlist?list=WL |
| YouTube Liked videos | https://www.youtube.com/playlist?list=LL |
| A Facebook Reel | https://www.facebook.com/reel/NUMERIC_ID |
| A TikTok video or photo post | https://www.tiktok.com/@USERNAME/video/NUMERIC_ID or /photo/NUMERIC_ID |
| A Pinterest pin | https://www.pinterest.com/pin/NUMERIC_ID/ |
| A public Pinterest board/section | https://www.pinterest.com/USERNAME/BOARD/ or /USERNAME/BOARD/SECTION/ |
| One Discord attachment | The full https://cdn.discordapp.com/attachments/CHANNEL_ID/ATTACHMENT_ID/FILENAME URL, including its signed query |

A YouTube watch link downloads one video even if it also contains a list parameter. To download the playlist, paste its explicit /playlist?list=... address. Watch Later and Liked videos require browser approval in Accounts.

For X, use the empty-link bookmark option instead of https://x.com/i/history. Instagram/X profile-wide scraping and arbitrary history-page imports are not offered by these controls.

For short share URLs such as pin.it and TikTok short links, open the link in your browser and copy the expanded full supported address. For Discord, copy the attachment's media URL, not a discord.com/channels/... message/channel URL or a resized media proxy URL. Keep the query string; expired attachment URLs need a fresh link.

## Accounts and authentication

SavedDesk distinguishes **verified account identity**, **browser-session approval**, and **permission to retrieve content**. These are separate states. No password, cookie TXT export, pasted account token or browser-history import is requested by the app.

### Instagram and X

1. Sign in to the platform in the browser profile you intend to use. Verify that this profile can open the desired content.
2. Install/select the gallery Python environment in Settings.
3. Open **Accounts > Browser connections and legacy approvals** and choose your browser.
4. For regular Firefox, choose the correct **Firefox profile** and follow the direct route below. For other supported browsers, [set up the connector](#set-up-the-browser-connector).
5. On the Instagram or X card, click **Connect using this browser**.
6. If using the connector, open its toolbar popup in that same profile and click the platform-specific **Approve connection** button. Approve the requested site permission.
7. Wait for **Connected as @username** in SavedDesk. Permission received or finding cookies alone does not establish a verified connection.
8. Connect the other platform separately if needed, then [add a download](#add-a-download).

Use **Open browser to sign in** to open the platform's sign-in page. This opens a page; it does not start or renew a SavedDesk connection. **Cancel connection** stops a waiting request.

Use **Reconnect from browser** after a session expires or when choosing another account. **Disconnect** removes SavedDesk's stored session, preserving media and history. It does not sign you out of the browser or delete the platform account. Account history stays scoped; an old job cannot silently use a different account or renewed session. If the app requests a new job after reconnecting, add the download again.

The owner has confirmed private Instagram/X downloads, including a 504-item Instagram collection. This is not a guarantee that every private resource or future platform change will work.

### YouTube: browser approval for downloads

Public video links do not require Google identity sign-in. For Watch Later, Liked videos or account playlists containing public videos:

1. Open the playlist in the browser profile that can access it.
2. In **Accounts > Browser connections and legacy approvals**, select that browser/profile.
3. On **YouTube**, click **Connect using this browser** or **Reconnect from browser**.
4. Approve the connector request, or use regular Firefox's direct route.
5. Wait for the browser-approval state. It may be labelled **Legacy browser approval**, not Connected as @username.
6. Add the full playlist URL in Add download.

The two-video Watch Later workflow is owner-confirmed. An approved playlist session does not establish general private-video download support. Unavailable entries, provider challenges, expired sessions and extraction changes may still cause failures.

### Optional Google identity sign-in

The **Google identity for YouTube** card verifies your Google identity. It is separate from the YouTube browser approval above and does not replace it. The current app requests identity scopes, not a YouTube private-media/download scope.

If the card says **Developer setup required**, a Google **Desktop app** OAuth client is needed. Public YouTube downloading and the browser-approved playlist route do not require configuring Google identity.

For your own identity setup:

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create/select the intended project.
2. Configure Google Auth Platform branding, support contact, audience and consent information. If the app is in testing, include the Google account you will use in its allowed test users where required.
3. Create an OAuth client of type **Desktop app**, then download its JSON. A Web/server client JSON is rejected by SavedDesk.
4. In **Accounts > Verified identity and download access > Google identity for YouTube**, expand **Configure Google Desktop sign-in**.
5. Choose **Import Desktop OAuth JSON** and select that local file. Alternatively, enter its public client ID and choose **Save client ID**. Import the JSON when the client configuration includes the installed-app credential needed by its exchange.
6. Click **Sign in with Google**, choose the intended account in the system browser and review consent.
7. Wait for a verified identity in SavedDesk. **Cancel Google sign-in** cancels a waiting attempt.

Google documents the installed-app flow in [OAuth for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app). Registration files remain local and must not be committed or attached to support requests.

| Google action | Effect |
| --- | --- |
| Check or refresh identity | Checks the account and refreshes expired credentials when possible; grants no private-media capability |
| Sign in with another Google account | Starts another explicit identity authorization; does not adopt an existing browser-download history |
| Disconnect Google identity | Removes the local grant while retaining client setup, media and independent browser approvals |
| Revoke Google access | Confirms then requests remote revocation and removes local credentials; may affect other grants for the same Google Cloud project |
| Reset Google identity setup | Confirms then removes local identity/client configuration; remote grants and browser approvals remain |

If revocation cannot be confirmed remotely, review the app through [Google Account connections](https://myaccount.google.com/connections). A message saying identity grants no private-media capability is expected in this build.

### Facebook, TikTok and Pinterest

Supported public links can be downloaded without connecting an account. No Meta app, TikTok Login Kit or Pinterest developer app is required for these download routes.

Existing **Connect using this browser / Reconnect from browser** controls remain available as optional browser transport for supported public extraction. To use them, select the correct browser/profile and approve that platform separately through the same connector/direct Firefox steps. Their result is a browser approval, not verified private-media capability.

Private Facebook/group media, TikTok private/followers-only media and Pinterest secret boards are outside the supported scope. Pinterest OAuth work is cancelled. Optional Facebook/TikTok identity integrations are future work, not current requirements.

### Discord

No authentication setup is needed in SavedDesk. In Discord, open the desired image/video/audio attachment and use its **Copy Link** or open the attachment in a browser to copy the full cdn.discordapp.com URL. Then choose **Accounts > Discord > Download Discord media**, or select Discord in Add download.

A media link may include expiry/signature parameters. Paste the entire link. If it expires, copy a fresh attachment URL and add it again. SavedDesk requests only that file; no channel history, server membership data, user token or bot is needed.

## Set up the browser connector

### Supported browsers and direct Firefox

The browser selector offers **Microsoft Edge, Google Chrome, Firefox, Brave, Vivaldi and Chromium**.

Regular Firefox profiles can connect directly: choose Firefox, select the signed-in profile and click **Connect using this browser**. No add-on is needed when the profile is accessible. **Use Firefox connector instead** selects the connector route. For custom/portable profiles, use the connector when the direct provider is unavailable. Firefox containers and partitioned sessions are not silently substituted; they need a separately supported provider.

Chrome, Edge, Brave, Vivaldi and Chromium use the companion **SavedDesk Browser Connector**. Browser-store distribution is not available yet; the current route is unpacked Chromium or temporary Firefox installation.

### Chromium-family setup

1. Install/open the native SavedDesk app.
2. Open **Accounts**, choose the browser, then expand **First time? Set up the browser connector**.
3. Click **Set up connector and open its folder**. This registers the native messaging host for the selected browser under your current Windows user and opens the packaged extension folder.
4. In the same browser/profile, open its Extensions page: edge://extensions for Edge, chrome://extensions for Chrome, or the equivalent page for Brave/Vivaldi/Chromium.
5. Enable **Developer mode**, choose **Load unpacked**, and select the opened **chromium** folder.
6. Pin **SavedDesk Browser Connector** to the toolbar.
7. Return to SavedDesk, click **Connect using this browser** on one platform card, then open the connector toolbar popup.
8. Click **Approve connection** for the named platform and accept its optional site-permission prompt.
9. Wait for SavedDesk's result before starting another connection.

Chrome's unpacked-extension process is described in its [official extension tutorial](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world). Merely unzipping a connector release asset does not register the native host; use the app's setup button.

### Firefox temporary connector

1. Choose Firefox in Accounts, expand the setup instructions and click **Set up connector and open its folder**.
2. Open about:debugging, choose **This Firefox**, then **Load Temporary Add-on**.
3. Select manifest.json in the opened **firefox** folder.
4. Open the SavedDesk toolbar popup after starting a connection in the app and approve the named platform.

Temporary add-ons must be loaded again after Firefox restarts. Mozilla documents this in [Your first extension](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Your_first_WebExtension). Direct regular-profile connection avoids this temporary add-on requirement.

### Reconnecting and troubleshooting the connector

Each platform needs its own approval. Use the exact browser profile where the content is accessible. The extension requests only the selected platform's session; it does not request passwords or general browser history.

A disabled **Approve connection** button usually means no valid request is waiting. Cancel an old request in SavedDesk, start a new **Connect using this browser** request, and reopen the popup. **Check connection again** retries the pending desktop request.

After an app update, reload the connector on the browser's Extensions page. If native-host communication fails, run **Set up connector and open its folder** again and make sure the connector is installed in that browser/profile. Managed-browser policy can block extensions or native messaging.

Moving/removing an unpacked extension's source folder breaks its installation; keep the folder in place or reload it from the current packaged location. Closing a Google identity authorization does not approve a YouTube browser session.

## Add a download

1. Complete tool setup and any account connection required for the chosen platform.
2. Click **Add download** or press **Ctrl + N**.
3. Select **Platform**.
4. Paste a full supported **Post or collection link**; for Discord use **Media attachment link**. Leave the field empty only for all Instagram saved posts or all X bookmarks.
5. Optionally enter **Collection name** or **Download name**. This is a recognizable local title; it does not rename the online collection.
6. Choose **Video quality** and **Output profile**, or keep the Settings defaults.
7. Click **Start download**. The app validates the target and current setup, then queues the job.
8. Open **Downloads** to follow the result.

If you previously saved that target with the same account/download scope, SavedDesk offers:

| Choice | Result |
| --- | --- |
| Download new items | Skips available files, saves newly added items and restores missing files |
| Download everything again | Creates another copy in a separate job folder, preserving existing files |
| Cancel | Leaves the existing library unchanged |

Repeat copies can increase disk usage. A post can have several files and several saved copies, so file counts are not always equal to post counts.

The dialog captures video defaults when opened; the job retains its chosen options through retry. **Advanced video settings** are configured in Settings, not within Add download.

## Progress, pause, resume and retry

Downloads shows queued/running work first and recent history afterward, up to 100 jobs. Downloads always run one at a time, including when Low-resource mode is off.

- **Waiting in queue:** another job is running, or the job has not started.
- **Current file progress:** transferred bytes, a progress bar and a percentage when the total file size is known.
- **Unknown total:** an indeterminate bar; the app does not invent a collection-wide percentage.
- **Processing:** checking/preparing the downloaded file, including conversion when necessary.
- **Saved / already available / failed:** file outcomes recorded for the job, alongside its state and date.

The live bar measures the current transfer, not the percentage of a whole unknown-size collection. Preparation/conversion may continue after network transfer reaches its end. A video becomes saved after playable-MP4 finalization, not merely when its incompatible source finishes transferring.

Use **Pause** to stop an active or queued job while keeping its recoverable history. Use **Resume** on paused/interrupted work. **Retry unfinished items** retries a failed job's unfinished items. Resume waits for the prior worker to finish stopping. Actual byte-level continuation depends on the source; some unfinished files may restart.

**Cancel download** stops the job; it does not delete already saved files. To remove saved content/history, use the reviewed deletion controls after the job stops. If a job was created under an old/expired browser approval, reconnect and add a new download when requested rather than changing its account silently.

**Open folder** opens the job's eligible folder in Windows. Error text explains failed setup, access, space or platform requests. Provider rate limits can require waiting before retrying.

## Browse and search your library

**Library** displays saved posts from all platforms. The sidebar provides platform sections in this order: **YouTube, Facebook, Instagram, Discord, TikTok, Pinterest, X (F.K.A. Twitter)**, followed by Downloads; Accounts and Settings are available below.

Click the **SavedDesk bookmark icon** to permanently expand or collapse the sidebar. Its state is remembered. Hovering does not open or close it. A collapsed icon's tooltip/name identifies its destination. There is no Collections area or Low-resource indicator in the sidebar; collection jobs are managed in Downloads.

The search field searches stored creator names, captions and collection names, not the online platforms or file contents. **Ctrl + F** focuses it. Use **Clear search** or **Clear search and filters** to reset the query.

Use the **Platform** dropdown in Library or a sidebar platform section, and the **All content / Images / Videos / Audio / Text** filters. A carousel can contain different media kinds even though its post appears under one classification.

Up to 100 matching posts appear per page. **Next page** shows older matches and **Back to newest** returns to the newest page. The virtual list renders visible rows to keep large libraries responsive.

Use **View saved files** to open a post. Its viewer includes files/copies, available metadata, original-post link and eligible actions. **Files missing in save folder** means the recorded file is unavailable within the currently selected folder; it does not prove the original platform post was deleted.

## View images, videos and audio

### Images and multi-file posts

Open a post, then select one of its available files/copies. Use **Previous file / Next file** to move within that post. Use image **Zoom in**, **Zoom out** and **Fit image**; zoom ranges from fitted 100% to 400%. Zoomed images can be scrolled.

**Fullscreen** or **F** fills the viewer's media stage. Previous/next buttons are at the left/right screen edges. Images use a top-right **Close fullscreen** button. There is no filename/counter label over the fullscreen media. Escape exits fullscreen; another Escape closes the viewer.

### Videos

Left-click the video or unused player background to play/pause. Right-click is not the playback toggle. You can also use the player button, **K**, or **Space when the video has focus**.

The video controls provide play/pause, back/forward 10 seconds, mute, volume, repeat, playback speed, current time, seek position, duration and fullscreen. Playback speed offers 0.5x, 1x, 1.25x, 1.5x and 2x.

**Repeat video** loops the current video until turned off; it does not automatically advance through all files in a post. The repeat preference is remembered. **Video volume and mute** persist across files and restarts. Playback speed is a control for the current player.

In fullscreen, the video uses the available stage with its aspect ratio preserved. Controls overlay the bottom with transparency and hide after three seconds of playback/pause inactivity; mouse movement reveals them. Controls remain available during keyboard interaction, slider dragging or an open menu. Videos exit fullscreen through the player's fullscreen button or Escape.

New downloads prefer compatible H.264/AAC streams. Compatible media avoids re-encoding; suitable video in another container can be remuxed. Necessary conversion produces a playable MP4 and replaces the incompatible source, so successful new video downloads keep only the playable copy. Already downloaded older incompatible files can still need preparation when opened.

### Audio, text and file actions

Audio attachments open with the built-in audio controls. **K/M** can play/pause or mute focused viewer media. Standalone audio is not converted by the advanced video audio-bitrate setting. Text items display their saved text.

**Open with Windows / Open file** uses Windows' associated application. **Open folder** opens an eligible saved copy's job folder. **Open original post** opens the validated platform link when available. These actions cannot open recorded downloads outside the selected save-folder boundary.

The file list shows names, sizes, video quality/profile and availability. Up to 100 recent files/copies are shown. Missing files can be recovered with Find moved files or by re-downloading. A file with an unsupported codec may work in another Windows player even if WebView2 cannot decode it.

## Delete downloaded content

Deletion removes eligible local files and the corresponding library/history records. It does not delete a post or account on the original platform. Every deletion has a review/confirmation; **Delete permanently** has no app undo.

| Action | Scope |
| --- | --- |
| Post trash button / Delete post in viewer | One post and its saved copies |
| Delete file in the viewer's file list | One saved file/copy |
| Delete selected in Library | Selected posts on the current page |
| Downloads > Delete download | That job's files and history |
| Downloads > Delete collection | All downloads of that target/account, including repeat copies; posts with copies from another retained download can remain |

For batch deletion, tick post checkboxes. **Shift-click** selects a range, **Select this page** selects all currently loaded posts and **Clear selection** clears it. Selection is limited to the page and clears when the page or filters change. Ctrl + A selects that page only while the saved-post list has focus.

Review the file counts, sizes and exclusions before confirming. Pause/finish active downloads first. Unrelated files and files outside the selected save folder are preserved; the review may list unavailable/outside-folder files that cannot be removed. Use Windows deliberately if you also want to delete those external copies.

## Settings reference

Settings save changes automatically. Configuration controls use switches; content selection uses checkboxes. Info icons open explanatory pop-ups without moving the form.

### Check your setup

Select **Browser to check** and click **Check setup** for the local diagnostics described in first-run setup. Folder/browser changes invalidate the displayed result. The first worker check can take longer than subsequent checks. Results describe that check only.

### Save location

- **Choose folder:** changes where subsequent real downloads are saved and which root is allowed for local media access. It does not move or delete old files.
- **Find moved files:** scans only the selected root, relinks unambiguous matching recorded downloads in place and restores visible thumbnails as you browse.
- **Available:** a recorded file is present in the selected root.
- **Missing:** no usable match was found.
- **Ambiguous:** multiple matches cannot be resolved safely; they are left unchanged.
- Folder changes/repair may be unavailable while a download or account connection is active.

To relocate an existing library:

1. Pause/finish downloads and close any file you are moving.
2. Move the original downloaded folders into the intended new root using Windows, preserving their subfolders and filenames.
3. Select that new root with Choose folder.
4. Click Find moved files and review the counts.
5. Reopen Library; thumbnails regenerate for visible posts.

If matches remain missing, check the new folder/subfolders or re-download the target using Download new items. Keep the catalog: Find moved files repairs recorded downloads, not arbitrary-folder imports or a lost catalog.

### Download tools

**Gallery Python environment** selects python.exe from the supported separate environment. **FFmpeg executable** selects ffmpeg.exe. **Choose file** saves a selection; **Clear** removes that selection, not the program itself. **Setup instructions** explains installation.

Selections persist locally. Changes can be refused while downloads/the worker are busy. Tools are neither bundled, copied nor silently substituted with the worker's embedded interpreter.

### Video defaults

| Setting | Choices and effect |
| --- | --- |
| Video quality | Best available, or caps at 2160p, 1440p, 1080p, 720p, 480p or 360p; prefers source streams within that resolution |
| MP4 without resize fallback | Stops when no suitable source meets the selected cap; still converts incompatible codecs when necessary |
| MP4 with resize fallback | Can download a larger source and resize to the cap when a capped stream is unavailable; this needs encoding |
| Restore default video settings | Restores Best available, MP4 without resize fallback and all advanced defaults |

Both profiles keep a playable MP4 rather than retaining an incompatible original. Smaller source resolutions usually reduce download/storage size; a resolution cap is not a guaranteed bitrate/file size. Compatibility preference may choose a different source stream than an unconstrained downloader.

### Advanced video settings

Expand **Advanced video settings** on Settings. These affect conversion only. Already playable video and compatible AAC audio remain unchanged.

| Setting | Options | Effect |
| --- | --- | --- |
| Encoding method | Automatic (hardware preferred), Software (CPU) | Automatic uses a tested hardware encoder when available, with software fallback; Software uses CPU encoding only |
| Software encoding speed | Very fast, Balanced, Smaller files (slower) | Faster generally uses more storage; slower spends more CPU time compressing; software uses two encoder threads |
| Software video quality | High quality (CRF 18), Balanced (CRF 23), Compact (CRF 28) | Lower CRF usually retains more detail and creates larger files; applies to software conversion, not the hardware quality policy |
| Converted audio bitrate | 96, 128, 192, 256 kbps | AAC bitrate when video audio needs conversion; compatible AAC is copied and standalone audio is unaffected |

Defaults are **Automatic, Very fast, CRF 23 and 128 kbps**. Click the info icon beside a setting for its explanation, then close the pop-up or press Escape. Settings defaults are captured for new jobs; changing them does not retroactively alter downloaded videos or existing job options. Conversion cannot recover detail absent from the source.

### Accessibility and appearance

**Interface size** offers 100%, 125%, 150%, 175% and 200% and enlarges text/controls together. The native app remembers the preference. Ctrl + Plus/Minus changes it and Ctrl + 0 restores 100%, outside fullscreen.

Windows high-contrast and reduced-motion preferences are respected. App-owned scrollbars support pointer dragging and keyboard scrolling. Controls provide accessible names; dialogs support keyboard dismissal and focus handling.

### Keep your computer responsive: Low-resource mode

Turn **Low-resource mode** on/off using the switch under **Keep your computer responsive**. The setting persists.

On reduces animation/decorative effects. Off allows the ordinary interface effects. It does not enable parallel downloads, bypass compatibility checks, change video quality or remove the external-tool requirements. Downloads always run one at a time. It is available in Settings only; the sidebar has no Low-resource indicator.

### Privacy and local data

This card explains current-user account-session protection and the unencrypted catalog/media boundary. **Manage connected accounts** opens Accounts.

Library captions, account names, history and stored paths currently reside in ordinary SQLite. Downloaded media and thumbnails are not encrypted. Catalog encryption and portable encrypted recovery remain planned.

### Local connection test

**Run local test job** creates three local transfers in a separate test folder to check worker communication, catalog/history and repeat-download confirmation. It never contacts Instagram, X or another platform. Test records are identifiable as test content. Use the same reviewed deletion controls if you want to remove them.

## Keyboard shortcuts and accessibility

Open **Help & shortcuts** from the top bar for the in-app reference.

| Shortcut | Context and action |
| --- | --- |
| Ctrl + F | Focus Library search |
| Ctrl + N | Open Add download |
| Ctrl + Plus / Minus / 0 | Enlarge/reduce interface / reset to 100%, outside fullscreen |
| Up / Down, Home / End, Page Up / Page Down | Navigate the focused saved-post list |
| Enter | Open the focused post |
| Ctrl + A | Select the current Library page when the saved-post list has focus |
| Delete / Escape | Review selected posts / clear selection in that list |
| Alt + Left / Right | Previous/next available file within the open post |
| Left / Right | Also navigate images when not panning a zoomed image |
| F / Escape | Enter/exit fullscreen; Escape closes the viewer outside fullscreen |
| + / - / 0 | Image zoom in / out / fit |
| K / M | Play/pause or mute video/audio in the viewer |
| Space | Play/pause when the video has focus |
| Video Left / Right arrows | Seek five seconds when the video has focus |
| Video Up / Down arrows | Adjust volume when the video has focus |
| Tab / Shift + Tab | Move between controls; focused sliders also accept arrow keys |

Typing in a text field does not run unrelated viewer shortcuts. Selection checkboxes are distinct from configuration switches. Keyboard focus is indicated through control styling without the old activity-border overlays.

## Storage, privacy, backup and removal

Real downloaded media lives in your selected save root. The native app stores its catalog, protected session files and local tool configuration in:

~~~text
%LOCALAPPDATA%\com.saveddesk.desktop
~~~

The catalog filename is prototype-catalog.db even though it stores the real application library. The name is historical. Browser/identity credentials are protected with Windows current-user DPAPI; they are not placed in the README, Git, ordinary SQL account/job rows or cookie TXT exports.

Changing or renaming the development checkout does not move this installed data. Disconnecting an account leaves media/history intact. Uninstalling is also not a library wipe.

For a manual backup, finish/pause jobs, close SavedDesk, and copy the selected download folder plus the application-data directory to storage you control. Closing the app first avoids copying an actively changing SQLite database; retain any database sidecars present. Keep backups private. This is a manual backup, not portable encrypted recovery: protected credentials may require reconnection under a different Windows user/machine, and file paths may need repair.

For complete removal, disconnect browser approvals and, if desired, explicitly revoke Google access before uninstalling. Close the app, uninstall, remove its browser extension, then deliberately delete the app-data directory, chosen downloads and any backups you no longer want. Other external tools remain separate installations. Removing local files does not remove the original platform content.

The app has no implemented cloud library sync, catalog encryption, portable recovery or automatic updater. Platform traffic follows your connection/download requests; the connector sends only the approved platform session to the local app. Do not send credentials, private media or complete personal catalogs in public bug reports. See the [Privacy Policy](PRIVACY_POLICY.md) for the complete current data handling.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| Missing runtime / app does not launch | Rerun the intended current installer so it can detect/install WebView2; inspect setup errors rather than copying only saveddesk.exe |
| Gallery Python unavailable / account verification cannot start | Select the separate environment's python.exe, verify the supported packages, then Check setup |
| FFmpeg unavailable / video preparation fails | Select the extracted ffmpeg.exe; keep ffprobe.exe alongside when available and Check setup |
| Connector native-host error | Choose the correct browser, rerun connector setup, reload the extension and start a new connection request |
| Approve connection is disabled | Start Connect using this browser in SavedDesk first; reopen popup or Check connection again |
| Permission received but not connected | Read the app's verification result; confirm the profile/account and gallery setup. Browser permission alone is not verified identity. |
| Private Instagram collection cannot be accessed | Connect the account that owns the saved collection; another account's saved-collection URL is not interchangeable |
| Google identity grants no private-media capability | Expected; approve YouTube separately in Browser connections and legacy approvals for account playlists |
| Watch Later / Liked videos is rejected | Use exact list=WL/list=LL playlist input on 0.2.10 and approve the browser profile that opens it |
| Link rejected immediately | Select the matching platform and use a full supported URL; expand short links and use media attachments for Discord |
| Discord access/expiry error | Copy a fresh complete attachment link including signed query, then add it again |
| Facebook public page cannot be read | Some public formats/parser versions remain limited; approval does not create an unsupported extraction route |
| Missing thumbnails after moving downloads | Choose the new root and Find moved files; preserve original subfolders and resolve ambiguous matches |
| Download runs slowly | Check provider limits, disk/network and processing phase. Already compatible streams avoid encoding; unavoidable conversion costs time. |
| Resume waits after Pause | The worker must finish stopping; wait for the state transition, then Resume |
| Video appears blank / unsupported | Verify selected root, FFmpeg and file availability; try Open with Windows or retry the download with compatible settings |
| Not enough disk space | Free space in the selected root, remembering repeat copies and temporary conversion space |
| Delete button unavailable | Finish/pause the affected download and review the selection; changing pages clears batch selection |

When reporting a failure, include the app version, platform, redacted error, public disposable link if suitable, and which tool/browser settings you used. Keep secrets and private content out of the report. Support: [farazhussain5000@gmail.com](mailto:farazhussain5000@gmail.com).

## Development and project layout

Normal installed users do not need to build the project. The source uses Next.js/React/TypeScript/Tailwind, Tauri/Rust, SQLite and an on-demand packaged Python worker. The native app serves a static frontend; the web preview does not have browser-session or real-download access.

| Directory | Purpose |
| --- | --- |
| desktop/ | Frontend, Tauri native host, UI/native checks and branding |
| backend/ | Python worker, adapter logic and regression tests |
| browser-connector/ | Permissioned connector source, identity and tests |
| contracts/ | Worker protocol schema |
| packaging/ | Build, prerequisite, licensing and acceptance tools |
| licensing/ | MIT distribution terms and third-party records/notices |
| development-plans/ | Development plans, setup references and evidence reports |
| oauth-clients/ | Ignored machine-local provider registration files; never publish |
| release-artifacts/ | Permanently ignored generated assets; upload approved files through GitHub Releases |

README.md, PRIVACY_POLICY.md, TERMS_OF_SERVICE.md, CODE_SIGNING_POLICY.md and INSTALLER_EXIT_CODES.md stay at root. All other authored project Markdown lives in development-plans. Dependency-provided documentation is not moved or edited.

For a browser sample preview, run from the project root:

~~~powershell
Set-Location desktop
npm.cmd ci --cache ../.cache/npm
npm.cmd run build
npm.cmd run preview
~~~

Open http://127.0.0.1:4173 and choose **Try sample collection**. Preview records are temporary. For native development, environment creation, required Rust/Windows tools, worker packaging and checks, use [development instructions](development-plans/development.md). A built debug app lives at desktop/src-tauri/target/debug/saveddesk.exe and must retain its adjacent worker, connector and native-host resources.

Source, tests, branding, configuration and dependency locks belong in Git. Downloaded content, cookies/tokens, OAuth JSON, local databases, caches, generated resources and binaries do not. The source is published at [asteroidcrib729/saved-desk](https://github.com/asteroidcrib729/saved-desk) with `main` as the default branch. The completed source was imported in nine development batches. Follow [repository and release instructions](development-plans/repository-and-releases.md) for future releases.

## Verification, releases and planned work

For 0.2.10, 272 automated cases plus native-app and exact-installer checks passed. Controlled Google lifecycle tests preserve the live owner grant. Licensing/source review and installer lifecycle pass for the current hash; historical live seven-platform results are not reassigned to this build. The owner's X bookmarks session lasted approximately two to three hours with 15-20 GB; this is owner-reported usage, not a measured leak/throughput benchmark.

- [Current build and lifecycle verification](development-plans/scope-and-lifecycle-0.2.10.md)
- [Publication scope and residual cleanup](development-plans/publication-scope-and-cleanup.md)
- [Platform support and limits](development-plans/platform-support.md)
- [Account setup and owner actions](development-plans/account-authentication-setup.md)
- [External-tool architecture and licensing](development-plans/licensing-and-external-tools.md)
- [Media, moved files and deletion](development-plans/media-and-storage.md)
- [Owner X endurance record](development-plans/owner-x-endurance.md)
- [Licensing/signing/release gates](development-plans/release-readiness.md)
- [Development Plan 02: future features](development-plans/development-plan-02.md)
- [Development Plan 04: revised account scope](development-plans/development-plan-04.md)

Source publication is complete. Trusted signing and browser-store connector delivery remain pending. Strict signed-production collection requires fresh live-platform evidence bound to the final installer hash. A separately reviewed unsigned prerelease is allowed under the [Code signing policy](CODE_SIGNING_POLICY.md), with missing checks disclosed rather than marked passed. Further Windows/GPU/VM coverage is outside this cycle. Encrypted SQLite, portable recovery and automatic updates remain planned; no current button silently enables them.

## Code signing policy

I am applying to SignPath Foundation; approval and signing integration are pending. The current Windows preview is unsigned. I maintain, review and approve releases as SavedDesk's sole maintainer. The [full Code signing policy](CODE_SIGNING_POLICY.md) explains roles, privacy, unsigned prereleases and the intended signing process. It must also be linked from each download/release page.

If approved and operational: **Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org)**. This is a conditional acknowledgement, not a claim that the current preview is signed or sponsored.

## License, policies and support

I license original SavedDesk code, documentation and branding under [MIT](LICENSE). Third-party components retain their own terms in [third-party notices](licensing/THIRD_PARTY_NOTICES.txt). Starting with 0.2.4, gallery-dl and FFmpeg are excluded from the installer and acquired separately by the user. This does not relicense them or permit redistribution of an arbitrary tool environment.

Downloaded content retains its owner's rights. Use supported routes only for content you have permission or another lawful basis to download and store.

- [Privacy Policy](PRIVACY_POLICY.md)
- [Terms of Service](TERMS_OF_SERVICE.md)
- [Code signing policy](CODE_SIGNING_POLICY.md)
- [Installer exit codes and Partner Center configuration](INSTALLER_EXIT_CODES.md)
- [Policy publication and Google branding](development-plans/policy-publication.md)

**Maintainer:** Faraz Hussain  
**Privacy/support:** [farazhussain5000@gmail.com](mailto:farazhussain5000@gmail.com)
