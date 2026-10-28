# SavedDesk 0.2.12 — Capability reconsideration and reviewer procedure

> Historical record: registry exceptions and reconsideration are superseded by [plan 09](development-plan-09.md) and the [0.2.13 reviewer procedure](store-resubmission-0.2.13.md). Do not use this older manifest or justification for the new submission.


Product ID: **9P60HCD8JXTX**. Responds to the **21 October 2026** report, **10.6.3 Capabilities**. The previous capability request was denied. This document describes implementation changes and identifies evidence still required; it does not claim a new approval.

## Section 01 — Expanded business justification

SavedDesk is a full-trust desktop media library. Its optional, user-approved browser connector uses standard native messaging so an unpackaged browser can communicate with the running application. Public supported-link downloads do not require connector setup. The app does not silently install a browser extension or obtain its permissions.

**Windows Flexible Virtualization was evaluated.** The manifest declares only these HKCU exclusions on Windows builds that recognize the fine-grained schema:

```text
HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.saveddesk.connector
HKEY_CURRENT_USER\Software\Microsoft\Edge\NativeMessagingHosts\com.saveddesk.connector
HKEY_CURRENT_USER\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.saveddesk.connector
HKEY_CURRENT_USER\Software\Vivaldi\NativeMessagingHosts\com.saveddesk.connector
HKEY_CURRENT_USER\Software\Chromium\NativeMessagingHosts\com.saveddesk.connector
HKEY_CURRENT_USER\Software\Mozilla\NativeMessagingHosts\com.saveddesk.connector
```

Only the selected browser's key is created during setup. Its default REG_SZ value points to the corresponding `connector-<browser>.json` manifest. SavedDesk does not request HKLM registration, administrator access or broad browser registry keys. Its registration function selects from a fixed browser allowlist; the renderer cannot supply an arbitrary registry location.

**Windows 10 and Windows 11 remain supported.** A registry-only compatibility fallback is retained for older supported Windows builds that do not recognize the fine-grained schema. That fallback is broad at the OS-manifest level; SavedDesk's registration code intentionally writes only the six fixed owned locations above and creates only the selected key. We request reconsideration for that registry-only compatibility need. Microsoft's [platform matrix](https://learn.microsoft.com/en-us/windows/msix/supported-platforms) and [Flexible Virtualization guide](https://learn.microsoft.com/en-us/windows/msix/desktop/flexible-virtualization) give inconsistent version availability, so effective key-level isolation must be verified on each supported build. The existing Windows 10 build 19045 lifecycle result confirms connector functionality and cleanup; it does not by itself establish fine-grained registry enforcement.

**No AppData filesystem opt-out is requested anymore.** The app retains default AppData write virtualization. Browser-visible connector artifacts are exported, with explicit user consent, to the user's Documents/SavedDesk Browser Connector folder, which does not require that opt-out. The browser-launched relay no longer opens the private catalog or writes DPAPI receipts. The app answers bounded, same-user IPC status requests and retains private state inside its own view.

## Section 02 — Resources and uninstall behavior

| Resource | Purpose | Normal uninstall and deliberate cleanup |
|---|---|---|
| Selected owned HKCU native-messaging key | Browser discovery of the host manifest | May remain after uninstall; the owned cleanup tool removes a matching registration |
| `connector-<browser>.json` | Native host name, path and permitted extension origin | Shared folder survives; owned manifest is removed by cleanup |
| `connector-bin/<sha256>/saveddesk-native-host.exe` | Browser-executable relay outside WindowsApps | Shared folder survives; cleanup removes binaries matching their content-hash directory and preserves changed copies |
| `browser-extensions/<browser>/<sha256>/` | Explicitly loaded four-file extension export | Shared folder survives; cleanup verifies the export digest and removes owned files; the browser's loaded extension must be removed separately |
| `Remove-SavedDesk-Connector.ps1` | Post-uninstall cleanup tool | Exported before uninstall; remains available afterward; `-Remove` performs owned cleanup |
| Private package data | Catalog, settings, account files and handshake receipts | Default Windows package rules apply; legacy/shared EXE data may remain and is not erased by connector cleanup |
| Selected downloads and backups | User content | Remain intentionally; users remove these separately if desired |

The cleanup tool defaults to reporting only. `-Remove` is explicit. It checks the exact Documents or legacy profile root, rejects reparse-point paths, checks native-host registration ownership and verifies hashed binaries/extension exports. It does not recursively delete the profile or shared root. Unknown/changed files and registrations belonging to another installation are preserved. The legacy EXE uninstaller's exact-installation registration cleanup remains supported.

## Section 03 — User information and removal

Accounts > Set up or repair the browser connection displays the retention disclosure before setup and requires acknowledgement. The shared folder is shown. Accounts > Browser connector storage and removal explains what persists, provides deliberate connector removal and opens the folder. README and privacy policy describe the separate treatment of connector artifacts, package-private state, legacy app data and downloaded media.

Before uninstalling, use **Remove browser connector** and remove the SavedDesk extension in the browser. After uninstalling, open **Documents/SavedDesk Browser Connector**, open PowerShell there, and run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Remove-SavedDesk-Connector.ps1 -Remove
```

Review changed or unrelated files the tool preserves. Downloaded media, account files, legacy app data and backups are outside this connector-only removal. Do not delete a legacy profile still used by an installed EXE edition.

## Section 04 — Reviewer reproduction and evidence requirements

1. Install the exact submitted Store-identity MSIX and record its SHA-256, version and Windows build. Use a disposable clean Windows user/VM, not the owner's library or browser profile.
2. Check download tools and complete a public-link download without account sign-in. Included FFmpeg/FFprobe readiness remains required.
3. Open Accounts, read the retention notice, acknowledge connector setup and prepare one selected browser. Confirm that the known shared folder and only the selected owned registration appear.
4. Load the exported extension as disclosed. Run its connection probe and check readiness in SavedDesk. Test account approval/cancellation with disposable authorized fixtures or accounts; never place credentials in public notes.
5. Inspect the installed manifest. Confirm default AppData filesystem virtualization, the six fixed registry exclusions and the registry-only compatibility fallback. Record which declaration the tested OS actually honors; do not infer key-level isolation solely from successful connector discovery.
6. Uninstall normally through Windows **before** running any cleanup. Record the exact surviving registrations/files and media hashes; do not imply that manual cleanup ran automatically.
7. With the application removed, run the exported cleanup helper. Confirm owned registrations and unchanged connector artifacts are removed, unrelated/changed files are preserved and media hashes are unchanged.
8. Repeat on Windows 10 and Windows 11. Attach hash-bound machine evidence, precise remnants and the source/automated-check record to the new justification. Capability approval remains a Microsoft decision.

The normal-uninstall sequence is implemented in `packaging/test-msix-host.ps1`. The package readiness gate rejects missing OS evidence or evidence for another package. Do not mark missing Windows 11 or clean-user results passed based on tests on a Windows 10 development machine.

Create separately identified local test packages with `packaging/create-msix-test-packages.ps1 -ReviewDirectory <preview-review> -StoreReviewDirectory <store-review>`. This verifies equal payloads and equal manifest behavior apart from the test identity, and records the source Store package hash. Never sign the actual Store identity with a preview certificate.

In an explicitly prepared disposable Windows client VM, set `SAVEDDESK_FRESH_GUEST=1` and run `packaging/test-msix-with-temporary-trust.ps1 -ReviewDirectory <preview-review> -Run -FreshGuest` after approving its temporary preview-certificate trust and Windows UAC. The wrapper restores its app-specific debugging setting and removes the temporary machine trust when testing finishes. The test verifies the VM/client OS preconditions and records the OS build. After both OS runs, evaluate:

```powershell
.\.venv\Scripts\python.exe packaging/store-readiness.py <store-review> --evidence <windows10-report.json> --evidence <windows11-report.json>
```

The gate verifies the actual MSIX archive and requires successful install, connector, upgrade, ordinary uninstall, post-uninstall helper and owner-data-restoration checks. It refuses server OSs, development-host-only results, a mismatched package hash/version and missing operating-system coverage. Even a passing gate does not claim that Microsoft approved the capability.
