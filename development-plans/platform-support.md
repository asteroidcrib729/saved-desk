# SavedDesk platform support

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** The README includes all supported target forms and connection requirements. Instagram/X use verified accounts; YouTube playlists use browser approval; Facebook/TikTok/Pinterest are public-only and Discord is attachment-link only.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

**Current follow-up (0.2.10, 9 October 2026):** The app guidance and native/preview registry now exclude private Facebook/TikTok/Pinterest content and remove Pinterest OAuth prerequisites. Existing browser approvals remain available for supported public links; Instagram/X and YouTube playlist routes are preserved. Google lifecycle acceptance uses controlled native credentials and provider responses, as the owner explicitly requested, preserving the current live Google grant. See [scope and verification](scope-and-lifecycle-0.2.10.md) and [owner-reported X endurance](owner-x-endurance.md). Historical version results below retain their original scope.

**Owner scope decision (9 October 2026):** Pinterest remains public/shareable-link only; its OAuth and secret-board work is cancelled. Facebook and TikTok also exclude private/restricted content. Their optional identity-only integrations are under feasibility review, not authorized implementation or a requirement for public downloads. Instagram/X account downloading and the existing Google identity/YouTube browser-approved playlist workflow remain. See [Facebook/TikTok requirements](facebook-tiktok-authentication-feasibility.md). The 0.2.10 app implements this guidance and provider-status revision. Browser approval controls remain; no universal content-visibility classifier is claimed.

**0.2.9 Watch Later fix:** The native and worker URL validators now recognize Watch Later (list=WL) and Liked videos (list=LL). Both require an approved YouTube browser session; Google identity alone does not supply it. Unknown short IDs and malformed URLs remain rejected. See [fix and verification](watch-later-fix-0.2.9.md). On 9 October 2026, the owner confirmed that the two-video Watch Later playlist downloaded successfully using this browser-approved route. This confirms the reported download, not completion of the OAuth media replacement or general private-video acceptance.

**Historical 0.2.8 verification:** Debug/release targets and installer are rebuilt. Native account, download, HTTPS, regression and packaging evidence is recorded in [authentication verification](account-authentication-implementation-0.2.8.md). The owner reports successful Google browser sign-in and identity checking. Expiry/refresh/revocation acceptance and new private-media routes remain pending.

**Historical 0.2.8 authentication implementation (scope revised above):** The native Google Desktop identity flow and shared account/capability foundation are implemented. The owner-supplied Google Desktop configuration is installed locally, and the owner reports successful sign-in and identity checking. Remaining lifecycle acceptance is pending. This does not enable private YouTube downloading. Other provider flows and private-media adapters remain pending. Existing Instagram/X private and public/CDN download paths are preserved. See [setup and owner actions](account-authentication-setup.md). Historical 0.2.7 release archives remain unchanged.

**Historical account-authentication proposal (8 October 2026, scope revised above):** [Development Plan 04](development-plan-04.md) supersedes the session-only account model for YouTube, Facebook, TikTok and Pinterest and defines optional Discord identity. The owner reports successful private Instagram/X downloads, including a 504-item Instagram collection. The accepted baseline for the other five remains public/shareable-link downloading. The full replacement remains in progress; the 0.2.8 implementation slice is described above.

**Current architecture - 0.2.10:** gallery-dl and FFmpeg are external user-installed tools, excluded from the new installer. See [licensing and setup](licensing-and-external-tools.md). Older bundled-tool, no-Python and unresolved-source statements below describe their recorded earlier builds; they do not apply to the new payload or clear old installers.

Updated 8 October 2026. Spotify and Reddit have been removed; Discord downloads require only the selected media attachment URL. Public links are available alongside optional browser-session approval for YouTube, Facebook, TikTok and Pinterest. These new approvals check session scope; they do not claim verified provider account identities.

## Use the new platforms

Reopen the updated development executable, choose **Add download**, select **Platform**, and paste a full supported link. Browse each platform from the sidebar, ordered YouTube, Facebook, Instagram, Discord, TikTok, Pinterest and X, or use **Library -> Platform** to filter saved content. Existing Instagram/X connection, duplicate confirmation, selected-folder containment, file viewing, queue controls and compatible MP4 video finalization remain available. For Discord, **Accounts -> Download Discord media** opens the form directly.

| Platform | Implemented workflow | Access and current limits |
| --- | --- | --- |
| Instagram | Saved posts, collections, posts/Reels | Existing verified account connection; private downloads confirmed by the owner. |
| X | Bookmarks and posts, including text | Existing verified account connection; private downloads confirmed by the owner. |
| YouTube | Public videos, Shorts, recorded live URLs, explicit finite playlists and browser-approved Watch Later/Liked lists | Full video/playlist links; a watch link saves only its video. Legacy browser approval is not verified account authentication. Google identity is separate from browser-approved playlist downloads; general private-video support is not established; live/upcoming broadcasts, DRM and automatic mixes remain unsupported. |
| Facebook | Public video, watch and Reel adapter | Limited compatibility. A real public-page probe failed with the current stable engine; this is not certified as working for every public page. Legacy approved browser session exists for supported video links. Private content is excluded from supported scope. No group browsing or photo-post import; authentication cannot fix every parser failure. |
| TikTok | Public videos and photo posts | Video-specific extraction for video links; gallery extraction for photo posts. Legacy browser approval exists; optional official identity is conditional and private content is excluded. No profile-history import. |
| Pinterest | Public pins, boards and their owned sections | Public links only under owner scope; OAuth and secret-board work cancelled. Legacy approval is not verified identity. Multi-file pins share one post identity. |
| Discord | Selected image/video/audio attachment link | Copy the attachment's `cdn.discordapp.com/attachments/...` link, not a channel/message URL. Signed links expire; copy a fresh link if refused. Ready without account/bot/server setup. Only the selected attachment is requested; no server, message-history or user metadata is retrieved. |

Open shortened TikTok/Pinterest/Facebook share links in your browser and copy a full supported address. Regional Pinterest domains and unusual Discord filenames are not covered by the initial URL allowlist. YouTube/Facebook/TikTok/Pinterest sessions require explicit platform approval in Accounts. Being signed into Chrome alone does not grant SavedDesk access. Discord attachment downloads require no account integration.

## Video storage and source selection

New videos keep only a verified H.264/AAC MP4. yt-dlp adapters prefer compatible video/audio streams before higher-resolution VP9/AV1; separate streams merge without video encoding. Incompatible-only streams are converted before completion and the incompatible source is removed after verification. A failed conversion keeps its unfinished source for retry. The highest platform resolution may be unavailable in H.264. See [profiles, speed tradeoffs and existing-library scope](media-and-storage.md#download-time-playback-compatibility).

## Authentication requirements and planned replacement

Instagram/X have verified account identities and owner-confirmed private downloading. YouTube, Facebook, TikTok and Pinterest currently have cookie-presence/browser-session approval controls; these do not verify a provider account subject. Discord needs no account connection for selected attachments. Facebook/TikTok/Pinterest remain public-link only. Discord uses selected attachments, and YouTube also retains browser-approved playlists such as the owner-confirmed Watch Later result.

[Development Plan 04](development-plan-04.md) now preserves Google identity, makes Facebook/TikTok identity conditional, cancels Pinterest OAuth, and excludes private Facebook/TikTok/Pinterest media. Existing browser approvals are not verified provider subjects. Discord links remain independent of sign-in. Google identity does not currently replace YouTube browser credentials. The 0.2.10 native/preview registry and UI implement the updated scope guidance.

## Live progress and video repeat

Downloads shows a live current-transfer bar, byte counts and completed-file counts. An exact percentage is shown only when the current transfer has an actual byte total. Unknown collection inventories and processing use an indeterminate bar; the app does not invent a whole-collection percentage or ETA. Per-transfer counters may restart for another file/component stream. Worker updates are throttled to at most four per second, checked against the approved transfer, and stripped to counters/phase before reaching React. Counts and final results stay in SQLite; fine-grained progress is transient and a restarted interrupted job resumes through the existing queue.

The video control row includes **Repeat video**, with an accessible pressed state. It loops the same native video element and remembers the preference on this PC, including subsequent openings/fullscreen. It does not advance to another file or post.

## Structure and safeguards

- `desktop/src/lib/platforms.ts` supplies labels, capabilities and plain-language help. `platforms.rs` and the worker's `platforms.py` validate targets independently against the shared `contracts/platform-targets.json` examples. Arbitrary sites, credential-bearing URLs, foreign hosts, unsupported routes and path traversal are rejected.
- Authenticated Instagram/X keep their existing account/session identity checks. Public jobs use a separate `public` catalog namespace; no connected-account records are invented and anonymous jobs reject credentials from unrelated sources; four optional browser-session adapters require a matching protected session scope.
- `public_downloads.py` selects yt-dlp for YouTube/Facebook/TikTok video and gallery-dl for Pinterest/TikTok photo content. Stable native/media IDs pass through SQLite approval before each media transfer, followed by file verification and a catalog acknowledgement. Pinterest traversal is restricted to sections of the approved board.
- The existing serial queue, quality/profile selection, new-only/all-again confirmation, retry, originals, thumbnails and selected-root guards are reused. Text-plus-image posts are classified as image; later video assets promote them to video.
- Discord signatures stay in a per-job DPAPI-protected app-data file. SQLite and library/source URLs contain the unsigned identity; completed/cancelled jobs discard the protected link. No raw engine logs or signed provider URLs go to the renderer. An expired link still requires a fresh user-selected link.
- Discord transfer streams are bounded to 10 GB, use temporary files, reject redirects and web documents, and verify image/audio content before publishing. Downloaded video is finalized as compatible MP4. FFmpeg local-media operations permit only file/pipe protocols. Unicode filenames are displayed while safe attachment-ID filenames are written. Playback continues to use file-ID routes inside the selected library root.
- YouTube uses pinned `yt-dlp-ejs` 0.8.0 alongside yt-dlp 2026.8.19 and a bundled Node.js runtime (24.21.0 in this artifact). The engine runs its solver with Node's permission model; remote solver downloads are disabled. Node runs only during extraction. The packaged runtime adds about 89.2 MiB of disk space, and does not introduce a Next.js server or an idle background runtime. Its license and version/hash manifest accompany it.
- The catalog is still ordinary SQLite. DPAPI protection of account sessions and attachment signatures does not encrypt catalog descriptions, paths, downloaded media or previews. Plan 02's database encryption/recovery work remains outstanding.

## Validation and remaining delivery gates

Backend and native URL contracts reject unsupported sources, arbitrary hosts, traversal filenames and malformed signatures. UI tests exercise the Discord shortcut, duplicate confirmation and removed platform options. The isolated Windows acceptance uses the real packaged worker, native catalog and WebView2 with local HTTP fixtures. It verifies image/audio/MOV transfers, MP4-only video finalization, real audio/video playback, duplicate/renewed-link behavior, repeat copies, missing-file restoration, expired links and zero connected accounts. These fixtures verify app integration without requesting private owner links; they do not establish that every Discord attachment remains available.

Earlier live YouTube, TikTok and Pinterest transfers succeeded. Facebook parsing compatibility remains outstanding. Live large inventories, private-content/browser matrices, clean-machine installation and weak-hardware benchmarks remain required before broad production claims. Discord bot/OAuth/server-history integrations are outside this direct-media requirement.

## Discord attachment workflow

1. Open an image, video or audio attachment you can already view in Discord and copy its media link. **Copy Message Link** is a different URL.
2. Choose **Accounts -> Download Discord media**, or **Add download -> Discord**.
3. Paste the full `https://cdn.discordapp.com/attachments/<channel>/<attachment>/<filename>` URL, including its `ex`, `is` and `hm` parameters, and choose **Start download**. Download names are optional.
4. Monitor the live transfer in Downloads. Open the saved file from Library; the Audio filter shows audio attachments. Videos are finalized as compatible MP4 before completion.
5. If the link expires, copy a fresh media link in Discord and add it again. Stable attachment IDs preserve duplicate confirmation even when the signature changes; missing saved files can be restored.

Supported attachments: JPG/JPEG, PNG, WebP, GIF, BMP, AVIF; MP4, MKV, WebM, MOV, M4V, AVI; MP3, M4A, WAV, OGG, Opus, FLAC, AAC. Media contents must match their format; scripts, archives and web documents are not imported. Signed links are protected for pending work and excluded from catalog/display URLs. Existing downloaded files remain playable after the original link expires.

## Research sources

- [Discord signed attachment CDN URLs](https://docs.discord.com/developers/reference#signed-attachment-cdn-urls): preset expiry and the meaning of `ex`, `is` and `hm`.
- [Exact Discord media steps](discord-media-downloads.md).
- [yt-dlp documentation](https://github.com/yt-dlp/yt-dlp) and [gallery-dl documentation](https://github.com/mikf/gallery-dl).

## Removed platform support

Spotify and Reddit selectors, icons, URL adapters, download routes, provider actions and active roadmap work have been removed. Reddit public links and its former API-approval action are no longer available. Unsupported legacy job sources cannot be retried through Downloads. Existing local files/history are preserved as generic saved content; no cleanup deletes user files or resets the catalog.

## Repository and release preparation (7 October 2026)

Release builds pin the tested extractor/runtime dependency closure. Publishing an installer does not establish live-provider compatibility; keep the documented provider acceptance gates. See [source audit and packaged release process](repository-and-releases.md).

Instagram reel links accept both `/reel/<id>/` and `/reels/<id>/`; both normalize to the same canonical `/reel/` target before history lookup and extraction. The plural alias was found during real-provider acceptance and corrected in 0.2.3.
