param(
    [string]$InstallDirectory,
    [string]$ConnectorDirectory,
    [switch]$Remove,
    [switch]$TestMode,
    [string]$RegistryBase = 'HKCU:\Software'
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$legacyInvocation = $InstallDirectory -and -not $ConnectorDirectory
$removeOwned = $Remove -or $legacyInvocation
$documents = [IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'SavedDesk Browser Connector')).TrimEnd('\')
$legacy = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'com.saveddesk.desktop')).TrimEnd('\')
if (-not $ConnectorDirectory) { $ConnectorDirectory = if ($legacyInvocation) { $legacy } else { $documents } }
$connectorRoot = [IO.Path]::GetFullPath($ConnectorDirectory).TrimEnd('\')
if ($TestMode) {
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (-not $connectorRoot.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or
        $RegistryBase -notmatch '^HKCU:\\Software\\SavedDesk\\CertificationTests\\[0-9a-f-]{36}$') { throw 'Tests require a disposable Temp directory and isolated certification registry prefix.' }
} elseif ($connectorRoot -notin @($documents,$legacy) -or $RegistryBase -ne 'HKCU:\Software') {
    throw 'Refusing an unrelated connector directory or registry prefix.'
}
$expectedHost = if ($InstallDirectory) { [IO.Path]::GetFullPath((Join-Path $InstallDirectory 'saveddesk-native-host.exe')) } else { $null }
$removedKeys = [Collections.Generic.List[string]]::new()
$removedFiles = [Collections.Generic.List[string]]::new()
$preserved = [Collections.Generic.List[string]]::new()
$ownedManifests = [Collections.Generic.List[string]]::new()
function Assert-OwnedPath([string]$Path) {
    $absolute = [IO.Path]::GetFullPath($Path)
    if ($absolute -ne $connectorRoot -and -not $absolute.StartsWith($connectorRoot+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Path escaped the connector folder.' }
    # Check every existing ancestor, including redirected Documents parents.
    $cursor = $absolute
    while ($cursor) {
        if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Refusing a linked connector path.' }
        $parent = [IO.Path]::GetDirectoryName($cursor)
        if ($parent -eq $cursor) { break }; $cursor = $parent
    }
    return $absolute
}
function Read-OwnedManifest([string]$Path) {
    $null=Assert-OwnedPath $Path
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    if ((Get-Item -LiteralPath $Path).Length -gt 16384) { return $null }
    try { $value=Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $null }
    if ($value.name -ne 'com.saveddesk.connector' -or $value.type -ne 'stdio') { return $null }
    $hostPath=[IO.Path]::GetFullPath($value.path)
    if ($expectedHost -and $hostPath -eq $expectedHost) { return $value }
    if ($hostPath.StartsWith($connectorRoot+'\connector-bin\',[StringComparison]::OrdinalIgnoreCase) -and
        [IO.Path]::GetFileName($hostPath) -eq 'saveddesk-native-host.exe' -and
        [IO.Path]::GetFileName([IO.Path]::GetDirectoryName($hostPath)) -match '^[0-9a-f]{64}$') {
        $null=Assert-OwnedPath $hostPath; return $value
    }
    return $null
}
function Remove-OwnedFile([string]$Path) {
    $null=Assert-OwnedPath $Path
    if ($removeOwned -and (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Remove-Item -LiteralPath $Path -Force -ErrorAction Stop
        $removedFiles.Add($Path)
    }
}
function Remove-EmptyDirectory([string]$Path) {
    $null=Assert-OwnedPath $Path
    if ($removeOwned -and (Test-Path -LiteralPath $Path -PathType Container) -and -not @(Get-ChildItem -LiteralPath $Path -Force).Count) {
        Remove-Item -LiteralPath $Path -ErrorAction Stop
    }
}
$null=Assert-OwnedPath $connectorRoot
foreach ($entry in @(@('chrome','Google\Chrome'),@('edge','Microsoft\Edge'),@('brave','BraveSoftware\Brave-Browser'),@('vivaldi','Vivaldi'),@('chromium','Chromium'),@('firefox','Mozilla'))) {
    $manifest=Join-Path $connectorRoot ('connector-'+$entry[0]+'.json')
    $value=Read-OwnedManifest $manifest
    if ($value) { $ownedManifests.Add($manifest) }
    $key=$RegistryBase+'\'+$entry[1]+'\NativeMessagingHosts\com.saveddesk.connector'
    if (-not (Test-Path -LiteralPath $key)) { continue }
    $registered=(Get-Item -LiteralPath $key).GetValue('')
    if ($registered -and [IO.Path]::GetFullPath($registered) -eq $manifest -and $value) {
        if ((Get-Item -LiteralPath $key).GetSubKeyNames().Count) { throw 'Unexpected children in an owned registration; manual review required.' }
        if ($removeOwned) { Remove-Item -LiteralPath $key -ErrorAction Stop; $removedKeys.Add($key) }
    }
}
if ($Remove) {
    foreach ($manifest in $ownedManifests) { Remove-OwnedFile $manifest }
    $bins=Join-Path $connectorRoot 'connector-bin'
    if (Test-Path -LiteralPath $bins) {
        $null=Assert-OwnedPath $bins
        foreach ($folder in Get-ChildItem -LiteralPath $bins -Directory -Force) {
            $null=Assert-OwnedPath $folder.FullName
            $hostFile=Join-Path $folder.FullName 'saveddesk-native-host.exe'
            if ($folder.Name -match '^[0-9a-f]{64}$' -and (Test-Path -LiteralPath $hostFile -PathType Leaf)) {
                $null=Assert-OwnedPath $hostFile
                if ((Get-FileHash -LiteralPath $hostFile -Algorithm SHA256).Hash.ToLowerInvariant() -eq $folder.Name) { Remove-OwnedFile $hostFile }
                else { $preserved.Add($hostFile) }
            }
            Remove-EmptyDirectory $folder.FullName
        }
        Remove-EmptyDirectory $bins
    }
    $extensions=Join-Path $connectorRoot 'browser-extensions'
    if (Test-Path -LiteralPath $extensions) {
        $null=Assert-OwnedPath $extensions
        foreach ($browser in @('chrome','edge','brave','vivaldi','chromium','firefox')) {
            $browserPath=Join-Path $extensions $browser
            if (-not (Test-Path -LiteralPath $browserPath)) { continue }; $null=Assert-OwnedPath $browserPath
            foreach ($folder in Get-ChildItem -LiteralPath $browserPath -Directory -Force) {
                $null=Assert-OwnedPath $folder.FullName
                if ($folder.Name -notmatch '^[0-9a-f]{64}$') { $preserved.Add($folder.FullName); continue }
                $names=@('manifest.json','popup.html','popup.js','popup.css'); $stream=[IO.MemoryStream]::new(); $valid=$true
                try {
                    foreach ($name in $names) {
                        $file=Join-Path $folder.FullName $name; $null=Assert-OwnedPath $file
                        if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or (Get-Item -LiteralPath $file).Length -gt 1MB) { $valid=$false; break }
                        $bytes=[Text.Encoding]::UTF8.GetBytes($name); $stream.Write($bytes,0,$bytes.Length)
                        $bytes=[IO.File]::ReadAllBytes($file); $stream.Write($bytes,0,$bytes.Length)
                    }
                    if ($valid) {
                        $sha=[Security.Cryptography.SHA256]::Create(); $actual=([BitConverter]::ToString($sha.ComputeHash($stream.ToArray()))).Replace('-','').ToLowerInvariant(); $sha.Dispose()
                        $valid=$actual -eq $folder.Name
                    }
                } finally { $stream.Dispose() }
                if ($valid) { foreach ($name in $names) { Remove-OwnedFile (Join-Path $folder.FullName $name) } }
                else { $preserved.Add($folder.FullName) }
                Remove-EmptyDirectory $folder.FullName
            }
            Remove-EmptyDirectory $browserPath
        }
        Remove-EmptyDirectory $extensions
    }
    # The helper is a reserved owned filename. Leave its directory and any unknown files.
    Remove-OwnedFile (Join-Path $connectorRoot 'Remove-SavedDesk-Connector.ps1')
}
[pscustomobject]@{schema=1;removed=$removeOwned;directory=$connectorRoot;removedKeys=@($removedKeys);removedFiles=@($removedFiles);preservedChangedArtifacts=@($preserved);libraryAndAccountDataRemoved=$false} | ConvertTo-Json -Depth 5
