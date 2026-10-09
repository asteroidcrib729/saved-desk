param([string]$Output='.cache/machine-prerequisites-0.2.6.json')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$file=[IO.Path]::GetFullPath((Join-Path $root $Output))
if(-not $file.StartsWith((Join-Path $root '.cache')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Private cache evidence only.'}
$guid='{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
$webview=@()
foreach($key in @("HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$guid","HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$guid","HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$guid")){
 if(Test-Path -LiteralPath $key){$webview+=@{registration=$key;version=(Get-ItemProperty -LiteralPath $key).pv}}
}
$os=Get-CimInstance Win32_OperatingSystem
$gpu=@(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,AdapterCompatibility,VideoProcessor)
$runtime=@('vcruntime140.dll','vcruntime140_1.dll','msvcp140.dll','ucrtbase.dll') | ForEach-Object {
 $path=Join-Path $env:SystemRoot "System32/$_";@{name=$_;system_present=(Test-Path -LiteralPath $path);version=if(Test-Path -LiteralPath $path){(Get-Item -LiteralPath $path).VersionInfo.FileVersion}else{$null}}
}
$nsi=Get-Content -LiteralPath (Join-Path $root 'desktop/src-tauri/target/release/nsis/x64/installer.nsi') -Raw
$config=Get-Content -LiteralPath (Join-Path $root 'desktop/src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
$hooks=Get-Content -LiteralPath (Join-Path $root 'packaging/installer-hooks.nsh') -Raw
$review=Get-Content -LiteralPath (Join-Path $root 'licensing/WEBVIEW2-REVIEW.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$checks=@{
 windows_x64=([Environment]::Is64BitOperatingSystem -and $os.OSArchitecture -match '64');webview_registered=($webview.Count -gt 0);
 offline_prerequisite_verified=($config.bundle.windows.webviewInstallMode.type -eq 'skip' -and $review.signature -eq 'Valid' -and (Get-FileHash -LiteralPath (Join-Path $root $review.path)).Hash.ToLowerInvariant() -eq $review.sha256);
 installer_has_machine_and_user_detection=($hooks.Contains('ReadRegStr $4 HKLM') -and $hooks.Contains('ReadRegStr $4 HKCU'));
 installer_checks_runtime_failure=($hooks.Contains('Abort') -and $hooks.Contains('Call SavedDeskEnsureWebView') -and $hooks.Contains('/silent /install') -and $hooks.Contains('verify_runtime:'));
 bundled_python_runtime=(Test-Path -LiteralPath (Join-Path $root 'desktop/src-tauri/target/release/worker/_internal/python314.dll'));
 bundled_vc_runtime=(Test-Path -LiteralPath (Join-Path $root 'desktop/src-tauri/target/release/worker/_internal/VCRUNTIME140.dll'));
 current_user_installer=($config.bundle.windows.nsis.installMode -eq 'currentUser')
}
$report=@{passed=(-not ($checks.Values -contains $false));checks=$checks;windows=@{caption=$os.Caption;version=$os.Version;build=$os.BuildNumber;architecture=$os.OSArchitecture};gpu=$gpu;webview=$webview;system_runtimes=$runtime;not_tested=@('Windows 11 or another physical GPU','uninstalled system WebView2/VC runtimes','offline installation when WebView2 is absent');scope='Actual host prerequisite inventory and generated installer branch inspection; not an absent-prerequisite installation test';created_at_utc=[DateTime]::UtcNow.ToString('o')}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $file -Encoding UTF8
$report | ConvertTo-Json -Depth 3
if(-not $report.passed){throw 'Machine prerequisites/installer policy did not pass.'}
