param([Parameter(Mandatory=$true)][string]$InstallDirectory)
$ErrorActionPreference = 'Stop'
$expected = [IO.Path]::GetFullPath((Join-Path $InstallDirectory 'saveddesk-native-host.exe'))
$data = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'com.saveddesk.desktop'))
foreach ($browser in @('Google\Chrome','Microsoft\Edge','BraveSoftware\Brave-Browser','Vivaldi','Chromium','Mozilla')) {
    $key = "HKCU:\Software\$browser\NativeMessagingHosts\com.saveddesk.connector"
    if (-not (Test-Path -LiteralPath $key)) { continue }
    $manifest = (Get-Item -LiteralPath $key).GetValue('')
    try {
        $resolved = [IO.Path]::GetFullPath($manifest)
        if (-not $resolved.StartsWith($data + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $resolved -PathType Leaf)) { continue }
        $content = Get-Content -LiteralPath $resolved -Raw | ConvertFrom-Json
        if ($content.name -ne 'com.saveddesk.connector' -or [IO.Path]::GetFullPath($content.path) -ne $expected) { continue }
        # Remove only this installation's exact native-host key. Keep catalog, sessions,
        # manifests, downloaded files and other installations' registrations intact.
        Remove-Item -LiteralPath $key -ErrorAction Stop
    } catch { Write-Warning "Connector registration left unchanged for $browser; path ownership could not be verified." }
}
