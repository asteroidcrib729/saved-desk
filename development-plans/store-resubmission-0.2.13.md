# SavedDesk 0.2.13 — Registry capability removal

Product ID: 9P60HCD8JXTX. This submission replaces the 0.2.12 capability-reconsideration approach.

## Change for policy 10.6.3

The package no longer declares `unvirtualizedResources`. It declares no registry or filesystem virtualization opt-out, ExcludedKey, or ExcludedDirectory. Both use normal MSIX virtualization. The only restricted capability requested is `runFullTrust`.

The app no longer registers a browser native-messaging host. It does not run a separate registrar to evade virtualization. Account approval uses the updated companion extension and an authenticated connection bound only to `127.0.0.1` on this PC.

## runFullTrust justification

SavedDesk is a Tauri packaged classic desktop application. It runs its included worker and FFmpeg/FFprobe as separate processes, downloads supported media selected by the user, manages the user's chosen media folder, and protects approved sessions using Windows DPAPI. These desktop process and filesystem operations require the existing medium-integrity desktop execution model. It does not require administrator elevation for normal use.

## Reviewer procedure

1. Install this new MSIX rather than the rejected 0.2.12 build.
2. Public-link downloads require no browser account connection. The included FFmpeg and FFprobe are detected automatically. Gallery-based routes show a consent-based tool setup step if needed.
3. For browser approval, open Accounts, select the browser, expand browser setup and acknowledge export/pairing consent. Click Prepare connector and open extension folder.
4. Load the new exported extension, replacing an older unpacked copy. Chrome/Edge-family browsers use Load unpacked with Developer mode. Firefox supports a temporary add-on; accessible regular Firefox profiles also retain the direct, selected-platform path.
5. Copy the private pairing code displayed by SavedDesk into the extension's password field and click Pair with SavedDesk. Allow local connection permission. Keep the desktop app open.
6. Check extension connection in Accounts. Start Connect for the chosen platform, return to the toolbar popup and approve only that platform's permission. Website sign-in alone does not grant app access.
7. Wait for the account result in SavedDesk. Instagram/X verify identity; YouTube browser approval supports account playlists. Facebook/TikTok/Pinterest remain limited to public links.
8. Remove browser connector in Accounts to revoke pairing. Downloaded media, library history and saved platform sessions are preserved. Exported extension files and the browser add-on can be removed separately.

No password, cookie file, or private test grant is supplied in this repository. Do not include pairing codes in screenshots, logs, or support messages.

## Upgrade and uninstall

Private AppData behavior is unchanged from 0.2.12. No new native-host keys or executable copies are created by setup. Existing platform sessions need not be deleted to use the new transport.

Registrations left by older versions are unused. A user can deliberately run the exported ownership-checking legacy cleanup script outside the packaged app; doing so is optional, never a prerequisite to pairing. Normal MSIX removal manages package-private storage; media saved to a selected folder and exported extension files can remain.

## Evidence boundaries

The package inventory and archive verification must match 0.2.13.0. See the accompanying verification record for executed tests and hashes. Local tests and the absence of the denied capability do not constitute Microsoft certification or proof of untested Windows/GPU combinations.
