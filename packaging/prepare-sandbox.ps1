param([Parameter(Mandatory=$true)][string]$Installer,[Parameter(Mandatory=$true)][string]$PreviousInstaller)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$base = Join-Path $root ('.cache/clean-windows/' + [Guid]::NewGuid().ToString())
$inputs = Join-Path $base 'inputs'; $evidence = Join-Path $base 'evidence'
New-Item -ItemType Directory -Path $inputs,$evidence -Force | Out-Null
foreach ($file in @($Installer,$PreviousInstaller)) { if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'Select two existing setup executables.' } }
Copy-Item -LiteralPath $Installer -Destination (Join-Path $inputs 'current-setup.exe')
Copy-Item -LiteralPath $PreviousInstaller -Destination (Join-Path $inputs 'previous-setup.exe')
foreach ($name in @('test-clean-windows.ps1','guest-smoke.mjs')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $inputs }
$escape = { param($value) [Security.SecurityElement]::Escape($value) }
$inputXml = & $escape $inputs; $outputXml = & $escape $evidence
$command = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\SavedDeskInput\test-clean-windows.ps1 -FreshGuest -Installer C:\SavedDeskInput\current-setup.exe -PreviousInstaller C:\SavedDeskInput\previous-setup.exe -EvidenceDirectory C:\SavedDeskEvidence'
$commandXml = & $escape $command
@"
<Configuration>
  <Networking>Enable</Networking>
  <ClipboardRedirection>Disable</ClipboardRedirection>
  <MappedFolders>
    <MappedFolder><HostFolder>$inputXml</HostFolder><SandboxFolder>C:\SavedDeskInput</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
    <MappedFolder><HostFolder>$outputXml</HostFolder><SandboxFolder>C:\SavedDeskEvidence</SandboxFolder><ReadOnly>false</ReadOnly></MappedFolder>
  </MappedFolders>
  <LogonCommand><Command>$commandXml</Command></LogonCommand>
</Configuration>
"@ | Set-Content -LiteralPath (Join-Path $base 'SavedDesk.wsb') -Encoding UTF8
Write-Output "Sandbox configuration: $(Join-Path $base 'SavedDesk.wsb')"
Write-Output "Evidence: $evidence"
Write-Output 'Prepared only. Open the .wsb file on a supported Windows host; no Windows features were enabled or guest launched.'
