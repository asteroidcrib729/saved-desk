param([Parameter(Mandatory=$true)][string]$InstallDirectory)
$ErrorActionPreference='Stop'
$base=[IO.Path]::GetFullPath($InstallDirectory)
$worker=Join-Path $base 'worker'
$proof=Get-Content -LiteralPath (Join-Path $base 'licenses/BUNDLE-REVIEW.json') -Raw | ConvertFrom-Json
if (-not $proof.passed -or $proof.findings.Count) { throw 'Installed worker licensing proof failed.' }
$prefix=[IO.Path]::GetFullPath($worker)+[IO.Path]::DirectorySeparatorChar
$expected=@{}
foreach ($file in $proof.files) {
    $path=[IO.Path]::GetFullPath((Join-Path $worker $file.path))
    if (-not $path.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Installed worker payload path is invalid or absent.' }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) { throw 'Installed worker payload differs from reviewed content.' }
    $expected[$path.ToLowerInvariant()]=$true
}
foreach ($file in Get-ChildItem -LiteralPath $worker -Recurse -File) {
    if (-not $expected.ContainsKey($file.FullName.ToLowerInvariant())) { throw 'Installed worker contains an unreviewed stale payload file.' }
}
Write-Output 'Installed worker matches the complete exclusion and source-verification manifest.'
