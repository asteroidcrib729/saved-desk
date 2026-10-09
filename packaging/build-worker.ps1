param([string]$PythonPath, [string]$NodePath, [string]$NodeLicensePath)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $PythonPath) { $PythonPath = Join-Path $projectRoot '.venv/Scripts/python.exe' }
$outputRoot = Join-Path $projectRoot 'desktop/src-tauri/resources/worker'
$buildRoot = Join-Path $projectRoot '.cache/worker-build'
$distRoot = Join-Path $projectRoot '.cache/worker-dist'
if (-not (Test-Path -LiteralPath $PythonPath)) { throw 'A build-time Python environment is required.' }
# YouTube runs the pinned engine's EJS scripts under Node's permission model.
# Node is launched only for extraction, never as an always-running frontend server.
if (-not $NodePath) { $NodePath = (Get-Command node.exe -ErrorAction Stop).Source }
$nodeVersion = (& $NodePath --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22) { throw 'YouTube packaging requires Node.js 22 or newer.' }
if (-not $NodeLicensePath) {
    $NodeLicensePath = Join-Path $projectRoot ".cache/node-runtime/$nodeVersion/LICENSE"
    if (-not (Test-Path -LiteralPath $NodeLicensePath)) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $NodeLicensePath) | Out-Null
        Invoke-WebRequest -Uri "https://raw.githubusercontent.com/nodejs/node/$nodeVersion/LICENSE" -OutFile $NodeLicensePath
    }
}
if (-not (Test-Path -LiteralPath $NodeLicensePath)) { throw 'The Node.js license must accompany the bundled runtime.' }
# Extractors and downloaders use dynamic imports; include their pinned modules.
& $PythonPath -m PyInstaller --noconfirm --onedir --name saveddesk-worker --paths (Join-Path $projectRoot 'backend/src') --exclude-module imageio_ffmpeg --exclude-module gallery_dl --collect-all yt_dlp --collect-all yt_dlp_ejs --distpath $distRoot --workpath $buildRoot --specpath $buildRoot (Join-Path $PSScriptRoot 'worker/entry.py')
if ($LASTEXITCODE -ne 0) { throw 'Worker packaging failed.' }
# Only this generated resource tree is replaced; user data never lives here.
$expectedRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'desktop/src-tauri/resources/worker'))
if ([IO.Path]::GetFullPath($outputRoot) -ne $expectedRoot) { throw 'Unexpected worker resource path.' }
if (Test-Path -LiteralPath $outputRoot) {
    if ((Get-Item -LiteralPath $outputRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refuse to replace a linked resource directory.' }
    Remove-Item -LiteralPath $outputRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $distRoot 'saveddesk-worker/saveddesk-worker.exe') -Destination $outputRoot -Force
Copy-Item -LiteralPath (Join-Path $distRoot 'saveddesk-worker/_internal') -Destination $outputRoot -Recurse -Force
# Ship only SavedDesk-owned adapter source, never its third-party environment.
$adapterRoot = Join-Path $outputRoot '_internal/external-adapter'
$adapterPackage = Join-Path $adapterRoot 'social_downloader'
New-Item -ItemType Directory -Force -Path $adapterPackage | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'external-adapter/entry.py') -Destination $adapterRoot -Force
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'backend/src/social_downloader') -File -Filter '*.py' | Copy-Item -Destination $adapterPackage -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'LICENSE') -Destination (Join-Path $adapterRoot 'LICENSE.txt') -Force
$runtimeRoot = Join-Path $outputRoot '_internal/runtime'
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
Copy-Item -LiteralPath $NodePath -Destination (Join-Path $runtimeRoot 'node.exe') -Force
Copy-Item -LiteralPath $NodeLicensePath -Destination (Join-Path $runtimeRoot 'LICENSE') -Force
$runtimeManifest = @{ version=$nodeVersion; sha256=(Get-FileHash -LiteralPath (Join-Path $runtimeRoot 'node.exe') -Algorithm SHA256).Hash }
$runtimeManifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeRoot 'runtime.json') -Encoding UTF8
if ($env:SAVEDDESK_SIGN_PROVIDER) {
    & (Join-Path $PSScriptRoot 'sign-windows.ps1') -Path (Join-Path $outputRoot 'saveddesk-worker.exe')
}
& $PythonPath (Join-Path $PSScriptRoot 'audit-worker-bundle.py') --write
if ($LASTEXITCODE -ne 0) { throw 'Worker payload exclusion/source audit failed.' }
Write-Output "Worker packaged: $outputRoot"
