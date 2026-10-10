# SavedDesk installer exit codes

Last reviewed: 10 October 2026. Applies to SavedDesk 0.2.10's Windows x64 NSIS `.exe` installer. Installation is per Windows user. This document describes the setup process's return value, not application, downloader, FFmpeg, or browser-connector exit codes.

## Partner Center configuration

Use these values for the current installer:

| Field | Value |
| --- | --- |
| Architecture | `x64` |
| App type | `EXE` |
| Installer parameters | `/S` (uppercase; case-sensitive) |
| Installer runs silently without switches | Leave unchecked; `/S` is required |
| Installer handling documentation URL | `https://github.com/asteroidcrib729/saved-desk/blob/main/INSTALLER_EXIT_CODES.md` |

The existing preview's direct download URL is:

```text
https://github.com/asteroidcrib729/saved-desk/releases/download/v0.2.10/SavedDesk_0.2.10_x64-setup.exe
```

This identifies the current preview, which is unsigned; it is not a recommendation to submit that binary for Store certification. For a future signed release, use its new versioned download URL and verify its exit-code behavior. Do not replace a binary behind a URL already submitted to Microsoft. See Microsoft's [package upload guidance](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/upload-app-packages).

## Return values

| Exit code | Meaning | Handling |
| --- | --- | --- |
| `0` | Setup completed successfully | Report installation success. A completed reinstall or upgrade also returns success. |
| `1` | The user cancelled setup | Report cancellation. The user can run setup again when ready. |
| `2` | Setup was aborted by the installer script | Report a general installation failure; the code alone does not identify its cause. |

These are the [NSIS default error levels](https://nsis.sourceforge.io/Docs/AppendixD.html#D.1). SavedDesk explicitly uses `SetErrorLevel 2` for failed WebView2 prerequisite handling. It does not define additional scenario-specific installer return values in its [installer hooks](packaging/installer-hooks.nsh).

### Exit code 0: success

Successful fresh installation, reinstall and upgrade use this value. An existing installation is not a distinct error condition: setup can maintain or update it. Success means setup finished; it does not certify a later download, account sign-in, external-tool configuration or media playback.

### Exit code 1: cancellation

This is NSIS's user-cancellation result, such as cancellation through the interactive setup interface. Silent installation uses `/S` and does not present that interface. Terminating the process externally, or Windows blocking it before it starts, is not guaranteed to produce this cancellation code.

### Exit code 2: failure

SavedDesk explicitly returns this code when the bundled WebView2 installer cannot start, returns an unacceptable result, or finishes without a detectable runtime. Installer-script aborts elsewhere can use the same code, including failure to stop an application that setup needs to replace. It is not a unique disk, network, reboot or security-policy indicator.

Check that SavedDesk is closed, the installation location and temporary directory are writable, and sufficient disk space is available. Follow any WebView2 restart instruction, then retry. If setup still fails, contact [Faraz Hussain](mailto:farazhussain5000@gmail.com) with the SavedDesk version, Windows version, returned code and displayed error. Do not include cookies, tokens or private account data.

## Standard installation scenarios in Partner Center

Configure only the mappings supported by the submitted EXE:

| Partner Center scenario | Value for this installer | Reason |
| --- | --- | --- |
| Installation cancelled by user | `1` | NSIS cancellation result. |
| Application already exists | Leave blank | Successful maintenance or upgrade returns `0`; there is no separate already-installed code. |
| Installation already in progress | Leave blank | No dedicated concurrent-installation result is implemented. |
| Disk space is full | Leave blank | No unique disk-full result is implemented. |
| Reboot required | Leave blank | The parent installer does not forward the prerequisite's `3010`. |
| Network failure | Leave blank | Setup bundles its runtime prerequisite; there is no dedicated network-failure code. |
| Package rejected during installation | Leave blank | No dedicated policy-rejection result is implemented. |
| Installation successful | `0` | Successful setup result. |

Under **Miscellaneous install failure scenarios**, add `2` and this documentation URL:

```text
https://github.com/asteroidcrib729/saved-desk/blob/main/INSTALLER_EXIT_CODES.md#exit-code-2-failure
```

Leave unsupported mappings unset wherever Partner Center permits. If it requires a value for an unsupported scenario, do not invent one: additional installer handling and a newly versioned, tested binary would be needed. Do not assign `2` to several unrelated specific failures, or assign `0` to both success and already-installed. MSI codes such as `1602` and `1618` are not SavedDesk's NSIS EXE codes.

## WebView2 child-process results

The [production hook](packaging/installer-hooks.nsh) checks an existing machine-wide or current-user WebView2 registration. If absent, it runs the bundled offline runtime installer with `/silent /install` and checks registration again.

| Prerequisite child result | SavedDesk parent behavior |
| --- | --- |
| `0` | Continue only if a nonzero runtime version is registered. |
| `3010` | Continue only if runtime registration is present; do not return `3010` from SavedDesk setup. |
| `-2147219416` (`0x80040828`, runtime already installed) | Continue only if runtime registration is present. |
| Any other child result, or failure to launch the child | Abort SavedDesk setup with `2`. |
| An accepted child result without runtime registration | Abort SavedDesk setup with `2`. |

Continuing prerequisite handling is not itself final installation success; the remaining installation must also complete. A registration of `0.0.0.0` is treated as missing. Prerequisite installation does not download WebView2 during setup. Network errors when the application later downloads content are outside this installer's return-code contract.

## Capture the installer result

From PowerShell, wait for the setup process before inspecting its exit code:

```powershell
$setupPath = (Resolve-Path -LiteralPath '.\SavedDesk_0.2.10_x64-setup.exe').Path
$setupProcess = Start-Process -FilePath $setupPath -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
$setupProcess.ExitCode
```

This example performs a real installation. Use it deliberately after verifying the binary's origin and checksum. These instructions do not establish uninstaller return-code handling: NSIS uninstallers can relaunch a temporary copy, so the launching process's result may not be the completed uninstall result. See the [NSIS uninstaller note](https://nsis.sourceforge.io/Docs/AppendixD.html#D.1).

## Verification and submission limits

The exact GitHub-built 0.2.10 installer previously passed host installation, upgrade and uninstall acceptance. Its evidence is described in [preview verification](development-plans/signpath-and-public-preview.md). The [runtime policy test](packaging/test-installer-runtime-policy.py) executes the actual hook against controlled registry reads and harmless child programs, covering success, failure, restart and already-installed prerequisite results. It does not modify the machine's runtime or prove installation on a clean Windows machine. Code `1` is documented from NSIS; an interactive cancellation of the published installer has not been established by that controlled test.

Microsoft's [EXE/MSI package requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/app-package-requirements) require trusted code signatures on the installer and its bundled Portable Executable files. The current unsigned GitHub preview does not meet that signing requirement. This exit-code document does not change its certification status. See the [code signing policy](CODE_SIGNING_POLICY.md).
