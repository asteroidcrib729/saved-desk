# Discord media downloads

**Documentation reviewed: 9 October 2026; current app: 0.2.10.** Use a fresh full cdn.discordapp.com attachment URL, including its signed query. No Discord identity, bot, server administration or browser connector is required.

Start with the [complete installation and user guide](../README.md). See [current verification](scope-and-lifecycle-0.2.10.md) and [documentation/cleanup record](documentation-and-cleanup-0.2.10.md) for current evidence and retained historical boundaries.

**Current architecture - 0.2.10:** gallery-dl and FFmpeg are external user-installed tools, excluded from the new installer. See [licensing and setup](licensing-and-external-tools.md). Older bundled-tool, no-Python and unresolved-source statements below describe their recorded earlier builds; they do not apply to the new payload or clear old installers.

Updated 7 October 2026. Download a selected attachment using its full media URL. No SavedDesk account connection, bot installation or server-admin permission is needed. Reddit support has been removed from SavedDesk.

## Discord: download selected media

1. In Discord, open an image, video or audio attachment you can already view. Use its **Copy Link** action or open the attachment in a browser and copy the full address. Do not use **Copy Message Link**.
2. Check that the address starts with `https://cdn.discordapp.com/attachments/`. Keep the complete query string, including `ex`, `is` and `hm` if present.
3. Open **SavedDesk -> Accounts -> Download Discord media**, or **Add download -> Discord**. Paste the media link and optionally name the download.
4. Choose **Start download**. Existing attachments trigger duplicate confirmation. Watch live progress in Downloads, then open the item in Library. The Audio filter shows downloaded audio; downloaded videos are finalized as compatible MP4.
5. If Discord reports an expired/unavailable link, return to the attachment, obtain a fresh media link and add it again. SavedDesk recognizes the attachment despite the new signature. Previously completed files remain intact.

Signed URLs provide access to the selected file and have preset expiry. SavedDesk protects pending signed URLs for the Windows user and removes their query parameters from catalog/display URLs. See [Discord's signed attachment reference](https://docs.discord.com/developers/reference#signed-attachment-cdn-urls). [Supported formats and validation](platform-support.md#discord-attachment-workflow) define the direct-media scope. No server setup is needed for this workflow.

## Repository and release preparation (7 October 2026)

Signed attachment links and user media stay out of source/release assets. The release workflow packages the adapter and tools, not personal downloads or sessions. See [source audit and packaged release process](repository-and-releases.md).
