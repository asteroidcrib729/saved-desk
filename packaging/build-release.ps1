param([string]$Tag, [switch]$CollectExisting, [switch]$RequireSigning, [switch]$PublicRelease, [string]$EvidenceDirectory)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    $python = Join-Path $projectRoot '.venv/Scripts/python.exe'
    $version = (& $python packaging/audit-repository.py --version).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Project version validation failed.' }
    & $python packaging/release-quarantine.py --check-version $version
    if ($LASTEXITCODE) { throw "Uncleared historical previews cannot be collected or published." }
    if (-not $Tag) { $Tag = "v$version" }
    & $python packaging/audit-repository.py --version --tag $Tag
    if ($LASTEXITCODE -ne 0) { throw 'Release tag/version mismatch.' }
    $output = Join-Path $projectRoot "release-artifacts/$Tag"
    if (Test-Path -LiteralPath $output) { throw "Release output already exists: $output. Keep immutable assets; choose a new version or archive this local output." }
    if (-not $EvidenceDirectory) { $EvidenceDirectory = Join-Path $projectRoot '.cache/release-acceptance' }
    if ($PublicRelease -and -not $RequireSigning) { throw 'PublicRelease requires RequireSigning and complete acceptance evidence.' }
    if ($PublicRelease) {
        $review = Get-Content -LiteralPath (Join-Path $projectRoot 'licensing/DEPENDENCIES.json') -Raw | ConvertFrom-Json
        if (-not $review.redistribution_cleared) { throw 'Public distribution is blocked by the documented corresponding-source/license review.' }
    }
    $started = [DateTime]::UtcNow
    if (-not $CollectExisting) {
        & (Join-Path $PSScriptRoot 'build-desktop.ps1') -RequireSigning:$RequireSigning
        if ($LASTEXITCODE -ne 0) { throw 'Release build failed.' }
    }
    $installer = Join-Path $projectRoot "desktop/src-tauri/target/release/bundle/nsis/SavedDesk_${version}_x64-setup.exe"
    if (-not (Test-Path -LiteralPath $installer) -or (-not $CollectExisting -and (Get-Item -LiteralPath $installer).LastWriteTimeUtc -lt $started.AddSeconds(-2))) { throw 'A fresh NSIS installer was not produced.' }
    New-Item -ItemType Directory -Path $output -Force | Out-Null
    Copy-Item -LiteralPath $installer -Destination $output
    Compress-Archive -Path (Join-Path $projectRoot 'browser-connector/chromium'),(Join-Path $projectRoot 'browser-connector/firefox') -DestinationPath (Join-Path $output "SavedDesk-connector-$version.zip")
    $commit = $null
    $sourceDirty = $null
    if (Test-Path -LiteralPath (Join-Path $projectRoot '.git')) {
        $revision = & git -C $projectRoot rev-parse --verify HEAD
        if ($LASTEXITCODE -ne 0) { throw 'Commit the source before collecting versioned Git release assets.' }
        $commit = ($revision | Select-Object -First 1).Trim()
        $sourceDirty = [bool](& git -C $projectRoot status --porcelain)
        if ($LASTEXITCODE -ne 0) { throw 'Source status inspection failed.' }
    }
    if ($PublicRelease -and (-not $commit -or $sourceDirty)) { throw 'A public release requires committed, clean source.' }
    & $python packaging/collect-licenses.py --sources
    if ($LASTEXITCODE) { throw 'License/source collection failed.' }
    if ($RequireSigning) { & (Join-Path $PSScriptRoot 'verify-release-signatures.ps1') -Installer $installer -EvidenceDirectory $EvidenceDirectory }
    $reviewArguments = @('packaging/release-evidence.py','--installer',$installer,'--output',$output,'--evidence',$EvidenceDirectory,'--pack')
    if ($PublicRelease) { $reviewArguments += '--require-ready' }
    & $python @reviewArguments
    if ($LASTEXITCODE) { throw 'Release evidence/source packaging failed. This directory is an incomplete review set, not a release.' }
    $acceptance = Get-Content -LiteralPath (Join-Path $output 'acceptance-review.json') -Raw | ConvertFrom-Json
    $assets = @(Get-ChildItem -LiteralPath $output -File | ForEach-Object {
        @{name=$_.Name; bytes=$_.Length; sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
    })
    $signature = Get-AuthenticodeSignature -LiteralPath $installer
    @{version=$version; tag=$Tag; source_commit=$commit; source_dirty=$sourceDirty; built_at_utc=[DateTime]::UtcNow.ToString('o');
      target='x86_64-pc-windows-msvc'; collected_existing=[bool]$CollectExisting; installer_last_write_utc=(Get-Item -LiteralPath $installer).LastWriteTimeUtc.ToString('o'); signature_status=$signature.Status.ToString(); public_release_ready=$acceptance.public_release_ready;
      gates=$acceptance.gates;
      assets=$assets} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $output 'release-manifest.json') -Encoding UTF8
    @("SavedDesk $version - Windows x64 development preview", '',
      'Install the NSIS setup executable. Microsoft''s signed x64 WebView2 offline installer is included and checked for fresh installs and upgrades; existing runtimes are reused.',
      'The Python worker, Node extraction runtime and browser connector are bundled. Gallery downloads require a separately installed Python environment; video preparation requires separately selected FFmpeg. See Settings > Download tools.',
      'The connector ZIP is for the documented unpacked/temporary browser setup; browser-store delivery remains pending.',
      'Original SavedDesk code is MIT licensed; bundled dependencies retain their own terms. Full notices and reviewed dependency source archives accompany this preview.',
      'This build remains a review preview until acceptance-review.json clears all gates. The acceptance report records payload licensing, signing and installation evidence; do not publish an incomplete bundle.',
      'The catalog is not encrypted. Account sessions are separately Windows-user protected. No automatic updater is configured.',
      'See development-plans/repository-and-releases.md in the source repository.') | Set-Content -LiteralPath (Join-Path $output 'release-notes.txt') -Encoding UTF8
    $checksumLines = @(Get-ChildItem -LiteralPath $output -File | Where-Object { $_.Name -ne 'SHA256SUMS.txt' } | Sort-Object Name | ForEach-Object {
        "{0}  {1}" -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(),$_.Name
    })
    $checksumLines | Set-Content -LiteralPath (Join-Path $output 'SHA256SUMS.txt') -Encoding ASCII
    Write-Output "Release review assets: $output"
} finally { Pop-Location }
