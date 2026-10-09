param([switch]$Check)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$folder=Join-Path $root '.cache/webview-runtime'
$binary=Join-Path $folder 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe'
$url='https://go.microsoft.com/fwlink/?linkid=2124701'
if(-not (Test-Path -LiteralPath $binary -PathType Leaf)) {
 if($Check) { throw 'Prepare the official offline runtime before building this installer.' }
 New-Item -ItemType Directory -Path $folder -Force | Out-Null
 & curl.exe --location --fail --retry 2 --connect-timeout 15 --max-time 300 --silent --show-error --output ($binary+'.pending') $url
 if($LASTEXITCODE) { throw 'Official Microsoft runtime download failed; retained incomplete bytes are not bundled.' }
 $pendingSignature=Get-AuthenticodeSignature -LiteralPath ($binary+'.pending')
 if($pendingSignature.Status -ne 'Valid' -or $pendingSignature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation(?:,|$)') { throw 'Downloaded prerequisite lacks a valid Microsoft signature; do not bundle it.' }
 Move-Item -LiteralPath ($binary+'.pending') -Destination $binary
}
$signature=Get-AuthenticodeSignature -LiteralPath $binary
if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation(?:,|$)') { throw 'Offline runtime signature verification failed.' }
$version=(Get-Item -LiteralPath $binary).VersionInfo.FileVersion
$terms=Join-Path $root 'licensing/WEBVIEW2-LICENSE.txt'
if(-not (Test-Path -LiteralPath $terms)) { throw 'Applicable Microsoft runtime license terms are missing.' }
@{schema=1;source_url=$url;terms_url='https://developer.microsoft.com/microsoft-edge/api/eula/webview2?locale=en-us';path='.cache/webview-runtime/MicrosoftEdgeWebView2RuntimeInstallerX64.exe';version=$version;bytes=(Get-Item -LiteralPath $binary).Length;sha256=(Get-FileHash -LiteralPath $binary).Hash.ToLowerInvariant();signature='Valid';publisher=$signature.SignerCertificate.Subject;license_path='WEBVIEW2-LICENSE.txt';license_sha256=(Get-FileHash -LiteralPath $terms).Hash.ToLowerInvariant();mode='Official unmodified Evergreen offline installer; custom NSIS prerequisite hook runs on fresh install and upgrade';prepared_at_utc=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'licensing/WEBVIEW2-REVIEW.json') -Encoding UTF8
Write-Output "Verified Microsoft offline runtime $version."
