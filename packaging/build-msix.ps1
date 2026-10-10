param(
 [string]$IdentityName='SavedDesk.MsixPreview',
 [string]$Publisher='CN=SavedDesk MSIX Preview',
 [string]$PublisherDisplayName='Faraz Hussain',
 [string]$OutputDirectory,
 [switch]$CollectExisting,
 [switch]$ReuseWorker,
 [switch]$Store
)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$python=Join-Path $root '.venv/Scripts/python.exe'
Push-Location $root
try {
 if($Store){
  $identity=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'msix-store-identity.json') -Raw | ConvertFrom-Json
  $IdentityName=$identity.identity_name;$Publisher=$identity.publisher;$PublisherDisplayName=$identity.publisher_display_name
 }
 if(-not $CollectExisting){ & (Join-Path $PSScriptRoot 'build-desktop.ps1') -Msix -ReuseWorker:$ReuseWorker }
 & (Join-Path $PSScriptRoot 'prepare-msix-runtime.ps1') -Check
 & $python (Join-Path $PSScriptRoot 'audit-worker-bundle.py')
 if($LASTEXITCODE){throw 'Worker source/exclusion audit failed.'}
 & (Join-Path $PSScriptRoot 'test-installed-payload.ps1') -InstallDirectory (Join-Path $root 'desktop/src-tauri/target/release')
 $sdk=Get-ChildItem 'C:/Program Files (x86)/Windows Kits/10/bin' -Directory | Where-Object {$_.Name -match '^10\.0\.\d+\.0$' -and (Test-Path (Join-Path $_.FullName 'x64/makeappx.exe'))} | Sort-Object {[version]$_.Name} -Descending | Select-Object -First 1
 if(-not $sdk){throw 'Install the Windows SDK including MakeAppx.exe.'}
 $arguments=@((Join-Path $PSScriptRoot 'msix-package.py'),'--identity-name',$IdentityName,'--publisher',$Publisher,'--publisher-display-name',$PublisherDisplayName,'--makeappx',(Join-Path $sdk.FullName 'x64/makeappx.exe'))
 if($Store){$arguments+='--store-identity-confirmed'}
 if($OutputDirectory){$arguments+=@('--output',$OutputDirectory)}
 & $python @arguments
 if($LASTEXITCODE){throw 'MSIX packaging failed.'}
} finally {Pop-Location}
