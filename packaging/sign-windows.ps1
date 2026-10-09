param([string]$Path,[switch]$Check)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$signTool = Get-Command signtool.exe -ErrorAction SilentlyContinue
if ($signTool) { $signTool = $signTool.Source } else {
    $kits = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10/bin'
    $signTool = Get-ChildItem -LiteralPath $kits -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'x64/signtool.exe' } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
$missing = @()
if (-not $signTool) { $missing += 'Windows SDK signtool.exe (x64)' }
$provider = $env:SAVEDDESK_SIGN_PROVIDER
$certificate = $null
switch ($provider) {
    'store' {
        $thumb = $env:SAVEDDESK_SIGN_CERT_THUMBPRINT
        if ($thumb -notmatch '^[a-fA-F0-9]{40}$') { $missing += 'SAVEDDESK_SIGN_CERT_THUMBPRINT' } else {
            $certificate = Get-ChildItem Cert:/CurrentUser/My -CodeSigningCert | Where-Object { $_.Thumbprint -eq $thumb } | Select-Object -First 1
            if (-not $certificate -or -not $certificate.HasPrivateKey -or $certificate.NotAfter -le (Get-Date) -or $certificate.NotBefore -gt (Get-Date) -or $certificate.Subject -eq $certificate.Issuer) { $missing += 'Valid CA-issued code-signing certificate with accessible private key in CurrentUser/My' }
        }
    }
    'azure' {
        $dotnet = Get-Command dotnet.exe -ErrorAction SilentlyContinue
        if (-not $dotnet -or -not (@(& $dotnet.Source --list-runtimes) | Where-Object { $_ -match '^Microsoft.NETCore.App (8|9|[1-9][0-9])\.' })) { $missing += '.NET x64 runtime 8 or newer for the signing provider' }
        foreach ($name in @('SAVEDDESK_SIGN_AZURE_ACCOUNT','SAVEDDESK_SIGN_AZURE_PROFILE','SAVEDDESK_SIGN_DLIB_PATH')) {
            if (-not [Environment]::GetEnvironmentVariable($name)) { $missing += $name }
        }
        if ($env:SAVEDDESK_SIGN_AZURE_ENDPOINT -notmatch '^https://[a-z0-9-]+\.codesigning\.azure\.net/?$') { $missing += 'SAVEDDESK_SIGN_AZURE_ENDPOINT (official regional HTTPS endpoint)' }
        $pin = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'signing-toolchain.json') -Raw | ConvertFrom-Json
        $expected = Join-Path $root ".cache/signing-sdk/$($pin.sdk_version)/bin/x64/Azure.CodeSigning.Dlib.dll"
        $archive = Join-Path $root ".cache/signing-sdk/microsoft.trusted.signing.client.$($pin.sdk_version).nupkg"
        if (-not (Test-Path -LiteralPath $archive) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.package_sha256) { $missing += 'Pinned signing SDK archive; run setup-signing.ps1' }
        if (-not $env:SAVEDDESK_SIGN_DLIB_PATH -or -not (Test-Path -LiteralPath $expected) -or [IO.Path]::GetFullPath($env:SAVEDDESK_SIGN_DLIB_PATH) -ne [IO.Path]::GetFullPath($expected)) { $missing += 'Pinned SDK provider path from setup-signing.ps1' }
        elseif (Test-Path -LiteralPath $archive) {
            Add-Type -AssemblyName System.IO.Compression.FileSystem
            $zip = [IO.Compression.ZipFile]::OpenRead($archive)
            try {
                foreach ($entry in $zip.Entries | Where-Object { $_.FullName.StartsWith('bin/x64/') -and $_.Name }) {
                    $file = Join-Path (Split-Path -Parent $expected) $entry.FullName.Substring(8)
                    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { $missing += "Signing SDK file missing: $($entry.Name)"; continue }
                    $stream = $entry.Open(); $sha = [Security.Cryptography.SHA256]::Create()
                    try { $hash = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant() } finally { $stream.Dispose(); $sha.Dispose() }
                    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) { $missing += "Signing SDK file checksum mismatch: $($entry.Name)" }
                }
            } finally { $zip.Dispose() }
        }
    }
    default { $missing += 'SAVEDDESK_SIGN_PROVIDER (azure or store)' }
}
if ($Check) {
    @{provider=$provider; configured=($missing.Count -eq 0); missing=$missing; trusted_signature_verified=$false; note='Configuration check only; credentials, identity and public trust require actual signing and verification.'} | ConvertTo-Json
    if ($missing.Count) { exit 1 }; exit 0
}
if ($missing.Count) { throw ('Signing is not configured: ' + ($missing -join '; ')) }
if (-not $Path) { throw 'Provide the executable path.' }
$target = [IO.Path]::GetFullPath($Path)
if (-not $target.StartsWith($root + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($target) -ne '.exe' -or -not (Test-Path -LiteralPath $target -PathType Leaf)) { throw 'Sign only an existing project-owned EXE inside this checkout.' }
$signArguments = @('sign','/fd','SHA256','/td','SHA256')
if ($provider -eq 'store') { $signArguments += @('/s','My','/sha1',$certificate.Thumbprint,'/tr','http://timestamp.digicert.com') } else {
    $metadataPath = Join-Path $root '.cache/signing/azure-metadata.json'
    New-Item -ItemType Directory -Path (Split-Path -Parent $metadataPath) -Force | Out-Null
    @{Endpoint=$env:SAVEDDESK_SIGN_AZURE_ENDPOINT;CodeSigningAccountName=$env:SAVEDDESK_SIGN_AZURE_ACCOUNT;CertificateProfileName=$env:SAVEDDESK_SIGN_AZURE_PROFILE;ExcludeCredentials=@('EnvironmentCredential','ManagedIdentityCredential','WorkloadIdentityCredential','SharedTokenCacheCredential','VisualStudioCredential','VisualStudioCodeCredential','AzurePowerShellCredential','AzureDeveloperCliCredential','InteractiveBrowserCredential')} | ConvertTo-Json | Set-Content -LiteralPath $metadataPath -Encoding UTF8
    $signArguments += @('/tr','http://timestamp.acs.microsoft.com','/dlib',$env:SAVEDDESK_SIGN_DLIB_PATH,'/dmdf',$metadataPath)
}
& $signTool @signArguments $target
if ($LASTEXITCODE -ne 0) { throw 'Authenticode signing failed.' }
& $signTool verify /pa /all $target
if ($LASTEXITCODE -ne 0) { throw 'Windows signature verification failed.' }
$signature = Get-AuthenticodeSignature -LiteralPath $target
if ($signature.Status -ne 'Valid' -or -not $signature.TimeStamperCertificate -or $signature.SignerCertificate.Subject -eq $signature.SignerCertificate.Issuer) { throw 'Require a valid CA-issued timestamped signature.' }
Write-Output "Verified trusted timestamped signature: $target"
