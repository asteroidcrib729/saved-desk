# Accessibility and usability review

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** The guide covers keyboard navigation, interface scaling, custom scrollbars, settings switches, selection checkboxes and persistent sidebar collapse. No new UI test is claimed by this documentation pass.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

**Current architecture - 0.2.10:** gallery-dl and FFmpeg are external user-installed tools, excluded from the new installer. See [licensing and setup](licensing-and-external-tools.md). Older bundled-tool, no-Python and unresolved-source statements below describe their recorded earlier builds; they do not apply to the new payload or clear old installers.

Reviewed on **6 October 2026** against the current desktop implementation. This review follows user tasks: find a post, inspect all its media, recover moved files, control playback, read comfortably, and navigate without a mouse.

## Current focus and navigation update (7 October 2026)

Shared focus outlines and shadow rings are removed from all app inputs and interactive surfaces. Border widths/colours remain unchanged on focus; keyboard focus uses background changes and high-contrast text cues. Primary buttons retain readable contrast while focused. Automated input-state checks cover the seven download forms, browser/profile selectors, settings, search/selection checkboxes/configuration switches, player sliders/speed and dialogs. The sidebar exposes seven ordered platform views, and native persistent volume/mute remove repeated playback adjustment. See [current verification](implementation-progress.md#reddit-removal-platform-sections-and-persistent-volume-7-october-2026).

## Current control and sidebar update (7 October 2026)

All application buttons now have visible borders and share a 40 CSS-pixel height, with label-sized widths or square icons. Content selection uses checkboxes; persistent settings use switches. Native combobox semantics remain intact with better arrow/text insets. The sidebar changes only through the SavedDesk icon and saves its state natively; hover and focus leave it unchanged, including compact layouts. Low-resource controls remain in Settings. This supersedes the earlier temporary expansion and sidebar-status behavior recorded below.

Accounts moves approval/privacy guidance above the cards and puts Discord in the same spaced grid as Pinterest and the other platforms. Shared helper margins, inline action spacing and card-width responsive fields address cramped text. Full visual checks cover all screens and major dialogs at 1366/760/380 pixels, alongside the existing keyboard and automated accessibility checks. [Current evidence and limits](implementation-progress.md#shared-controls-account-layout-and-persistent-sidebar-7-october-2026).

## Findings and delivered changes

| User difficulty | Cause | Delivered behavior |
| --- | --- | --- |
| The background behind the viewer flickers during fullscreen changes | Modal and slot dimensions follow intermediate native viewport sizes; backdrop returns abruptly | Hold modal/slot geometry through the switch and settling, fade the existing backdrop, preserve playback/focus, and clean up rejected requests |
| Playback uses the wrong mouse button | The previous request specified right-click | Left-click toggles across the video/player background once; child controls retain their own actions; right-click does not toggle |
| Fullscreen changes jump and disturb the underlying modal | Multiple native viewport sizes, immediate layout changes and unreserved viewer space | Short resize-aware uniform media transform, reserved viewer space, non-scrolling focus restoration, preserved playback and reduced-motion support |
| Fullscreen controls occupy a bottom toolbar instead of familiar screen edges | Post controls were arranged as a toolbar | Standard-size left/right edge arrows; image exit at top-right; video exit only in its seeking/control bar; no wrapping at post boundaries |
| Fullscreen filename tags cover content; playback controls shrink the video and stay visible | Label overlay and stacked controls occupy the frame | No visible filename tag; video fills the frame with a translucent single-row overlay; three-second playing/paused idle hiding; mouse movement or keyboard navigation reveals controls; focused keyboard controls, sliders in use and the speed menu remain available |
| Mouse playback is hard to discover; Space leaves a border across the video | Missing surface action and the global focus outline | Left-click plays/pauses the video and player background; Space does not leave a video border or toggle repeatedly when held; Tab and player controls retain focus cues |
| Native video fullscreen hides post navigation | Chromium fullscreen isolates the video; WebView2 denies a subsequent frame request without user activation | Lightweight accessible controls target the persistent post frame directly; decoding stays with HTML video/WebView2 |
| Restored item focus and search leave large border overlays | Row-wide focus-within outline and global input focus ring | Whole-row outline and inner search ring removed; arrow/control keyboard cues and subtle field focus remain |
| Rounded scroll areas use sluggish-looking OS scrollbars | Browser scrollbar painting at rounded overflow boundaries | App-owned rails/thumbs, native wheel/touch scrolling, track dragging and labeled keyboard controls; frame-batched geometry |
| Header buttons spread apart and helper text touches borders | space-between header and unpadded direct panel children | Grouped actions with an 8-pixel gap and consistent helper/filter padding |
| Sidebar hover shifts icons and reveals a bottom scrollbar | Position/display/padding changes and horizontal rail inference during resizing | Fixed internal geometry, centered brand button, fading labels and explicit vertical-only sidebar rails; icon clicks alone change the persistent state |
| Ordinary H.264 opening still makes a second native call | Video source preparation runs after file listing and repeats metadata work | Initial playback decision travels with the file list; bounded fingerprint/expiry cache and deduplicated validation retain current-root safeguards |
| Settings/Accounts text is cramped and actions consume unnecessary rows | Inconsistent help widths, unlabeled layout groups and scattered action margins | Consistent card padding, paragraph rhythm, responsive field/action rows, organized browser setup and account privacy guidance |
| Sidebar includes duplicate collection navigation and a redundant toggle | Collections derive from jobs; a separate button precedes the brand | Brand bookmark pins/collapses; Collections and Downloads count removed; compact widths preserve content space |
| Every uncached video waits for the packaged worker | Automatic FFmpeg probing, process startup and shared worker gate | Bounded native AVC metadata check opens ordinary H.264 MP4s directly, even during download activity; copy preparation remains separate and cached |
| Bottom status bar consumes space; fixed sidebar cannot adapt | Permanent footer and width | Footer removed; low-resource status in sidebar; persisted pin/collapse with temporary hover/focus expansion and reduced-motion support |
| One valid downloaded video stays blank in the app | Particular VP9 MP4 decoder path renders no frames | Local original-preserving H.264/AAC copy, automatic inspection and manual compatibility action; root-scoped streaming and cached reuse |
| Keyboard browsing stops at the mounted window | Only 18 rows exist in the DOM | Arrow/Home/End/Page navigation and Tab window transitions reach all posts on the bounded page; position/count metadata and contextual descriptions retain the 18-row cap |
| Small arrow is the only obvious post-opening target | Narrow action button | A semantic button with a stretched hit area opens the whole row; visible row focus and creator/caption/platform description |
| Empty filtered results have no direct recovery action | Users must manually erase input and change filters | Clear search and Clear search and filters restore results and focus search |
| Switching screens leaves reading focus on the old navigation control | Screen state changes without heading focus | Focus follows explicit navigation to the new heading; Ctrl+F retains search focus |
| Users must infer how to recover missing files or unsupported videos | Plain instructions without a route to the relevant settings | Missing files/errors offer Open save location settings; busy folder actions explain their availability; no automatic relocation/deletion |
| Existing fixed-size UI is hard to read | No app size preference | Saved 100-200% interface zoom, Settings selector and Ctrl+Plus/Minus/0; compact navigation can scroll when enlarged |
| Video controls lack consistent labeling and navigation context in fullscreen | Platform-controlled media UI | Labeled play/pause, mute, keyboard seek/volume sliders, 10-second skips, playback speed and fullscreen button in the player bar |
| Useful controls and recovery paths are hard to discover | Help is scattered | Top-bar Help & shortcuts modal describes library/media keys, account connection, moved files and compatible-video fallback |

The video player never autoplays a new file. Changing files/closing the viewer stops old playback. Media remains ID-scoped to the user-selected save folder; this UI change does not grant frontend filesystem access or read provider accounts. The only added native capability is zooming the local main webview. The stored zoom preference contains no library or account data.

## Verification and limits

The interaction suite checks screen-edge geometry, mouse exit, boundary disabling, image/file keyboard controls, whole-row hit testing, virtualized keyboard reachability, focus return, filter recovery, help/modal isolation, saved zoom preference and missing-file settings navigation. Accessibility scans use axe against six screens plus media/help dialogs at 1366, 760, 640 and 380 CSS pixels, with WCAG A/AA tags through 2.2 and no disabled rules. Detailed results include incomplete/manual-review items rather than treating them as passes.

The isolated Windows acceptance fixture verifies actual JPG/MP4 decoding, seeking, play/pause, volume, playback speed, the in-player fullscreen button, mixed-file edge navigation, exit/focus, actual 200% WebView2 zoom and saved zoom restoration. It also retains existing thumbnail, range, folder-relocation and selected-root boundaries. Final counts/artifact evidence are recorded in [UI testing](ui-testing.md) and [implementation progress](implementation-progress.md).

Automated scans do not establish WCAG conformance. Future accessibility review includes NVDA/Narrator walkthroughs, actual low-vision/motor-impairment usability sessions, a complete 125-200% and mixed-DPI/monitor matrix, manual contrast/focus/media-description checks, captions/transcript availability for supported media, accessible detailed per-item recovery, and performance testing if hardware scope is expanded later. Encrypted catalog migration, backup/recovery, bulk organization and richer download reporting remain separate Plan 02 requirements.

## Reference basis

- [WAI keyboard interface guidance](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) explains component keyboard movement and focus restoration.
- [WAI resize text](https://www.w3.org/WAI/WCAG21/Understanding/resize-text) and [reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow) define scaling/reflow expectations; limited fixture sizes are evidence, not full conformance.
- [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing) explains axe integration and the need for manual checks.
- [Tauri webview source](https://github.com/tauri-apps/tauri/blob/dev/packages/api/src/webview.ts) documents setZoom and its explicit native permission.

## Advanced video controls and modern switches (7 October 2026)

Conversion controls use explicitly associated labels and named **About** buttons. Activating a border-free info icon opens a separately labeled information dialog. The trigger exposes `aria-haspopup="dialog"` and expanded state; the popup has a named heading and description. Focus moves to its close icon and returns on dismissal. Escape closes only the top information dialog, preserving an underlying download dialog. Explanations wrap in a responsive scrollable popup without shifting the form. They distinguish software-only quality/speed, automatic hardware fallback, source-stream copying and converted-video audio bitrate.

Configuration uses capsule/thumb switches exposing `role="switch"`; content selection uses square checkboxes. Native input behavior preserves Space, disabled/checked states, accessible labels, library Shift-click ranges and batch keyboard shortcuts. The library stays virtualized and selection remains page-scoped. Focus uses brightness/background cues without reintroducing outlines or shadow rings. High-contrast switches use system colors and a visible thumb position; reduced-motion mode removes switch animations.

Information pop-ups are included in automated narrow/wide layout, focus-restoration and accessibility checks; native acceptance verifies keyboard switching and durable settings with an isolated catalog. Broader manual screen-reader and device acceptance remains in the existing release matrix.

Expanded-settings auditing also identified the page rail outside a named landmark. App-owned page/sidebar rails are now grouped as named scroll navigation controls, preserving drag and keyboard behavior without visual changes.

## Repository and release preparation (7 October 2026)

Add download now starts directly with its descriptive heading; the decorative top download icon is removed. Existing labels, keyboard controls and dialog information remain. See [source audit and packaged release process](repository-and-releases.md).
