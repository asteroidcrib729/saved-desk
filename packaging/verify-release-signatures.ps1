param([Parameter(Mandatory=$true)][string]$Installer,[Parameter(Mandatory=$true)][string]$EvidenceDirectory)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tool = Get-Command signtool.exe -ErrorAction SilentlyContinue
$tool = if ($tool) { $tool.Source } else { Get-ChildItem -LiteralPath (Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10/bin') -Directory | Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'x64/signtool.exe' } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1 }
if (-not $tool) { throw 'Windows SDK x64 SignTool is required to verify every signature.' }
$files = @($Installer,(Join-Path $root 'desktop/src-tauri/target/release/saveddesk.exe'),(Join-Path $root 'desktop/src-tauri/resources/saveddesk-native-host.exe'),(Join-Path $root 'desktop/src-tauri/resources/worker/saveddesk-worker.exe'))
$results = @($files | ForEach-Object {
    & $tool verify /pa /all $_
    $allSignaturesValid = $LASTEXITCODE -eq 0
    $signature = Get-AuthenticodeSignature -LiteralPath $_
    @{name=(Split-Path -Leaf $_);sha256=(Get-FileHash -LiteralPath $_).Hash.ToLowerInvariant();status=$signature.Status.ToString();timestamped=[bool]$signature.TimeStamperCertificate;passed=($allSignaturesValid -and $signature.Status -eq 'Valid' -and [bool]$signature.TimeStamperCertificate -and $signature.SignerCertificate.Subject -ne $signature.SignerCertificate.Issuer)}
})
$passed = @($results | Where-Object { -not $_.passed }).Count -eq 0
New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
@{passed=$passed;installer_sha256=(Get-FileHash -LiteralPath $Installer).Hash.ToLowerInvariant();files=$results;checked_at_utc=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'signatures.json') -Encoding UTF8
if (-not $passed) { throw 'One or more SavedDesk executables lacks a valid CA-issued timestamped signature.' }
