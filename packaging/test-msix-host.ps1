param([Parameter(Mandatory=$true)][string]$ReviewDirectory,[switch]$Run)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$assets=[IO.Path]::GetFullPath($ReviewDirectory)
if(-not $assets.StartsWith((Join-Path $root 'release-artifacts')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Use reviewed project MSIX assets.'}
$signing=Get-Content -LiteralPath (Join-Path $assets 'local-test-signing.json') -Raw | ConvertFrom-Json
if(-not $Run -or -not $signing.local_test_only -or $signing.certificate_subject -ne 'CN=SavedDesk MSIX Preview'){throw 'Use -Run only with a reviewed local-test package.'}
foreach($entry in @(@{path=$signing.package;sha=$signing.package_sha256},@{path=$signing.upgrade_test_package;sha=$signing.upgrade_test_sha256},@{path=$signing.certificate_file;sha=$signing.certificate_sha256})){
 if((Get-FileHash -LiteralPath $entry.path).Hash.ToLowerInvariant() -ne $entry.sha){throw 'MSIX test input hash mismatch.'}
}
if(Get-AppxPackage -Name SavedDesk.MsixPreview){throw 'An existing local preview is installed; leave it untouched.'}
. (Join-Path $PSScriptRoot 'test-active-processes.ps1')
if(@(Get-UnisolatedSavedDeskProcesses $root).Count){throw 'Close all owner SavedDesk processes before testing.'}
$evidence=[IO.Path]::GetFullPath($signing.test_directory)
if(-not $evidence.StartsWith((Join-Path $root '.cache/msix-host')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected QA directory.'}
$id=[Guid]::NewGuid().ToString();$backups=@();$registry=@();$app=$null;$installed=$false;$certAdded=$false
$report=@{schema=1;passed=$false;clean_machine=$false;environment='Existing Windows host; isolated app profile';package_sha256=$signing.package_sha256;checks=@();owner_data_restored=$false}
$certPath='Cert:\CurrentUser\TrustedPeople\'+$signing.certificate_thumbprint
Add-Type -Path (Join-Path $PSScriptRoot 'msix-test-activation.cs')
$data=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'com.saveddesk.desktop'))
$media=Join-Path $evidence 'media';$state=Join-Path $evidence 'library.json'
function Stop-TestApp {
 if($script:app -and -not $script:app.HasExited){& taskkill.exe /PID $script:app.Id /T /F | Out-Null;$script:app.WaitForExit(15000) | Out-Null}
 $script:app=$null
}
function App-Step([string]$Mode){
 $package=Get-AppxPackage -Name SavedDesk.MsixPreview
 if(-not $package){throw 'Expected local MSIX registration.'}
 $install=$package.InstallLocation
 & (Join-Path $PSScriptRoot 'test-installed-payload.ps1') -InstallDirectory $install
 $trust=Get-Content -LiteralPath (Join-Path $evidence 'trust-status.json') -Raw | ConvertFrom-Json
 if(-not $trust.ready -or -not $trust.debug_port){throw 'Run the temporary-trust wrapper to configure app-scoped package-activation debugging.'}
 $port=$trust.debug_port
 $old=$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS;$oldPath=$env:PATH
 try {
  $env:PATH="$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\WindowsPowerShell\v1.0"
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-address=127.0.0.1 --remote-debugging-port=$port"
  # Use the registered Start-menu activation path, not direct WindowsApps execution.
  $processId=[SavedDeskMsixActivation]::Activate($package.PackageFamilyName+'!SavedDesk')
  $script:app=Get-Process -Id $processId
  # Drive CDP with the audited tooling copy; unpackaged test processes cannot
  # assume permission to execute an auxiliary EXE from WindowsApps.
  $driver=Join-Path $root 'desktop/src-tauri/resources/worker/_internal/runtime/node.exe'
  if((Get-FileHash -LiteralPath $driver).Hash -ne (Get-FileHash -LiteralPath (Join-Path $install 'worker/_internal/runtime/node.exe')).Hash){throw 'CDP driver differs from the packaged Node runtime.'}
  & $driver (Join-Path $PSScriptRoot 'guest-smoke.mjs') "http://127.0.0.1:$port" $Mode $media $state
  if($LASTEXITCODE){throw "Installed MSIX app check failed: $Mode"}
  if($Mode -eq 'seed'){
   & (Join-Path $root '.venv/Scripts/python.exe') (Join-Path $PSScriptRoot 'msix-test-native-host.py') (Join-Path $data 'connector-edge.json')
   if($LASTEXITCODE){throw 'External browser native-host launch test failed.'}
  }
  $engines=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith((Join-Path $install 'resources/webview2')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)})
  if(-not $engines.Count){throw 'The installed app did not use its bundled Fixed Version runtime.'}
 } finally {
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=$old;$env:PATH=$oldPath;Stop-TestApp

 }
}
try {
 if(-not (Test-Path -LiteralPath $certPath)) {Import-Certificate -FilePath $signing.certificate_file -CertStoreLocation Cert:\CurrentUser\TrustedPeople | Out-Null;$certAdded=$true}
 # Trust is checked before owner profiles or registrations are touched.
 Add-AppxPackage -Path $signing.package
 $installed=$true;$report.checks+='signed-local-package-installation'
 foreach($profile in @($data,[IO.Path]::GetFullPath((Join-Path $env:APPDATA 'com.saveddesk.desktop'))) | Select-Object -Unique){
  if([IO.Path]::GetFileName($profile) -ne 'com.saveddesk.desktop'){throw 'Unexpected profile path.'}
  if((Get-Item -LiteralPath (Split-Path $profile)).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refuse redirected profile parents.'}
  $backup=$profile+'.msix-test-backup-'+$id
  if(Test-Path -LiteralPath $backup){throw 'Profile backup exists.'}
  $hashes=@();$exists=Test-Path -LiteralPath $profile
  if($exists){
   $items=@(Get-Item -LiteralPath $profile -Force)+@(Get-ChildItem -LiteralPath $profile -Recurse -Force)
   if($items | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}){throw 'Refuse linked profile content.'}
   $hashes=@(Get-ChildItem -LiteralPath $profile -Recurse -File | ForEach-Object {@{relative=$_.FullName.Substring($profile.Length+1);sha256=(Get-FileHash -LiteralPath $_.FullName).Hash}})
  }
  $entry=@{profile=$profile;backup=$backup;existed=$exists;moved=$false;hashes=$hashes};$backups+=$entry
  @{backups=$backups;registry=$registry} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidence 'owner-recovery.json') -Encoding UTF8
  if($exists){Move-Item -LiteralPath $profile -Destination $backup;$entry.moved=$true}
 }
 foreach($browser in @('Google\Chrome','Microsoft\Edge','BraveSoftware\Brave-Browser','Vivaldi','Chromium','Mozilla')){
  $path="HKCU:\Software\$browser\NativeMessagingHosts\com.saveddesk.connector";$exists=Test-Path -LiteralPath $path;$values=@()
  if($exists){$key=Get-Item -LiteralPath $path;if($key.GetSubKeyNames().Count){throw 'Unexpected registration children.'};$values=@($key.GetValueNames() | ForEach-Object {@{name=$_;kind=$key.GetValueKind($_).ToString();value=$key.GetValue($_,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)}})}
  $registry+=@{path=$path;existed=$exists;values=$values}
 }
 @{backups=$backups;registry=$registry} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidence 'owner-recovery.json') -Encoding UTF8
 & (Join-Path $root '.venv/Scripts/python.exe') (Join-Path $PSScriptRoot 'msix-test-fixture.py') $data $media
 if($LASTEXITCODE){throw 'Isolated catalog preparation failed.'}
 App-Step 'seed';$report.checks+='installed-fixed-runtime-worker-local-transfers-connector'
 $files=@(Get-ChildItem -LiteralPath $media -Recurse -File | ForEach-Object {@{path=$_.FullName;sha=(Get-FileHash -LiteralPath $_.FullName).Hash}})
 Add-AppxPackage -Path $signing.upgrade_test_package
 if((Get-AppxPackage -Name SavedDesk.MsixPreview).Version.ToString() -ne $signing.upgrade_test_version){throw 'MSIX upgrade version mismatch.'}
 App-Step 'verify';$report.checks+='msix-upgrade-catalog-settings-player-history-duplicates'
 # MSIX does not execute the NSIS uninstall hook. Exercise the explicit owned cleanup.
 $edge='HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.saveddesk.connector'
 $hostManifest=Get-Content -LiteralPath (Join-Path $data 'connector-edge.json') -Raw | ConvertFrom-Json
 & (Join-Path $PSScriptRoot 'unregister-connector.ps1') -InstallDirectory (Split-Path -Parent $hostManifest.path)
 if(Test-Path -LiteralPath $edge){throw 'Owned browser registration cleanup failed.'}
 $package=Get-AppxPackage -Name SavedDesk.MsixPreview;Remove-AppxPackage -Package $package.PackageFullName;$installed=$false
 if(Get-AppxPackage -Name SavedDesk.MsixPreview){throw 'MSIX registration remains after uninstall.'}
 if(-not (Test-Path -LiteralPath (Join-Path $data 'prototype-catalog.db'))){throw 'MSIX removal unexpectedly deleted retained data.'}
 foreach($file in $files){if((Get-FileHash -LiteralPath $file.path).Hash -ne $file.sha){throw 'MSIX lifecycle changed media.'}}
 $report.checks+='msix-removal-registration-removed-media-retained'
 $report.passed=$true
} catch {$report.error=$_.Exception.Message;$report.failure_location=$_.InvocationInfo.PositionMessage;$report.stack=$_.ScriptStackTrace;Write-Warning $report.error} finally {
 Stop-TestApp
 try{if($installed){$package=Get-AppxPackage -Name SavedDesk.MsixPreview;if($package){Remove-AppxPackage -Package $package.PackageFullName}}}catch{$report.passed=$false;$report.package_cleanup_error=$_.Exception.Message}
 try{foreach($entry in $registry){if(Test-Path -LiteralPath $entry.path){Remove-Item -LiteralPath $entry.path};if($entry.existed){New-Item -Path $entry.path -Force | Out-Null;$key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($entry.path.Substring(6),$true);try{foreach($v in $entry.values){$key.SetValue($v.name,$v.value,[Microsoft.Win32.RegistryValueKind]$v.kind)}}finally{$key.Dispose()}}}
 }catch{$report.passed=$false;$report.registry_cleanup_error=$_.Exception.Message}
 $restoreErrors=@()
 foreach($entry in $backups){
  try{
  if($entry.moved -or -not $entry.existed){
   if(Test-Path -LiteralPath $entry.profile){Move-Item -LiteralPath $entry.profile -Destination (Join-Path $evidence ('isolated-profile-'+$id+'-'+[Array]::IndexOf($backups,$entry)))}
   if($entry.moved){Move-Item -LiteralPath $entry.backup -Destination $entry.profile}
  }
  foreach($file in $entry.hashes){if((Get-FileHash -LiteralPath (Join-Path $entry.profile $file.relative)).Hash -ne $file.sha256){throw 'Owner profile restoration checksum mismatch.'}}
  }catch{$restoreErrors+=$_.Exception.Message}
 }
 if($certAdded -and (Test-Path -LiteralPath $certPath)){Remove-Item -LiteralPath $certPath}
 $report.owner_data_restored=$restoreErrors.Count -eq 0
 if($restoreErrors.Count){$report.passed=$false;$report.owner_restore_errors=$restoreErrors;Write-Warning 'Owner restoration needs attention; keep the recorded backup paths intact.'}
 $report.finished_at_utc=[DateTime]::UtcNow.ToString('o')
 $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $evidence 'msix-host.json') -Encoding UTF8
 Write-Output "MSIX host test evidence: $evidence"
}
if(-not $report.passed){exit 1}
