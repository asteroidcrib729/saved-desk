param([string]$Installer,[switch]$Run,[switch]$Check)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$ownerData=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'com.saveddesk.desktop'))
$roaming=[IO.Path]::GetFullPath((Join-Path $env:APPDATA 'com.saveddesk.desktop'))
$uninstallKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\SavedDesk'
$manufacturerKey='HKCU:\Software\saveddesk\SavedDesk'
$connectorKey='HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.saveddesk.connector'
. (Join-Path $PSScriptRoot "test-active-processes.ps1")
$active=@(Get-UnisolatedSavedDeskProcesses $root)
$installed=Test-Path -LiteralPath $uninstallKey
if($Check) { @{can_run=(-not $installed -and $active.Count -eq 0);existing_installation=$installed;active_processes=$active.Count;environment='existing development Windows host';clean_machine=$false;owner_data_present=(Test-Path -LiteralPath $ownerData)} | ConvertTo-Json; exit 0 }
if(-not $Run -or $installed -or $active.Count) { throw 'Use -Run only with all SavedDesk processes closed and no registered installed copy. Existing installations are never automatically uninstalled.' }
$id=[Guid]::NewGuid().ToString()
$evidence=Join-Path $root ".cache/host-acceptance/$id"
$install=Join-Path $evidence 'Installed SavedDesk'
$downloads=Join-Path $evidence 'media'
$state=Join-Path $evidence 'test-library.json'
$previous=Join-Path $root '.cache/quarantined-releases/v0.2.0/SavedDesk_0.2.0_x64-setup.exe'
if(-not $Installer) { $version=(Get-Content -LiteralPath (Join-Path $root "desktop/package.json") -Raw | ConvertFrom-Json).version; $Installer=Join-Path $root "release-artifacts/v$version/SavedDesk_${version}_x64-setup.exe" }
$current=[IO.Path]::GetFullPath($Installer)
if(-not $current.StartsWith((Join-Path $root 'release-artifacts')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Use a collected preview inside this project release-artifacts directory.' }
$manifest=Get-Content -LiteralPath (Join-Path (Split-Path $current) 'release-manifest.json') -Raw | ConvertFrom-Json
$currentHash=@($manifest.assets | Where-Object { $_.name -eq [IO.Path]::GetFileName($current) })
if($currentHash.Count -ne 1 -or $currentHash[0].sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Missing installer checksum record.' }
$currentVersion=$manifest.version
$expected=@{ $previous='8e922e2fa312aa1ebef6c87deefa8fab9900b049e42a51bf095afc36f5271afa'; $current=$currentHash[0].sha256 }
foreach($file in @($previous,$current)) { if(-not (Test-Path -LiteralPath $file -PathType Leaf) -or (Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant() -ne $expected[$file]) { throw 'Installer hash does not match the reviewed preview.' } }
# All moves are exact absolute SavedDesk profile paths, never computed ancestors.
$profiles=@($ownerData,$roaming) | Select-Object -Unique
$backups=@()
foreach($profile in $profiles) {
    if([IO.Path]::GetFileName($profile) -ne 'com.saveddesk.desktop' -or (Get-Item -LiteralPath (Split-Path $profile) -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Unexpected profile directory.' }
    $backup=$profile+'.installer-test-backup-'+$id
    if(Test-Path -LiteralPath $backup) { throw 'Backup already exists.' }
    $hashes=@()
    if(Test-Path -LiteralPath $profile) {
        if((Get-Item -LiteralPath $profile -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing a redirected application profile.' }
        $hashes=@(Get-ChildItem -LiteralPath $profile -File | ForEach-Object { @{name=$_.Name;sha256=(Get-FileHash -LiteralPath $_.FullName).Hash} })
    }
    $backups+=@{profile=$profile;backup=$backup;existed=(Test-Path -LiteralPath $profile);moved=$false;hashes=$hashes}
}
function Capture-Key([string]$Path) {
    if(-not (Test-Path -LiteralPath $Path)) { return @{path=$Path;existed=$false;values=@()} }
    $key=Get-Item -LiteralPath $Path
    if($key.GetSubKeyNames().Count) { throw 'Unexpected registry children; refusing to alter registration.' }
    return @{path=$Path;existed=$true;values=@($key.GetValueNames() | ForEach-Object { @{name=$_;kind=$key.GetValueKind($_).ToString();value=$key.GetValue($_,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)} })}
}
$registry=@(Capture-Key $manufacturerKey; Capture-Key $connectorKey; Capture-Key $uninstallKey)
$shortcutRoots=@([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('StartMenu'))
$shortcuts=@($shortcutRoots | ForEach-Object { Get-ChildItem -LiteralPath $_ -Filter '*SavedDesk*.lnk' -Recurse -File -ErrorAction SilentlyContinue } | ForEach-Object { @{path=$_.FullName;hash=(Get-FileHash -LiteralPath $_.FullName).Hash} })
New-Item -ItemType Directory -Path $evidence,$downloads -Force | Out-Null
$report=@{schema=1;passed=$false;clean_machine=$false;environment='existing development host, empty temporary app profile';windows=(Get-CimInstance Win32_OperatingSystem).Caption;installer_sha256=$expected[$current];previous_installer_sha256=$expected[$previous];checks=@();owner_data_restored=$false;started_at_utc=[DateTime]::UtcNow.ToString('o')}
$app=$null;$installStarted=$false
function Stop-TestApp {
    if($script:app -and -not $script:app.HasExited) { & taskkill.exe /PID $script:app.Id /T /F | Out-Null }
    $script:app=$null
    $deadline=[DateTime]::UtcNow.AddSeconds(15)
    do {
        $remaining=@(Get-Process saveddesk,saveddesk-worker -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($install+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) })
        if(-not $remaining.Count) { break }
        Start-Sleep -Milliseconds 250
    } while([DateTime]::UtcNow -lt $deadline)
    if($remaining.Count) { throw 'Test process still owns the temporary profile.' }
}
function Installer-Step([string]$File,[bool]$Upgrade=$false) {
    $arguments=@('/S','/NS');if($Upgrade){$arguments+='/UPDATE'};$arguments+="/D=$install"
    $script:installStarted=$true
    $process=Start-Process -FilePath $File -ArgumentList $arguments -WindowStyle Hidden -PassThru
    if(-not $process.WaitForExit(180000)) { throw 'Installer timed out; preserve evidence and investigate its process.' }
    if($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $install 'saveddesk.exe'))) { throw ('Silent installation failed: exit='+$process.ExitCode+'; app-present='+(Test-Path -LiteralPath (Join-Path $install 'saveddesk.exe'))) }
}
function App-Step([string]$Mode) {
    $listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0);$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
    $old=$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
    $names=@('PATH','PYTHONPATH','PYTHONHOME','VIRTUAL_ENV','SAVEDDESK_GALLERY_PYTHON','SAVEDDESK_FFMPEG','SAVEDDESK_NODE')
    $originalEnvironment=@{}
    foreach($name in $names) { $originalEnvironment[$name]=[Environment]::GetEnvironmentVariable($name,'Process') }
    try {
        foreach($name in $names) { if($name -ne 'PATH') { [Environment]::SetEnvironmentVariable($name,$null,'Process') } }
        $env:PATH="$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\WindowsPowerShell\v1.0"
        $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-address=127.0.0.1 --remote-debugging-port=$port"
        $script:app=Start-Process -FilePath (Join-Path $install 'saveddesk.exe') -WindowStyle Hidden -PassThru
        & (Join-Path $install 'worker/_internal/runtime/node.exe') (Join-Path $PSScriptRoot 'guest-smoke.mjs') "http://127.0.0.1:$port" $Mode $downloads $state
        if($LASTEXITCODE) { throw "Installed application check failed: $Mode" }
    } finally { $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=$old;Stop-TestApp;foreach($name in $names) { [Environment]::SetEnvironmentVariable($name,$originalEnvironment[$name],'Process') } }
}
function Uninstall-TestCopy {
    $file=Join-Path $install 'uninstall.exe'
    if(-not (Test-Path -LiteralPath $file)) { return }
    $process=Start-Process -FilePath $file -ArgumentList @('/S',"_?=$install") -WindowStyle Hidden -PassThru
    if(-not $process.WaitForExit(120000) -or $process.ExitCode -ne 0) { throw 'Test uninstall failed.' }
}
try {
    foreach($item in $backups) { if($item.existed) { Move-Item -LiteralPath $item.profile -Destination $item.backup;$item.moved=$true } }
    Installer-Step $previous;App-Step 'seed';$report.checks+='previous-install-launch-local-worker'
    $media=@(Get-ChildItem -LiteralPath $downloads -File -Recurse | ForEach-Object { @{path=$_.FullName;hash=(Get-FileHash -LiteralPath $_.FullName).Hash} })
    if($media.Count -lt 3 -or -not (Test-Path -LiteralPath $connectorKey)) { throw 'Sample transfers or Edge connector setup failed.' }
    # Model an existing, separately installed tool selection before upgrade.
    $galleryPython=Join-Path $root '.venv/Scripts/python.exe'
    $ffmpeg=(& $galleryPython -I -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())').Trim()
    if($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $ffmpeg -PathType Leaf)) { throw 'Private acceptance tools are unavailable.' }
    $toolConfig=@{galleryPython=$galleryPython;ffmpeg=$ffmpeg}
    $toolPath=Join-Path $ownerData 'external-tools.json'
    [IO.File]::WriteAllText($toolPath,($toolConfig | ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))
    $toolHash=(Get-FileHash -LiteralPath $toolPath).Hash
    $seedState=Get-Content -LiteralPath $state -Raw | ConvertFrom-Json
    $seedState | Add-Member tools $toolConfig
    $seedState | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $state -Encoding UTF8
    Installer-Step $current $true;& (Join-Path $PSScriptRoot 'test-installed-payload.ps1') -InstallDirectory $install;App-Step 'verify';$report.checks+='upgrade-library-settings-volume-history-duplicates'
    if((Get-FileHash -LiteralPath $toolPath).Hash -ne $toolHash) { throw 'Upgrade changed external-tool selections.' }
    $report.checks+='external-tools-preserved-and-functional-after-upgrade';$report.checks+='installed-app-minimal-path-no-development-python-environment'

    foreach($item in $media) { if((Get-FileHash -LiteralPath $item.path).Hash -ne $item.hash) { throw 'Upgrade changed sample media.' } }
    if(-not (Test-Path -LiteralPath (Join-Path $install 'licenses/THIRD_PARTY_NOTICES.txt')) -or -not (Test-Path -LiteralPath $connectorKey)) { throw 'Notices or upgraded connector are missing.' }
    if((Get-ItemProperty -LiteralPath $uninstallKey).DisplayVersion -ne $currentVersion) { throw 'Installed upgrade version is incorrect.' }
    $report.checks+='upgrade-excludes-obsolete-gallery-and-ffmpeg-payload';$report.checks+='upgrade-media-preserved';$report.checks+='license-bundle-and-connector-retained'
    Uninstall-TestCopy
    if((Test-Path -LiteralPath (Join-Path $install 'saveddesk.exe')) -or (Test-Path -LiteralPath (Join-Path $install 'worker/saveddesk-worker.exe')) -or (Test-Path -LiteralPath $connectorKey) -or (Test-Path -LiteralPath $uninstallKey)) { throw 'Uninstall left application binaries or test registration.' }
    if(-not (Test-Path -LiteralPath (Join-Path $ownerData 'prototype-catalog.db'))) { throw 'Uninstall deleted the temporary catalog.' }
    foreach($item in $media) { if((Get-FileHash -LiteralPath $item.path).Hash -ne $item.hash) { throw 'Uninstall changed sample media.' } }
    if((Get-FileHash -LiteralPath $toolPath).Hash -ne $toolHash) { throw 'Uninstall changed external-tool settings.' }
    $report.checks+='uninstall-binaries-and-registration-removed-data-kept'
    # Verify the exact current installer also performs a fresh installation after
    # registration removal, retaining the user's catalog as designed.
    Installer-Step $current
    & (Join-Path $PSScriptRoot 'test-installed-payload.ps1') -InstallDirectory $install
    App-Step 'verify'
    if((Get-ItemProperty -LiteralPath $uninstallKey).DisplayVersion -ne $currentVersion) { throw 'Fresh current installation version is incorrect.' }
    $report.checks+='current-installer-fresh-install-launch-retained-library'
    Uninstall-TestCopy
    if((Test-Path -LiteralPath (Join-Path $install 'saveddesk.exe')) -or (Test-Path -LiteralPath $connectorKey) -or (Test-Path -LiteralPath $uninstallKey)) { throw 'Current fresh-install uninstall left app registrations.' }
    foreach($item in $media) { if((Get-FileHash -LiteralPath $item.path).Hash -ne $item.hash) { throw 'Current uninstall changed retained media.' } }
    $report.checks+='current-installer-second-uninstall-retains-media'
    $report.passed=$true
} catch { $report.error=$_.Exception.Message;Write-Warning $report.error } finally {
    Stop-TestApp
    if($installStarted -and (Test-Path -LiteralPath (Join-Path $install 'saveddesk.exe'))) { try { Uninstall-TestCopy } catch { $report.cleanup_error=$_.Exception.Message;$report.passed=$false } }
    foreach($item in $backups) {
        if($item.moved -or -not $item.existed) {
            if(Test-Path -LiteralPath $item.profile) { Move-Item -LiteralPath $item.profile -Destination (Join-Path $evidence ('test-profile-'+[Array]::IndexOf($backups,$item))) }
            if($item.moved) { Move-Item -LiteralPath $item.backup -Destination $item.profile }
        }
        foreach($hash in $item.hashes) { if((Get-FileHash -LiteralPath (Join-Path $item.profile $hash.name)).Hash -ne $hash.sha256) { throw 'Restored owner data checksum mismatch.' } }
    }
    foreach($item in $registry) {
        if(Test-Path -LiteralPath $item.path) { Remove-Item -LiteralPath $item.path }
        if($item.existed) { New-Item -Path $item.path -Force | Out-Null;foreach($value in $item.values) { (Get-Item -LiteralPath $item.path).SetValue($value.name,$value.value,[Microsoft.Win32.RegistryValueKind]$value.kind) } }
    }
    foreach($shortcut in $shortcuts) { if((Get-FileHash -LiteralPath $shortcut.path).Hash -ne $shortcut.hash) { throw 'An existing SavedDesk shortcut was changed.' } }
    $report.checks+='owner-profile-hashes-registrations-shortcuts-restored'
    $report.owner_data_restored=$true
    $report.finished_at_utc=[DateTime]::UtcNow.ToString('o')
    $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $evidence 'host-windows.json') -Encoding UTF8
    Write-Output "Host acceptance evidence: $evidence"
}
if(-not $report.passed) { exit 1 }
