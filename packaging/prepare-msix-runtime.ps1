param([switch]$Check)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$record=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'msix-runtime.json') -Raw | ConvertFrom-Json
if($record.version -notmatch '^\d+\.\d+\.\d+\.\d+$' -or $record.sha256 -notmatch '^[a-f0-9]{64}$' -or $record.url -notmatch '^https://msedge\.sf\.dl\.delivery\.mp\.microsoft\.com/') {throw 'Invalid pinned Microsoft runtime metadata.'}
$cache=Join-Path $root '.cache/msix-runtime'
$cab=Join-Path $cache ("Microsoft.WebView2.FixedVersionRuntime.$($record.version).x64.cab")
New-Item -ItemType Directory -Path $cache -Force | Out-Null
if(-not (Test-Path -LiteralPath $cab)) {
 if($Check){throw 'Prepare the pinned runtime first.'}
 & curl.exe --location --fail --retry 2 --connect-timeout 15 --max-time 600 --silent --show-error --output ($cab+'.pending') $record.url
 if($LASTEXITCODE){throw 'Microsoft fixed runtime download failed.'}
 if((Get-FileHash -LiteralPath ($cab+'.pending')).Hash.ToLowerInvariant() -ne $record.sha256){throw 'Fixed runtime download checksum mismatch.'}
 Move-Item -LiteralPath ($cab+'.pending') -Destination $cab
}
if((Get-FileHash -LiteralPath $cab).Hash.ToLowerInvariant() -ne $record.sha256){throw 'Fixed runtime cache checksum mismatch.'}
$signature=Get-AuthenticodeSignature -LiteralPath $cab
if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation(?:,|$)'){throw 'Fixed runtime must have a valid Microsoft signature.'}
$destination=Join-Path $root 'desktop/src-tauri/resources/webview2'
$ready=Join-Path $destination 'saveddesk-runtime-review.json'
if(-not (Test-Path -LiteralPath $ready)) {
 if($Check){throw 'Extract the runtime before building.'}
 # Extract into a new cache directory; never recursively delete a computed resource path.
 $extract=Join-Path $cache ([Guid]::NewGuid().ToString())
 New-Item -ItemType Directory -Path $extract -Force | Out-Null
 & expand.exe $cab '-F:*' $extract | Out-Null
 if($LASTEXITCODE){throw 'Runtime extraction failed.'}
 $engine=@(Get-ChildItem -LiteralPath $extract -Recurse -Filter msedgewebview2.exe -File)
 if($engine.Count -ne 1){throw 'Expected one x64 Fixed Version engine.'}
 if(Test-Path -LiteralPath $destination){throw 'Unreviewed fixed runtime resource directory already exists; inspect it before replacing it.'}
 New-Item -ItemType Directory -Path $destination | Out-Null
 Get-ChildItem -LiteralPath $engine[0].DirectoryName -Force | Copy-Item -Destination $destination -Recurse
 $files=@(Get-ChildItem -LiteralPath $destination -Recurse -File | Sort-Object FullName | ForEach-Object { @{path=$_.FullName.Substring($destination.Length+1).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_.FullName).Hash.ToLowerInvariant()} })
 @{version=$record.version;cab_sha256=$record.sha256;source_url=$record.url;signature='Valid Microsoft';files=$files} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ready -Encoding UTF8
}
$review=Get-Content -LiteralPath $ready -Raw | ConvertFrom-Json
if($review.cab_sha256 -ne $record.sha256){throw 'Staged runtime does not match pinned metadata.'}
$expected=@{}
$prefix=$destination+[IO.Path]::DirectorySeparatorChar
foreach($entry in $review.files){
 $file=[IO.Path]::GetFullPath((Join-Path $destination $entry.path))
 if(-not $file.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -or (Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant() -ne $entry.sha256){throw 'Staged runtime path/hash mismatch.'}
 $expected[$file.ToLowerInvariant()]=$true
}
foreach($file in Get-ChildItem -LiteralPath $destination -Recurse -File){if($file.FullName -ne $ready -and -not $expected.ContainsKey($file.FullName.ToLowerInvariant())){throw 'Unreviewed fixed runtime file.'}}
$engine=Get-Item -LiteralPath (Join-Path $destination 'msedgewebview2.exe')
if($engine.VersionInfo.FileVersion -ne $record.version){throw 'Fixed runtime version mismatch.'}
if(-not (Test-Path -LiteralPath (Join-Path $root 'licensing/WEBVIEW2-LICENSE.txt'))){throw 'Microsoft runtime license is required.'}
Write-Output "Verified offline MSIX WebView2 runtime $($record.version)."
