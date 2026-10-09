# Viewing media and finding moved files

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** The README covers image zoom/fullscreen, video repeat/persistent volume, audio/text, selected-folder repair and permanent single/batch/download/collection deletion. Encryption/recovery remains planned.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

**Current architecture - 0.2.10:** gallery-dl and FFmpeg are external user-installed tools, excluded from the new installer. See [licensing and setup](licensing-and-external-tools.md). Older bundled-tool, no-Python and unresolved-source statements below describe their recorded earlier builds; they do not apply to the new payload or clear old installers.

Open **Library**, click a post (or focus its arrow and press Enter), and choose a saved file or copy. Images open inside SavedDesk with zoom, Fit image, and Fullscreen. Videos use Windows/WebView2 decoding with an in-app seeking/control bar: play/pause, volume/mute, 10-second skips, playback speed and fullscreen. Previous file / Next file navigates the available assets and copies of that post. Closing or changing files stops the previous player. Audio and text files can also be viewed where supported. **Open with Windows** remains available for a codec or format WebView2 cannot display.

In fullscreen, **Previous** sits on the left edge and **Next** on the right edge, centered vertically. The arrows switch available files and copies within the same post and disable at its boundaries. Images have a **Close fullscreen** button in the top-right. Videos use **Exit fullscreen** in their seeking/control bar, with no duplicate corner button. Exit returns to the open post; Escape also exits fullscreen first. Switching files stops the previous player. The filename/count tag is no longer displayed over fullscreen content; file changes are still announced to screen readers. Playback errors remain visible.

Use **Fullscreen** or **F** for images; use the player's **Enter fullscreen** button or **F** for videos. The video control surface intentionally targets the persistent frame: WebView2's native video-only fullscreen hides sibling navigation and rejects a later frame transfer without a user gesture. Media decoding remains native HTML video; the controls require no external video-player runtime. Focus returns to the image fullscreen trigger or the video player's fullscreen button on exit.

Fullscreen video fills the full viewer frame at the largest uncropped size that preserves its aspect ratio. Its translucent control overlay places play/pause, skips, mute/volume, speed, elapsed time, seeking, duration and fullscreen in one horizontal row. The overlay reserves no video space and hides after three seconds of inactivity while playing or paused. Mouse movement anywhere in the frame reveals it. Keyboard navigation reveals controls and keeps focused controls visible; dragging a slider or using the speed menu also keeps controls available. Outside fullscreen, controls stay visible. At very narrow sizes, the row scrolls horizontally rather than stacking. Windows high contrast uses system colors.

## Playback compatibility

A valid MP4 can use VP9 or another codec/pixel format that behaves differently in VLC and Windows/WebView2. On opening a video, SavedDesk first checks for a scoped, up-to-date playback copy and then reads bounded MP4 track metadata in Rust. Ordinary AVC/H.264 MP4 files open directly, without starting Python/FFmpeg or waiting for preview/download work. The parser reads at most 4 MiB of movie metadata, seeks past compressed frame data, and limits box counts; malformed, unknown or other codec metadata falls back to the existing preparation path. A quick metadata decision is not a guarantee that every AVC file can decode on every Windows device. When preparation is needed, SavedDesk inspects the local stream and creates a separate H.264/AAC playback copy. **Use compatible playback** also requests a copy for a video that stays blank without raising an error. The original remains the downloaded file and is still used by Open with Windows. There are no provider requests or new downloads.

Copies live in a `.playback` folder beside the original, within the selected save folder, and are reused on subsequent opens. They do not add posts or downloaded copies to the catalog/history. The copy key includes the catalog ID, original size and modification time. The native protocol revalidates the current original and selected root before streaming either version. Moving the original outside that root makes its cached playback inaccessible too. Repair scans skip `.playback`; retain it when moving entire job folders or let it regenerate.

Video readiness is included with the bounded saved-file list. Download-time playback copies are reused directly, and ordinary H.264 MP4s use the native check; manual compatible playback still requests native preparation. Codec decisions are cached in memory for up to five minutes, bounded to 128 entries and keyed by canonical path, size, modification time and creation time. Cache reuse follows current root/file validation and never authorizes content outside the selected folder. Changed fingerprints or expiry trigger fresh inspection; the cache stores no media bytes and is not persisted.

The loading message distinguishes compatible-copy preparation from the quick metadata check and avoids flashing for checks finishing within 150 ms. Creating the first copy can take seconds or minutes; reopening a valid cached copy does not repeat conversion. Preparation is serial with downloads/previews, uses one encoder thread, preserves dimensions/aspect ratio (odd dimensions round down to even), and checks the generated file's decoding before publishing it. It needs writable storage, at least 256 MiB free space, and time proportional to video size. Errors keep the original and offer Windows playback/retry. The space floor cannot guarantee a large conversion will fit. HDR fidelity, every codec/device and cache cleanup/quotas remain release work. Switching files or closing a post prevents an old preparation result from replacing the current viewer.

The metadata check uses [MP4RA registered sample-entry codes](https://mp4ra.org/registered-types/codecs). Microsoft documents [Edge playback troubleshooting](https://learn.microsoft.com/en-us/troubleshoot/microsoft-edge/development/video-playback-issues) and [Windows media formats](https://learn.microsoft.com/en-us/windows/win32/medfound/supported-media-formats-in-media-foundation). VP9 is supported in Edge generally; the observed blank playback is a specific file/decoder-path failure, not a claim that all VP9 media is unsupported.

## Accessibility and everyday navigation

Click the SavedDesk bookmark icon to expand or collapse the sidebar; your choice persists natively across desktop launches. Hover and keyboard focus never expand or collapse it. At 640 CSS pixels or narrower, an explicitly expanded sidebar overlays the page until you click the icon again; resizing does not change your chosen state. There is no separate toggle icon, Collections list, Downloads badge or Low-resource sidebar action. Collection jobs remain in Downloads and Low-resource mode is configured in Settings. Fixed internal geometry keeps icons stationary while width and label opacity animate; scrolling is vertical-only and the collapsed brand icon stays centered. The short click-triggered transition respects Windows reduced motion. The old bottom activity bar remains removed; Downloads and screen-reader status announcements retain progress information.

Scroll areas use SavedDesk's own rounded rails/thumbs with native wheel/touch scrolling underneath. Drag a thumb or click the track. Focus a scrollbar and use arrows, Page Up/Down, Home/End. Rails update on scrolling/resizing/content changes in animation-frame batches; no continuous polling or third-party scroll runtime is used. Rounded panels reserve padding for helper text. Search uses a subtle field-border focus cue, and restored library focus no longer draws an outline across a whole post; the arrow button retains its keyboard focus cue.

Click anywhere on a library row to view the post. Focus its View saved files button and use **Up/Down**, **Home/End**, **Page Up/Down**, and **Enter**. Tab also reaches posts beyond the currently mounted rows; only up to 18 rows remain mounted. Screen-reader descriptions identify the creator, caption and platform, with position/count metadata for the current page. Use Next page when more than 100 posts match.

Search has **Clear search**; filtered results offer **Clear search and filters**, including empty results. Missing-file dialogs offer **Open save location settings**, where you can select the correct folder and use **Find moved files**. Folder changes/repair explain why they are unavailable during a download or account connection.

**Help & shortcuts** is available in the top bar, with keyboard and account/file/video recovery guidance. **Settings > Accessibility and appearance > Interface size** enlarges text and controls from 100% to 200%. **Ctrl + Plus/Minus** adjusts it and **Ctrl + 0** restores 100%, outside fullscreen. This non-sensitive preference is stored in the app's local WebView profile and restored on launch; it is separate from the download/catalog settings. Keyboard navigation focuses the new screen heading. Windows high contrast and reduced motion preferences remain supported. See the [accessibility review](accessibility-and-usability.md) for tested scope and remaining acceptance work.

## Platform sections and persistent video volume (7 October 2026)

The sidebar now opens platform-filtered saved-content views in this order: YouTube, Facebook, Instagram, Discord, TikTok, Pinterest, X. Library still combines sources; Downloads remains the job/progress/recovery view. Each section shares search, media filters, selected-folder viewing and deletion. Collapsed icons retain accessible names and the existing hover/pin animation and vertical-only scrolling.

Video volume and mute are remembered across files, fullscreen and application launches. Slider changes, focused-video Up/Down and mute controls share the same state. The native catalog stores these non-sensitive preferences in a separate constrained `player_preferences` row through schema version 4, independently of save-folder/video-profile settings. Writes coalesce during dragging, are ordered, and flush when switching/closing a player. Native validation accepts only finite volume from 0 to 1 and a Boolean mute state. Late preference reads cannot override newer user changes. Browser preview retains its local WebView/browser preference; native SQLite persistence is authoritative in the desktop app.

Focus no longer draws an outline, shadow ring or additional border on inputs, buttons, video, image viewing or custom rails. Keyboard navigation remains available, with subtle background focus changes and high-contrast text cues. Static container/control borders remain part of the interface. The input audit covers library/search/selection, Settings, Accounts including Firefox profiles, all seven download forms, player sliders/file selection/speed, Help and deletion dialogs.

## Viewer shortcuts and original posts

Use **Alt + Left/Right** to navigate available files/copies. For images, Left/Right also navigate, **+ / -** change zoom, and **0** restores fit. **F** toggles fullscreen; for video/audio, **K** plays/pauses and **M** mutes. Left-click the video or player background to play/pause. The player suppresses the browser context menu, and right-click does not change playback. With focus on the video, Space plays/pauses, Left/Right seek five seconds, and Up/Down change volume. Holding Space toggles once rather than repeatedly. Playback shortcuts do not draw a border over the video; deliberate Tab navigation retains visible focus cues, as do the player controls. The seeking/volume sliders accept their standard arrow/Home/End keys. When a zoomed image has focus, arrow keys pan it; Alt + Left/Right still changes files. Escape closes the viewer or exits fullscreen. The available-file counter announces selection changes.

**Open original post in browser** opens a validated public Instagram/X post URL in your Windows default browser. Stored links are checked natively by post ID, restricted to supported HTTPS hosts/routes, and stripped of query/fragment tracking. Missing or unsupported source metadata produces a help message. The privileged app window does not navigate to platform pages.

## Settings and Accounts layout

Settings cards use consistent inset padding, line spacing and separated notes. Browser selection and Check setup share an action row; Choose folder and Find moved files sit beside the selected path when space allows. Video actions share a row, and interface-size help sits beside its labeled selector. Low-resource mode has a switch next to its description. Privacy and local-test actions sit beside their explanations and wrap at compact widths. Accounts separates browser guidance, connector instructions, account status/actions and session privacy guidance. Long status text and controls wrap without horizontal overflow.

## Check your setup

In **Settings > Check your setup**, choose your browser and select **Check setup**. The check runs locally on demand; it does not contact Instagram/X, verify an account, inspect passwords/cookies, or scan downloaded content.

- Save folder checks availability and write permission with an empty unique probe that is removed afterward.
- Free space reports the bytes available to your Windows user, including disk quota restrictions. Less than 1 GiB gives a warning; less than 256 MiB blocks new asset transfers.
- Download engine checks startup and the private worker protocol. FFmpeg/FFprobe checks actually launch the tools with their version argument. If the engine is busy, its result is Not checked; check again after the task finishes.
- Browser connection checks the selected browser's host registration and packaged connector files. It cannot prove an extension is installed, enabled, current, or approved. **View accounts** opens the existing setup/approval flow. Regular Firefox profiles use the existing direct connection flow.

Changing the folder or browser clears old results. They are a snapshot, not ongoing monitoring. A disconnected save folder is never recreated; reconnect the drive or select the folder's new location. Download preparation, starting, retrying, and each new asset recheck the selected folder and minimum free space. Completed files remain intact. The free-space floor does not guarantee that a large file, collection, or conversion will fit; mid-transfer disk exhaustion still needs normal recovery.

These checks use [Windows user-available disk space](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getdiskfreespaceexw) and a bounded read of the selected [native-host registry value](https://learn.microsoft.com/en-us/windows/win32/api/winreg/nf-winreg-reggetvaluew).

## Privacy settings

**Settings > Privacy and local data** describes the current protection accurately: account sessions are DPAPI protected for your Windows user on this PC; the catalog, downloaded media, and thumbnails are unencrypted. **Manage connected accounts** lets you disconnect SavedDesk's session access without deleting downloads/history. Catalog encryption, portable encrypted recovery, and privacy lock remain Plan 02 work; this panel does not enable them.

## The selected folder is the browsing boundary

**Settings > Save location** now controls both new downloads and access to existing media. SavedDesk does not fall back to old download locations. Library availability, previews, the built-in viewer, external file opening, and job-folder opening check the selected folder. Missing or disconnected drives remain unavailable; unrelated folders are never searched. Windows junctions resolving outside that folder are rejected.

## Moving existing downloads

1. Pause or finish active downloads and close the viewer before moving content.
2. Move your existing content into the new folder with Windows Explorer. Keep the filenames and original subfolders when possible, including `.previews` if you want to retain cached thumbnails.
3. Choose that folder in **Settings > Save location**. SavedDesk checks for matching files and relinks its catalog in place.
4. If you chose the folder before moving the content, select **Find moved files** afterward. The app also checks the selected folder when it starts.

The check reports relinked, available, missing, and ambiguous file counts. It matches recorded filenames, expected byte lengths, supported content signatures, and the original job folder when available. A unique flat-folder match is allowed only when it cannot confuse multiple recorded copies. This is not cryptographic identity verification. Ambiguous matches, renamed files, or files with the wrong size/format are left unchanged. No original media is moved, overwritten, deleted, or downloaded by this operation. Retain folder structure to resolve ambiguous repeated copies; detailed per-item repair reports and journaled cross-volume moves remain planned work.

If `.previews` was not moved, SavedDesk regenerates thumbnails locally for visible posts in batches of at most 18. Preview generation starts when the download worker gate is idle and uses the existing single-thread FFmpeg preset. Download and preview work share that gate. You can browse immediately while thumbnails appear. Missing previews do not require reconnecting an account or downloading the media again.

## Implementation and limits

The renderer requests media by catalog ID through a native protocol, without receiving filesystem paths or reading arbitrary files. The host rechecks the current selected folder and expected size, verifies the format signature, and returns the appropriate media type. Video/audio range responses are capped at 2 MiB; full video files are not passed through JSON or loaded into a single native buffer. Images have a 32 MiB response cap, and text display has a 1 MiB cap; larger/unsupported content can use the guarded Windows opening action. Supported decoding depends on WebView2/Windows codecs. Only one saved media file plays in the dialog at a time, and up to 100 recent assets/copies are listed.

The implementation uses [Tauri's asynchronous custom-protocol API](https://docs.rs/tauri/latest/tauri/struct.Builder.html#method.register_asynchronous_uri_scheme_protocol) to keep filesystem work off the webview thread. The protocol accepts read-only requests and scoped range preflights from SavedDesk's own origin; it exposes no general filesystem route and enables no broad asset scope. Responses use `no-store` and `nosniff`.

Repair scans only the selected folder, skips preview folders and directory links/reparse points, and stops rather than partially committing an incomplete scan above 100,000 entries or 32 directory levels. Catalog path/job-location updates commit transactionally. The check does not implement automatic file moving, content import, checksummed recovery, or encrypted catalog storage; those requirements remain in Development Plan 02.


## Mouse playback and fullscreen transitions

Left-click the video or player background to play/pause in windowed or fullscreen mode. Each click toggles once; child buttons, sliders, playback-speed selectors and custom rails keep their own behavior. Right-click and keyboard context-menu events do not toggle playback. Space/K and the labeled play/pause button remain available.

Images and videos retain their current element during fullscreen changes. A short 200 ms transform interpolates size and position without stretching the media or resetting the decoder/source. Native resize steps retarget that animation; the modal reserves its viewer space and focus restoration avoids scroll jumps. Windows reduced-motion preferences disable interpolation. The operating system's fullscreen switch may add time beyond the media animation. See [live test evidence](ui-testing.md).


The dialog's position, dimensions and inline viewer are held steady through fullscreen viewport changes, then released after exit resizing settles. The dimmed backdrop fades on return rather than exposing the underlying page abruptly. These transitions use the existing elements and opacity/transform animation, without copying video frames or allocating a page screenshot. Rejected fullscreen requests release temporary layout/backdrop state; reduced motion keeps the geometry protection while skipping animation.


## Deleting saved content

- **Library**, **Instagram saved**, and **X bookmarks**: the trash button deletes the selected post and all its recorded saved files/copies. The viewer also has **Delete post**.
- **Saved files and copies** in the viewer: **Delete file** removes that copy, its tracked conversion original, and its generated preview/playback copies. Other copies remain.
- **Downloads -> Delete download** removes that job's saved files and history. **Delete collection** is available for collection targets and removes all jobs for the same platform/account/target, including repeat downloads. Files from other jobs and posts with surviving copies remain in the library.

Every deletion requires a fresh count/size review and **Delete permanently** confirmation. Cancellation does not delete anything. Pause or finish downloads and video preparation first. Confirmed deletion closes the viewer and releases its media source before native file operations. The renderer passes IDs and a single-use, five-minute confirmation token; it never supplies deletion paths. A changed catalog, file fingerprint, or selected folder invalidates the confirmation. Only files currently inside the selected folder are deleted. Missing-file records can be removed; files outside that folder are explicitly reported and kept on disk. Cancel and use **Find moved files** first if you want those relocated files deleted here.

The native host stages exact recorded files and recognized generated caches in `.saveddesk-delete` inside the selected folder, writes a recovery journal, then commits catalog removal. A staging error or catalog failure restores the staged files. Startup and the next deletion recover interrupted operations: restore when the owning media record survives, otherwise finish the committed deletion. No file is overwritten during recovery. A locked file produces a recovery message; close the other app before retrying. Permanent cleanup follows commit, so **Delete permanently** is not Windows Recycle Bin/Undo. Only empty directories are removed; untracked files are kept. Deleting a collection is never an unchecked recursive directory deletion. Deletion is bounded to 10,000 media records, 30,000 associated files and an 8 MiB journal per operation.

Schema version 3 adds path/byte tracking for originals preserved by newly converted downloads. **Find moved files** rebases those originals alongside their identified converted outputs after matching byte size and a video signature. Originals from conversions made before this tracking existed, engine leftovers and other untracked files are retained rather than guessed/deleted. The catalog and recovery journal remain unencrypted; account sessions still use separate Windows DPAPI protection.

## Download-time playback compatibility

New Instagram/X and public-platform video transfers keep **one playable H.264/AAC MP4 per downloaded video**. This supersedes the previous policy of keeping an incompatible original plus a `.playback` or `.compatible` derivative. Finalization and thumbnail generation finish before item completion/catalog recording, so opening a newly completed video does not start another conversion.

YouTube and other yt-dlp sources prefer available AVC/H.264 video and AAC audio streams, respecting the selected resolution cap. Separate streams are merged into MP4 and their temporary component files are removed. Higher-resolution VP9/AV1 sources are not preferred over a compatible H.264 source: **Best available** means the best compatible source first. This can select a lower source resolution than the platform's absolute maximum. A resolution option is an upper limit, not a promise of that exact resolution. If a platform supplies only an incompatible source, conversion is necessary; changing its filename/container alone cannot make its codec compatible. See [yt-dlp format selection](https://github.com/yt-dlp/yt-dlp#format-selection).

**MP4 without resize fallback** uses streams within the chosen cap; it refuses an above-cap source. **MP4 with resize fallback** can resize a higher source when no within-cap stream exists. The stored profile values remain `original` and `compatible_mp4` for existing job/duplicate-history compatibility, but neither new-download profile retains an incompatible original. Already-compatible MP4s need no re-encoding or extra saved video. Suitable H.264 video is packet-copied; only incompatible audio is re-encoded when needed. [FFmpeg streamcopy](https://ffmpeg.org/ffmpeg.html#Streamcopy) bypasses video decoding/encoding.

If AAC is absent, the selector still prefers AVC with another available audio codec, and only the audio is converted. Silent recordings do not require an audio stream. Necessary video encoding probes actual device initialization, not just encoder availability, and tries Intel Quick Sync, NVIDIA NVENC or AMD AMF. A failed real-input hardware attempt falls back to software. Software uses H.264 `superfast`, CRF 23 and two encoder threads, with bounded decoder/filter threads. This trades compression efficiency for speed; software outputs can be larger than the previous `veryfast` files. Encoding still depends on duration, resolution and hardware. The three-second device-probe timeout bounds each candidate; successful selection is cached within the worker job. No platform-independent millisecond conversion guarantee is made.

A generated MP4 must have readable compatible codec metadata and pass a combined startup-frame decode check before publication. One FFmpeg process checks the actual stream metadata and decodes up to three frames within 0.25 seconds; this avoids replaying fifteen seconds for every item and is not full-file decode certification. Conversion sets valid BT.709 frame colour properties as well as codec flags, preventing reserved source metadata from making the converted output unplayable. Incompatible MP4 downloads are atomically replaced in place; WebM/MKV downloads are finalized as MP4 and their source is removed. An unrelated existing MP4 is never overwritten: a distinct final name is used. Failed verification, encoding or replacement removes temporary output and keeps readable unfinished sources for Retry; they are not recorded as completed playable items. Instagram/X collections record individual finalization failures and continue later items. If input has no readable video stream, it is quarantined as an unrecorded `.rejected-<id>` file so retry downloads fresh bytes. Completed files are preserved. Temporary streams/source/output can coexist while work is running. There are no new download-time `.playback` copies or tracked conversion originals. Catalog byte counts/path and previews identify the final file only.

Existing library files and their legacy playback caches remain supported without a silent whole-library conversion/deletion. Legacy on-demand/manual preparation retains its recovery behavior and original until explicitly deleted through existing confirmed deletion controls. Schema-3 original tracking remains for those earlier copies and their moved-file/deletion recovery. The new single-file policy applies to downloads completed by this build.

FFmpeg executable checks are reused in worker memory while the binary fingerprint is unchanged; replacing the executable triggers a fresh check. Existing small valid JPEG previews are reused when newer than the source and refreshed after source modification. Compatible MP4s retain the same bytes and do not run an encoder or replay decoding. See [the retained Instagram failure and current measurements](implementation-progress.md#instagram-video-reliability-and-bulk-processing-overhead-7-october-2026).

On this development PC, an isolated 30-second 720p VP9 fixture measured the software encoding stage at 10.48 seconds with the previous one-thread `veryfast` setup and 5.81 seconds with two-thread `superfast` (1.80x faster). Output grew from 8.66 MB to 15.87 MB. Evidence: `.cache/compatible-benchmark/results.json`. The same PC successfully initialized Quick Sync using both installed and bundled FFmpeg. A separate ten-minute 720p VP9 fixture (looped from that synthetic clip) finalized using bundled FFmpeg/Quick Sync in **113.60 seconds**, including device probing and output verification, removing its 212.89 MB WebM source and keeping the 222.57 MB MP4. Evidence: `.cache/compatible-benchmark/ten-minute-results.json`. These are bounded local checks, not a weak-hardware/every-codec guarantee. Broader HDR/color-fidelity, device/codec acceptance and cache quotas remain release work.


## Multi-post selection (7 October 2026)

The native Library and platform views provide post checkboxes, Select this page / Deselect this page, Clear selection and Delete selected. Shift-click applies a range from the last selected checkbox. Selection includes all posts on the current page (up to 100), including rows outside the 18-row virtual window. It clears on page/search/platform/media-filter changes; download polling preserves surviving selected IDs. Cancel preserves the selection and all files.

With focus inside the saved-post list, Space toggles a checkbox, Ctrl+A selects the page, Delete opens the shared review and Escape clears selection. Normal row clicks still open the viewer. One confirmation reviews every saved copy across the selected posts; the native host handles them in one recoverable file-staging operation and SQLite transaction. Invalid, stale or oversized batches fail before deletion. Active downloads/preparation still block deletion, and the selected-folder boundary remains mandatory. Posts outside this page are never implicitly selected.

## Direct Discord media (7 October 2026)

The direct attachment workflow supports image, video and audio files. Audio has its own library filter and uses the built-in audio player; MP3/M4A/WAV/OGG/Opus/FLAC/AAC are checked before catalog publication. Image signature checks include BMP and AVIF. MOV/M4V/AVI/MKV/WebM video inputs are finalized to compatible MP4 before completion. Unicode original filenames are captions, while physical filenames use the attachment ID. No account/server metadata is fetched. Transfers reject redirects, web documents, empty/incomplete content and files over 10 GB, and remove failed partial transfers. Local FFmpeg operations restrict input protocols to file/pipe. See [the direct-media guide](platform-support.md#discord-attachment-workflow).

## Advanced video settings and switches (7 October 2026)

Open **Settings -> Video defaults -> Advanced video settings** to configure conversion defaults. Each video setting has a border-free **About** icon that opens a separate information dialog without shifting the form. It works with mouse, keyboard and assistive technology. Close it with its close icon, Escape or a backdrop click; focus returns to the info icon. **Add download** retains resolution/output-profile controls and captures advanced defaults from Settings; it has no Advanced video settings button or advanced override controls.

| Setting | Effect on downloaded video |
| --- | --- |
| Encoding method | Automatic prefers a tested working hardware encoder and falls back to software. Software uses the CPU only. Both save H.264/AAC MP4. |
| Software encoding speed | Very fast (`superfast`, default) favors processing time; Balanced (`fast`) and Smaller files (`slow`) spend more CPU time compressing. Applies only to software conversion, including automatic fallback. |
| Software video quality | CRF 18 favors detail/larger files, CRF 23 is balanced/default, CRF 28 favors smaller files/more compression. Hardware retains its own balanced quality. |
| Converted audio bitrate | 96/128/192/256 kbps; default 128. Applies only when a video's audio must be converted to AAC. Compatible AAC is copied; standalone audio downloads are unchanged. |

Playable source video is never re-encoded just because an advanced option changed. These settings do not improve detail missing from the recording. Two software encoder threads remain the bounded CPU default. Resolution and output-profile controls also have info buttons. **Restore default video settings** resets resolution, profile and all four advanced controls.

Defaults are saved natively in the existing Settings row. Catalog schema version 5 stores the validated choices on each download job. Preparing a download captures its video settings; subsequent global changes do not alter that draft or job, and retry preserves the job's original choices. Older settings/jobs receive the previous behavior as defaults. The UI, native host and worker constrain options to supported values; free-form FFmpeg arguments are not accepted.

Settings and configuration use modern switches; library post selection uses square checkboxes. Space toggles either focused control; Shift-click selects a contiguous post range, and existing batch-selection/deletion shortcuts continue to work. Their checked/disabled states and labels remain available to assistive technology. Focus changes appearance without a border overlay; reduced-motion and Windows high-contrast preferences remain supported.


## Shared controls and account organization (7 October 2026)

Application buttons share a 40 CSS-pixel height, an explicit border and separated content (info icons use border-free color/cursor cues); their width follows the label, while icon buttons are 40-pixel squares. Interface-size scaling enlarges the whole control together. Dropdowns retain native combobox keyboard and screen-reader behavior, with matching dark surfaces, a custom arrow inset 14 pixels from the right, and 42 pixels of right padding for the text. Fields wrap by available card width rather than forcing crowded side-by-side labels. Inline action buttons and helper text have separate margins.

Accounts places access/browser approval and privacy guidance above the browser controls and account cards. All seven cards share one spaced grid, including Pinterest and Discord. Status, explanation, actions and optional provider instructions remain separate reading groups. See [the visual audit](ui-testing.md#shared-control-and-spacing-audit-7-october-2026).


## Information pop-ups and stable header (7 October 2026)

Info icons keep their 40-pixel hit area with no visible border/background. Hover, keyboard focus and open state change icon color. Information opens in a labeled modal dialog in the browser's top layer, with its own scroll area, close icon and description. The underlying field/card positions stay fixed. Escape dismisses only the information dialog, including when opened from Add download; keyboard focus returns to the triggering icon.

Search reserves the clear-button slot at all times and uses a fixed 56-pixel field height; its input has a zero intrinsic minimum so long text scrolls within the field. Typing/clearing does not resize the search field or its input. Help uses a square icon-only Close help button with an accessible name. The Settings advanced action has 14 pixels of horizontal padding. Sidebar labels are Instagram and X (F.K.A. Twitter); source IDs, filtering and account identity are unchanged.

## Repository and release preparation (7 October 2026)

Downloaded media, catalogs and protected sessions are runtime data and excluded from Git; release collection includes build resources only. Packaged delivery must preserve user media and catalog state on upgrade/uninstall. See [source audit and packaged release process](repository-and-releases.md).
