param([switch]$Dev, [switch]$Check, [switch]$Prototype, [switch]$RequireSigning, [switch]$ReuseWorker, [switch]$Msix)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if ($Msix -and ($Dev -or $Check -or $Prototype -or $RequireSigning)) { throw "Msix is a separate unsigned package build; do not combine it with other build modes." }
if ($Msix) {
    & (Join-Path $PSScriptRoot 'prepare-msix-runtime.ps1')
}
if (-not ($Dev -or $Check -or $Prototype -or $Msix)) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'prepare-webview-runtime.ps1')
    if ($LASTEXITCODE) { throw 'Verified offline WebView prerequisite is required before building.' }
}
if ($RequireSigning -or $env:SAVEDDESK_SIGN_PROVIDER) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'sign-windows.ps1') -Check
    if ($LASTEXITCODE) { throw 'Configure a real signing identity before requesting a signed build.' }
}
$localCargo = Join-Path $projectRoot '.tooling/cargo/bin/cargo.exe'
if (Test-Path -LiteralPath $localCargo) {
    $env:CARGO_HOME = Join-Path $projectRoot '.tooling/cargo'
    $env:RUSTUP_HOME = Join-Path $projectRoot '.tooling/rustup'
    $env:PATH = (Join-Path $projectRoot '.tooling/cargo/bin') + [IO.Path]::PathSeparator + $env:PATH
}
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$compilerInstall = if (Test-Path -LiteralPath $vswhere) { & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath }
if (-not $compilerInstall) { throw 'Complete Microsoft C++ Build Tools (Desktop development with C++) before building the native app.' }
$devShell = Join-Path $compilerInstall 'Common7/Tools/Launch-VsDevShell.ps1'
if (Test-Path -LiteralPath $devShell) { & $devShell -Arch amd64 -HostArch amd64 -SkipAutomaticLocation | Out-Null }
function Build-ConnectorHost([switch]$Release, [switch]$Embedded) {
    # Bootstrap the host without declaring its not-yet-built executable as a resource.
    $previousConfig = $env:TAURI_CONFIG
    try {
        if (-not (Test-Path -LiteralPath 'src-tauri/resources/saveddesk-native-host.exe')) { $env:TAURI_CONFIG = '{"bundle":{"resources":["resources/worker/","resources/browser-connector/"]}}' }
        $buildArguments = @('build','--locked','--manifest-path','src-tauri/Cargo.toml','--bin','saveddesk-native-host')
        if ($Release) { $buildArguments += '--release' }
        if ($Embedded) { $buildArguments += @('--features','custom-protocol') }
        cargo @buildArguments
        if ($LASTEXITCODE -ne 0) { throw 'Native connector host build failed.' }
        $configuration = if ($Release) { 'release' } else { 'debug' }
        if ($Release -and $env:SAVEDDESK_SIGN_PROVIDER) { & (Join-Path $PSScriptRoot 'sign-windows.ps1') -Path (Join-Path $projectRoot "desktop/src-tauri/target/$configuration/saveddesk-native-host.exe") }
        Copy-Item -LiteralPath "src-tauri/target/$configuration/saveddesk-native-host.exe" -Destination 'src-tauri/resources/saveddesk-native-host.exe' -Force
    } finally { $env:TAURI_CONFIG = $previousConfig }
}
function Reset-TargetResources([string]$Configuration) {
    # Tauri copies resources by merging. Remove only known generated staging trees
    # so a removed dependency cannot survive in a later standalone build or bundle.
    $target = [IO.Path]::GetFullPath((Join-Path $projectRoot "desktop/src-tauri/target/$Configuration"))
    foreach ($name in @('worker','browser-connector','licenses','maintenance','resources')) {
        $path = [IO.Path]::GetFullPath((Join-Path $target $name))
        if (-not $path.StartsWith($target + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected target resource path.' }
        if (Test-Path -LiteralPath $path) {
            $entries = @((Get-Item -LiteralPath $path)) + @(Get-ChildItem -LiteralPath $path -Recurse -Force)
            if ($entries | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'Refuse linked target resources.' }
            Remove-Item -LiteralPath $path -Recurse -Force
        }
    }
}
# Produce and audit the final worker before staging its license inventory.
if (-not ($Check -or $Prototype -or $Dev)) {
    if ($ReuseWorker) {
        # Reuse only a payload whose module exclusions and owned source hashes
        # still match the current source tree. Missing/stale proof fails closed.
        & (Join-Path $projectRoot '.venv/Scripts/python.exe') (Join-Path $PSScriptRoot 'audit-worker-bundle.py')
        if ($LASTEXITCODE) { throw 'The staged worker is stale or unaudited. Build it again without -ReuseWorker.' }
    } else {
        & (Join-Path $PSScriptRoot 'build-worker.ps1')
        if ($LASTEXITCODE) { throw 'Worker packaging failed.' }
    }
    $licenseArguments = @('--sources')
    if ($Msix) { $licenseArguments += @('--webview-mode','fixed-runtime','--require-complete') }
    & (Join-Path $projectRoot '.venv/Scripts/python.exe') (Join-Path $PSScriptRoot 'collect-licenses.py') @licenseArguments
} else {
    & (Join-Path $projectRoot '.venv/Scripts/python.exe') (Join-Path $PSScriptRoot 'collect-licenses.py')
}
if ($LASTEXITCODE) { throw 'License inventory generation failed.' }
$licenseOutput = Join-Path $projectRoot 'desktop/src-tauri/resources/licenses'
New-Item -ItemType Directory -Path $licenseOutput -Force | Out-Null
Copy-Item -Path (Join-Path $projectRoot 'licensing/*') -Destination $licenseOutput -Recurse -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'LICENSE') -Destination (Join-Path $licenseOutput 'SAVEDDESK-LICENSE.txt') -Force
Push-Location (Join-Path $projectRoot 'desktop')
try {
    node (Join-Path $projectRoot 'browser-connector/build.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Connector packaging failed.' }
    if ($Check) {
        if (-not (Test-Path -LiteralPath 'src-tauri/resources/saveddesk-native-host.exe')) { Build-ConnectorHost }
        # Rust's unit-test harness does not inherit the app's common-controls manifest.
        # rfd imports TaskDialogIndirect, which requires common-controls v6 on Windows.
        $artifacts = @(cargo test --locked --no-run --message-format=json --manifest-path src-tauri/Cargo.toml)
        if ($LASTEXITCODE -ne 0) {
            foreach ($line in $artifacts) { $diagnostic = $line | ConvertFrom-Json; if ($diagnostic.reason -eq 'compiler-message') { Write-Host $diagnostic.message.rendered } }
            throw 'Native test compilation failed.'
        }
        $targetRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'desktop/src-tauri/target')) + [IO.Path]::DirectorySeparatorChar
        foreach ($artifactLine in $artifacts) {
            $artifact = $artifactLine | ConvertFrom-Json
            if ($artifact.reason -eq 'compiler-artifact' -and $artifact.profile.test -and $artifact.executable) {
                $testExecutable = [IO.Path]::GetFullPath($artifact.executable)
                if (-not $testExecutable.StartsWith($targetRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected test executable path.' }
                mt.exe -nologo -manifest (Join-Path $PSScriptRoot 'windows-test.manifest') "-outputresource:$testExecutable;#1"
                if ($LASTEXITCODE -ne 0) { throw 'Windows test manifest embedding failed.' }
                # Run this harness directly. A second Cargo invocation can relink it
                # after resource timestamps change and discard the embedded manifest.
                & $testExecutable --nocapture
                if ($LASTEXITCODE -ne 0) { throw 'Native test execution failed.' }
            }
        }
    } elseif ($Prototype) {
        if (-not (Test-Path -LiteralPath 'out/index.html')) { throw 'Build the static frontend before the native prototype.' }
        Reset-TargetResources 'debug'
        Build-ConnectorHost -Embedded
        cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bins
        if ($LASTEXITCODE -ne 0) { throw 'Native prototype compilation failed.' }
        $workerSource = Join-Path $projectRoot 'desktop/src-tauri/resources/worker'
        if (-not (Test-Path -LiteralPath (Join-Path $workerSource 'saveddesk-worker.exe'))) { throw 'Package the worker before building the prototype.' }
        $prototypeWorker = [IO.Path]::GetFullPath((Join-Path $projectRoot 'desktop/src-tauri/target/debug/worker'))
        $prototypeRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'desktop/src-tauri/target/debug')) + [IO.Path]::DirectorySeparatorChar
        if (-not $prototypeWorker.StartsWith($prototypeRoot,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected prototype worker path.' }
        if (Test-Path -LiteralPath $prototypeWorker) {
            if ((Get-Item -LiteralPath $prototypeWorker).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refuse linked prototype resources.' }
            Remove-Item -LiteralPath $prototypeWorker -Recurse -Force
        }
        Copy-Item -LiteralPath $workerSource -Destination (Join-Path $projectRoot 'desktop/src-tauri/target/debug') -Recurse -Force
        Copy-Item -LiteralPath (Join-Path $projectRoot 'desktop/src-tauri/target/debug/saveddesk-native-host.exe') -Destination (Join-Path $projectRoot 'desktop/src-tauri/resources/saveddesk-native-host.exe') -Force
        Copy-Item -LiteralPath (Join-Path $projectRoot 'desktop/src-tauri/resources/browser-connector') -Destination (Join-Path $projectRoot 'desktop/src-tauri/target/debug') -Recurse -Force
        Copy-Item -LiteralPath $licenseOutput -Destination (Join-Path $projectRoot 'desktop/src-tauri/target/debug') -Recurse -Force
        $maintenance = Join-Path $projectRoot 'desktop/src-tauri/target/debug/maintenance'
        New-Item -ItemType Directory -Path $maintenance -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'unregister-connector.ps1') -Destination $maintenance

    } elseif ($Dev) {
        Build-ConnectorHost
        npm.cmd run desktop:dev
    } else {
        Reset-TargetResources 'release'
        npm.cmd run icons
        if ($LASTEXITCODE -ne 0) { throw 'Icon generation failed.' }
        Build-ConnectorHost -Release
        $priorSigningConfig = $env:TAURI_CONFIG
        try {
            if ($env:SAVEDDESK_SIGN_PROVIDER) {
                $config = if ($priorSigningConfig) { $priorSigningConfig | ConvertFrom-Json } else { [pscustomobject]@{} }
                if (-not $config.bundle) { $config | Add-Member bundle ([pscustomobject]@{}) }
                if (-not $config.bundle.windows) { $config.bundle | Add-Member windows ([pscustomobject]@{}) }
                $command = @{cmd='powershell.exe';args=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'sign-windows.ps1'),'-Path','%1')}
                $config.bundle.windows | Add-Member signCommand $command -Force
                $env:TAURI_CONFIG = $config | ConvertTo-Json -Depth 20 -Compress
            }
            if ($Msix) {
                $config = if ($priorSigningConfig) { $priorSigningConfig | ConvertFrom-Json } else { [pscustomobject]@{} }
                if (-not $config.bundle) { $config | Add-Member bundle ([pscustomobject]@{}) }
                if (-not $config.bundle.windows) { $config.bundle | Add-Member windows ([pscustomobject]@{}) }
                $config.bundle.windows | Add-Member webviewInstallMode ([pscustomobject]@{type='fixedRuntime';path='resources/webview2'}) -Force
                $env:TAURI_CONFIG = $config | ConvertTo-Json -Depth 20 -Compress
                npm.cmd run desktop:build -- --no-bundle
            } else {
                npm.cmd run desktop:build
            }
            if ($LASTEXITCODE) { throw 'Desktop installer build failed.' }
        } finally { $env:TAURI_CONFIG = $priorSigningConfig }
    }
    if (-not ($Check -or $Dev)) {
        $configuration = if ($Prototype) { 'debug' } else { 'release' }
        & (Join-Path $PSScriptRoot 'test-installed-payload.ps1') -InstallDirectory (Join-Path $projectRoot "desktop/src-tauri/target/$configuration")
    }
    if ($Msix) {
        $target = Join-Path $projectRoot 'desktop/src-tauri/target/release'
        @{schema=1;mode='msix-fixed-runtime';application_sha256=(Get-FileHash -LiteralPath (Join-Path $target 'saveddesk.exe')).Hash.ToLowerInvariant();host_sha256=(Get-FileHash -LiteralPath (Join-Path $target 'saveddesk-native-host.exe')).Hash.ToLowerInvariant();runtime_sha256=(Get-FileHash -LiteralPath (Join-Path $target 'resources/webview2/msedgewebview2.exe')).Hash.ToLowerInvariant()} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $target 'msix-build-review.json') -Encoding UTF8
    }
    if ($LASTEXITCODE -ne 0) { throw 'Desktop build/check failed.' }
} finally { Pop-Location }
