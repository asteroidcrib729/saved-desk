param([string]$Installer,[string]$PreviousInstaller,[string]$EvidenceDirectory,[switch]$FreshGuest,[switch]$Check)
$ErrorActionPreference = 'Stop'
$computer = Get-CimInstance Win32_ComputerSystem
$isGuest = $env:USERNAME -eq 'WDAGUtilityAccount' -or $computer.Model -match 'Virtual Machine|VMware|VirtualBox|KVM|QEMU|Parallels'
$data = Join-Path $env:LOCALAPPDATA 'com.saveddesk.desktop'
$keys = @('Google\Chrome','Microsoft\Edge','BraveSoftware\Brave-Browser','Vivaldi','Chromium','Mozilla') | ForEach-Object { "HKCU:\Software\$_\NativeMessagingHosts\com.saveddesk.connector" }
$priorKeys = @($keys | Where-Object { Test-Path -LiteralPath $_ })
$fresh = -not (Test-Path -LiteralPath $data) -and $priorKeys.Count -eq 0 -and -not (Get-Process saveddesk -ErrorAction SilentlyContinue)
if ($Check) { @{disposable_guest_detected=[bool]$isGuest;fresh_profile=[bool]$fresh;can_run=([bool]$isGuest -and [bool]$fresh);note='Read-only check. Actual test requires -FreshGuest and both installers.'} | ConvertTo-Json; exit 0 }
if (-not $FreshGuest -or -not $isGuest -or -not $fresh) { throw 'Refusing to install or uninstall on this host. Use a fresh disposable Windows guest and -FreshGuest.' }
foreach ($file in @($Installer,$PreviousInstaller,(Join-Path $PSScriptRoot 'guest-smoke.mjs'))) { if (-not $file -or -not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'Both installers and guest-smoke.mjs are required.' } }
if (-not $EvidenceDirectory) { throw 'Select the dedicated writable evidence folder.' }
New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
$install = Join-Path $env:LOCALAPPDATA ('SavedDesk-acceptance-' + [Guid]::NewGuid().ToString())
$downloads = Join-Path $env:USERPROFILE 'Downloads/SavedDesk-acceptance'
if (Test-Path -LiteralPath $downloads) { throw 'Acceptance downloads folder already exists; use a fresh guest.' }
New-Item -ItemType Directory -Path $downloads -Force | Out-Null
$state = Join-Path $EvidenceDirectory 'guest-library.json'
$report = @{schema=1;passed=$false;fresh_guest=$true;guest_model=$computer.Model;windows=(Get-CimInstance Win32_OperatingSystem).Caption;installer_sha256=(Get-FileHash -LiteralPath $Installer).Hash.ToLowerInvariant();previous_installer_sha256=(Get-FileHash -LiteralPath $PreviousInstaller).Hash.ToLowerInvariant();checks=@();started_at_utc=[DateTime]::UtcNow.ToString('o')}
$app = $null
function Run-Installer([string]$File) {
    if ($install.Contains('"')) { throw 'Unsafe installation path.' }
    $process = Start-Process -FilePath $File -ArgumentList @('/S',"/D=$install") -WindowStyle Hidden -PassThru
    if (-not $process.WaitForExit(300000)) { Stop-Process -Id $process.Id; throw 'Installer timed out.' }
    if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $install 'saveddesk.exe'))) { throw 'Per-user silent installation failed.' }
}
function Run-App([string]$Mode) {
    $node = Join-Path $install 'worker/_internal/runtime/node.exe'
    if (-not (Test-Path -LiteralPath $node)) { throw 'Bundled Node runtime is missing.' }
    $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0); $listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
    $oldArgs = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
    try {
        $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-address=127.0.0.1 --remote-debugging-port=$port"
        $script:app = Start-Process -FilePath (Join-Path $install 'saveddesk.exe') -WindowStyle Hidden -PassThru
        & $node (Join-Path $PSScriptRoot 'guest-smoke.mjs') "http://127.0.0.1:$port" $Mode $downloads $state
        if ($LASTEXITCODE) { throw "Installed app acceptance failed during $Mode." }
    } finally {
        $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $oldArgs
        if ($script:app -and -not $script:app.HasExited) { & taskkill.exe /PID $script:app.Id /T /F | Out-Null }
        $script:app = $null
    }
}
try {
    Run-Installer $PreviousInstaller; Run-App 'seed'; $report.checks += 'previous-install-launch-local-worker'
    $content = @(Get-ChildItem -LiteralPath $downloads -File -Recurse | ForEach-Object { @{path=$_.FullName;hash=(Get-FileHash -LiteralPath $_.FullName).Hash} })
    if ($content.Count -lt 3) { throw 'Sample media was not created.' }
    $connectorKey = 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.saveddesk.connector'
    if (-not (Test-Path -LiteralPath $connectorKey)) { throw 'Connector registration failed.' }
    $upgrade = Start-Process -FilePath $Installer -ArgumentList @('/S','/UPDATE',"/D=$install") -WindowStyle Hidden -PassThru
    if (-not $upgrade.WaitForExit(300000)) { Stop-Process -Id $upgrade.Id; throw 'Upgrade installer timed out.' }
    if ($upgrade.ExitCode -ne 0) { throw 'Upgrade installer failed.' }
    & (Join-Path $PSScriptRoot 'test-installed-payload.ps1') -InstallDirectory $install
    $report.checks += 'upgrade-excludes-obsolete-gallery-and-ffmpeg-payload'
    Run-App 'verify'; $report.checks += 'upgrade-library-settings-volume-history-duplicates'
    foreach ($item in $content) { if ((Get-FileHash -LiteralPath $item.path).Hash -ne $item.hash) { throw 'Upgrade changed existing media.' } }
    $report.checks += 'upgrade-media-preserved'
    if (-not (Test-Path -LiteralPath (Join-Path $install 'licenses/THIRD_PARTY_NOTICES.txt'))) { throw 'Installed license notices are absent.' }
    if (-not (Test-Path -LiteralPath $connectorKey)) { throw 'Upgrade removed the connector registration.' }
    $report.checks += 'license-bundle-and-connector-retained'
    $uninstaller = Join-Path $install 'uninstall.exe'
    $process = Start-Process -FilePath $uninstaller -ArgumentList @('/S',"_?=$install") -WindowStyle Hidden -PassThru
    if (-not $process.WaitForExit(120000)) { Stop-Process -Id $process.Id; throw 'Uninstall timed out.' }
    if ($process.ExitCode -ne 0 -or (Test-Path -LiteralPath (Join-Path $install 'saveddesk.exe')) -or (Test-Path -LiteralPath (Join-Path $install 'worker/saveddesk-worker.exe'))) { throw 'Uninstall left installed application binaries.' }
    if (Test-Path -LiteralPath $connectorKey) { throw 'Uninstall left this installation native-host registration.' }
    if (-not (Test-Path -LiteralPath (Join-Path $data 'prototype-catalog.db'))) { throw 'Uninstall deleted the user catalog.' }
    foreach ($item in $content) { if ((Get-FileHash -LiteralPath $item.path).Hash -ne $item.hash) { throw 'Uninstall changed saved media.' } }
    $report.checks += 'uninstall-binaries-and-registration-removed-data-kept'
    $report.passed = $true
} catch { $report.error = $_.Exception.Message; throw } finally {
    if ($app -and -not $app.HasExited) { & taskkill.exe /PID $app.Id /T /F | Out-Null }
    $report.finished_at_utc = [DateTime]::UtcNow.ToString('o')
    $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'clean-windows.json') -Encoding UTF8
}
