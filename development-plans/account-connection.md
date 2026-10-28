# Current account connection — 0.2.13

The current procedure is in the [README](../README.md#chromium-family-browsers). [Plan 09](development-plan-09.md) supersedes native-messaging registration and the 0.2.12 capability reconsideration approach.

Instagram and X approve a selected platform session and verify identity. YouTube browser approval enables supported account playlists; Google identity alone does not grant private-media access. Facebook, TikTok and Pinterest remain public-link-only. Discord accepts attachment links without an account.

Chromium-family browsers use the updated extension, explicit pairing and authenticated loopback. Regular Firefox profiles retain direct selected-platform approval; custom profiles can use the temporary extension. Cookie access requires explicit permission for the selected platform. Passwords, history and unrelated sessions are not requested.

Pairing secrets remain in DPAPI app storage and local extension storage. Cookies remain in app DPAPI session files and private worker input. They never go into extension storage, React state, SQL metadata, arguments or plaintext cookie exports. Transport checks include literal Host, method, supplied origin, signed message, timed one-use challenge, browser/version and bounded payloads. The extension authenticates the app response before trusting a platform request. Existing source-bound authorization nonces remain single-use.

Removing pairing stops the listener and invalidates its configuration. Sessions and downloads stay intact; use a platform's Disconnect to remove its app session. New setup writes no native-host registrations. Optional user-run legacy cleanup is separate and never used by the Store app to evade virtualization.

Browser-store extension publication remains separate work. The preview uses unpacked Chromium-family extensions or a temporary Firefox add-on. Managed policies may block them. Firefox containers and partitioned sessions remain unsupported; other browser forks are unverified.

Controlled tests use isolated profiles and synthetic providers. They do not replace manual checks of changing provider behavior or grant permission to access content.
