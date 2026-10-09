# Watch Later validation fix - 0.2.9

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** This preserves the historical validation repair included in 0.2.10. The README explains WL/LL inputs and YouTube browser approval separately from optional Google identity.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

## Report and cause

The owner reported an Add download error for a two-video Watch Later playlist at https://www.youtube.com/playlist?list=WL. Both native Rust and Python worker validators required playlist IDs to contain at least ten characters. The two-character WL identifier was rejected before the download engine or YouTube was contacted. This failure was local validation, not a video-count limit or evidence of an expired account session.

## Implemented behavior

- Explicit short-ID exceptions for WL (Watch Later) and LL (Liked videos), with identical native/worker canonicalization and shared contract vectors.
- A personal playlist requires a scoped approved YouTube browser session. Without one, native preparation and the worker return an actionable approval message before queuing or accessing the destination/network.
- Approved sessions retain their existing cookie-set binding. A different session cannot silently resume another account's job. Google OAuth identity tokens are not supplied to the media engine.
- Ordinary finite playlists keep their existing route. A video link containing a playlist parameter still saves only that video. Unknown short IDs, duplicate list parameters, lookalike hosts and radio/Mix identifiers remain rejected.
- Personal-playlist engine failures use a fixed safe message directing the owner to renew browser approval; successfully saved files are retained.
- Existing MP4 handling, duplicate decisions, selected-folder restrictions, public downloading, Instagram/X and external-tool licensing architecture are unchanged.

## Owner retry

1. Close the old app and open the updated 0.2.9 build.
2. In Add download, choose YouTube and paste https://www.youtube.com/playlist?list=WL.
3. Start the download using the existing browser approval. Reconnect YouTube under Accounts > Browser connections and legacy approvals only if the app reports a missing/expired approval.
4. Verify two saved or already-available items and playback. A Google identity reconnect or broader OAuth scopes are not required for this validation fix.

The selected browser profile must be able to open the playlist. A private listing containing public videos is separate from private video authorization. Neither this fix nor synthetic testing proves every account/content combination. On 9 October 2026, the owner reported that the two-video Watch Later playlist download succeeded. This is owner-reported live download acceptance for this case. No additional live transfer, playback, inaccessible-account control, Liked videos acceptance or OAuth media capability is claimed.

## Verification

Completed checks:
- 155 backend tests passed, including packaged worker, MP4 compatibility, session isolation, storage and playlist host decisions.
- 90 native deterministic tests passed (82 app/library and 8 connector-host); the existing optional live HTTPS test was not rerun.
- Six focused Playwright checks passed for account approval, Google identity isolation, advanced download settings and the Watch Later form.
- Four checks passed through the actual rebuilt Windows app in a fresh test profile: missing-session WL/LL guidance, unknown short-ID rejection, ordinary public playlist preparation, and WL/LL preparation with a synthetic DPAPI-protected browser approval. No real YouTube requests or owner sessions were used.
- Frontend production export, worker packaging/exclusion audit and debug resource staging passed.
- Source audit passed with 29 ignore checks and no findings.

Debug executable SHA-256: bbd6bdab7280eacf9583dfaf232ee94ec0e276ad0aecbee76e7f4fe8aae69dc5.

Debug/release targets and the 0.2.9 NSIS installer have been rebuilt. Final staged worker exclusion/source verification passed. The license inventory contains 409 components and 718 notice files with no missing notices; all 289 required source archives are present with no download failures. Final source audit passes with 29 ignore checks and no findings. These tests do not establish live playlist transfer or a fresh installation/upgrade result. Existing installation coverage remains historical; signing remains deferred.

## Upstream reference

The [yt-dlp supported-site list](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md) lists YouTube Watch Later support as requiring cookies. See its [cookie guidance](https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp). This uses the existing browser-approved engine route, not YouTube Data API discovery or a completed OAuth media adapter.


## Final artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| desktop/src-tauri/target/debug/saveddesk.exe | 18949632 | bbd6bdab7280eacf9583dfaf232ee94ec0e276ad0aecbee76e7f4fe8aae69dc5 |
| desktop/src-tauri/target/release/saveddesk.exe | 14442496 | 2d534e122b1dcf990cfa5c2c4058d931b0605584a095ba89ade34d037e1f88fd |
| desktop/src-tauri/target/release/bundle/nsis/SavedDesk_0.2.9_x64-setup.exe | 262830004 | a3235ce57f025cff962ceea49d91fc5c541cad06709c9079c7aaa718673e4cf1 |
