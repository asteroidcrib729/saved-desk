$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pin = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'signing-toolchain.json') -Raw | ConvertFrom-Json
$cache = Join-Path $root '.cache/signing-sdk'
New-Item -ItemType Directory -Path $cache -Force | Out-Null
$archive = Join-Path $cache "microsoft.trusted.signing.client.$($pin.sdk_version).nupkg"
if (-not (Test-Path -LiteralPath $archive)) { Invoke-WebRequest -Uri $pin.package_url -OutFile $archive -UseBasicParsing }
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.package_sha256) { throw 'Signing SDK checksum mismatch.' }
$destination = [IO.Path]::GetFullPath((Join-Path $cache $pin.sdk_version))
$boundary = $destination + [IO.Path]::DirectorySeparatorChar
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
    foreach ($entry in $zip.Entries) {
        $target = [IO.Path]::GetFullPath((Join-Path $destination $entry.FullName))
        if (-not $target.StartsWith($boundary,[StringComparison]::OrdinalIgnoreCase)) { throw 'Signing SDK contains an unsafe archive path.' }
    }
    foreach ($entry in $zip.Entries) {
        $target = [IO.Path]::GetFullPath((Join-Path $destination $entry.FullName))
        if ($entry.FullName.EndsWith('/')) { New-Item -ItemType Directory -Path $target -Force | Out-Null; continue }
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$true)
    }
} finally { $zip.Dispose() }
$env:SAVEDDESK_SIGN_DLIB_PATH = Join-Path $destination 'bin/x64/Azure.CodeSigning.Dlib.dll'
if (-not (Test-Path -LiteralPath $env:SAVEDDESK_SIGN_DLIB_PATH)) { throw 'The pinned x64 signing provider is missing.' }
Write-Output "Pinned signing SDK verified. Provider: $env:SAVEDDESK_SIGN_DLIB_PATH"
