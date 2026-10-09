# SavedDesk Privacy Policy

**Last updated:** 9 October 2026  
**Maintainer:** Faraz Hussain  
**Privacy and support email:** [farazhussain5000@gmail.com](mailto:farazhussain5000@gmail.com)

## 1. Scope

This policy explains how the official SavedDesk Windows desktop application and SavedDesk Browser Connector handle information. "We" means the maintainers of the official SavedDesk project. Independent forks, third-party websites, operating-system components and separately installed tools may have different practices.

SavedDesk lets you download supported content you are authorized to access, organize it in a local library, and view or play saved media. You can use local browsing and public-link features without Google sign-in. Account connections are optional and are needed only for routes that require them.

## 2. Information handled on your computer

Depending on the features you use, SavedDesk processes:

- Download links, collection titles, account or creator names, captions, platform identifiers and content metadata.
- Downloaded images, videos, audio, text and generated thumbnails or playback files.
- Download history, queue state, progress, errors, file locations and availability.
- Your selected save folder, application preferences, video settings and playback preferences.
- Browser/profile information you select, platform-scoped session cookies you explicitly approve, and account identifiers returned during connection checks.
- Google identity information and credentials described below.

These records can identify you or other people and may describe private content. They are not automatically uploaded to the SavedDesk maintainers. SavedDesk does not collect your platform password through its own interface; sign-in takes place in the platform's browser page.

### Current platform scope and user controls

Instagram and X use verified account connections. Supported YouTube account playlists use separate browser approval; optional Google identity does not authorize private-media downloading. Facebook, TikTok and Pinterest support publicly available share links only. Discord downloads only the supplied media attachment without SavedDesk account authentication. This scope introduces no new provider service or private-platform processing.

The [README user guide](README.md) explains installation, external-tool setup, connector permissions, account connection/disconnection, downloads, local storage, deletion, backup and all Settings controls, including Low-resource mode.

## 3. Google sign-in and Google user data

The current Google Desktop sign-in flow requests only **openid** and **profile** permissions. It receives a basic profile response and uses the verified Google account identifier and display name to identify the account shown in SavedDesk.

SavedDesk stores the account's issuer, account identifier and display name, granted permissions, token expiry, access token and refresh token when provided. It also retains the configured Desktop OAuth client ID and any installed-client credential supplied with that registration. A derived account key is used to distinguish the identity in the interface.

This data is used only to show and verify your connected identity, maintain that connection, refresh its credentials and carry out a requested disconnect or revocation. This Google flow does not request Gmail, Drive, Contacts, email-address or YouTube media API permissions. Google identity credentials are not passed to download workers or substituted for browser session cookies.

**Google identity sign-in does not itself enable private-media downloading.** YouTube downloads, including supported Watch Later requests, currently use the separate public-link or explicitly approved YouTube browser-session route. SavedDesk does not use YouTube Data API playlist discovery in this version.

SavedDesk follows the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including its Limited Use requirements, when handling information received from Google APIs. We do not sell that information, use it for advertising, credit decisions or surveillance, or use it to train general-purpose AI models. We do not provide maintainers with routine access to your Google data; any information you voluntarily provide for support is used for that support purpose.

## 4. Browser-session approval and the connector

When you request a supported platform connection, the connector asks for access to that platform and reads its cookies from the selected browser profile. It transfers the approved session to the local SavedDesk native host on your computer. Regular Firefox profiles may instead use the application's direct, platform-scoped session reader.

The connection is initiated by you. SavedDesk does not import unrelated websites' cookies or your browsing history as part of this approval. The connector may provide browser user-agent information needed for platform requests. Approval of cookies is separate from verified Google identity and does not guarantee access to a particular resource.

Approved credentials may be used in account checks and download requests to the relevant platform. Download workers and separately installed extraction tools receive the scoped session information required for the requested route. Treat browser approvals as sensitive account access; disconnect them when no longer needed.

## 5. Network requests and sharing

SavedDesk connects to Google for requested authorization, identity checks, token refresh and revocation. It connects to the platform or media hosts involved in a requested account check or download, including content delivery networks. Those services receive information needed for the request, which can include your IP address, user-agent information, content URL and applicable authentication credentials. Their own policies govern their handling of requests.

The native Google sign-in callback listens temporarily on your computer's loopback interface. It is not a SavedDesk cloud service.

The current application has no maintainer-operated cloud account database, cloud library synchronization, advertising tracking or analytics service, and it does not automatically transmit your library or crash reports to the maintainers. We do not sell your personal information. Microsoft Windows/WebView2, your browser and external tools have their own services, settings and privacy practices.

If you choose to send a support message or issue report, we receive what you include. Public GitHub issues and comments are visible to others. Do not post credentials, OAuth registration files, private links, downloaded private content, browser profiles or unredacted logs. Information voluntarily supplied for support may be retained while needed to address the request, meet applicable obligations or preserve an issue record. Public issue history is also subject to the hosting platform's retention practices.

## 6. Storage and security

Downloaded content is saved in your selected folder. SavedDesk's local catalog, configuration and account files are normally stored under **%LOCALAPPDATA%\com.saveddesk.desktop**.

Saved browser sessions and Google credential envelopes use Windows current-user Data Protection API (DPAPI) protection. Google sign-in requests use HTTPS and the system browser. Download routes depend on the security capabilities of the relevant platform and extraction tool.

**The SQLite library catalog, downloaded media and thumbnails are not encrypted by SavedDesk.** Catalog encryption and portable encrypted recovery are planned features, not protections available in the current release. DPAPI does not protect against every threat, including software acting as your signed-in Windows user. We cannot guarantee absolute security.

Restrict access to your Windows account, protect your device and backups, and consider whether your selected folder is shared or synchronized by another application. SavedDesk does not manage copies made by backup, cloud-sync or other software.

## 7. Retention and deletion

Local library records and files remain until you remove them. There is no automatic age-based expiry for downloaded content or history.

- Use the application's reviewed post, file, download or collection deletion actions to remove the corresponding records and eligible files. Deletion is permanent and is limited to the selected save folder. Files outside it, unrelated files or copies belonging to another retained download may remain.
- Disconnect a platform in Accounts to remove SavedDesk's stored approval for that platform. This does not erase downloads, history, retained connection identifiers or account names, your browser's original cookies, or the platform account.
- **Disconnect Google identity** removes the local Google grant while retaining the Desktop client setup, downloaded files and independent browser approvals.
- **Revoke Google access** additionally requests revocation at Google. If remote revocation cannot be confirmed, review or remove the application's access through [Google Account connections](https://myaccount.google.com/connections). Local disconnect and remote revocation are different actions.
- **Reset Google identity setup** removes its local OAuth configuration. It does not revoke a remote grant or remove browser approvals.
- Uninstalling SavedDesk does not automatically erase your library, selected download folder or retained application data.

For a complete local removal, first disconnect the accounts you no longer want SavedDesk to use, revoke Google access if desired, and close the app. You can then remove SavedDesk's application-data directory and the downloaded files you intend to delete. Keep any files you want to retain, and handle backups separately. Deleting local files does not delete original content from a platform or wipe copies held by other software.

## 8. Your choices and requests

You choose whether to sign in, approve a browser session, supply a link or retain a download. You can change the save location, disconnect accounts, delete supported library records and review Google access using the controls above.

For questions or requests concerning information you have supplied directly to the maintainers, contact the privacy/support email above. Depending on applicable law, you may have rights to access, correct, delete or restrict that information. Please identify the request without supplying credentials. We cannot retrieve or remotely erase a library that exists only on your computer.

## 9. Children

SavedDesk is a general-purpose utility and is not directed at children under 13. Do not use Google sign-in if you are under the minimum age required for the relevant Google account or local law. If you believe a child has supplied personal information directly to the maintainers, contact us so the report can be addressed.

## 10. Third-party hosting and changes

The project repository and published policy pages may be hosted by GitHub or another provider. Visiting those pages is separate from using the desktop app and is subject to the hosting provider's privacy practices.

We will update this policy when application behavior changes and revise the date above. New uses of Google user data or additional permissions will be disclosed before being introduced, with renewed consent where required. Planned provider integrations and hosting services are not enabled merely by being mentioned in development plans.

For application usage and licensing information, see the [Terms of Service](TERMS_OF_SERVICE.md) and [project README](README.md).
