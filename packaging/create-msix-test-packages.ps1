param([Parameter(Mandatory=$true)][string]$ReviewDirectory)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$reviewPath=[IO.Path]::GetFullPath($ReviewDirectory)
if(-not $reviewPath.StartsWith((Join-Path $root 'release-artifacts')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Use reviewed MSIX assets inside release-artifacts.'}
$review=Get-Content -LiteralPath (Join-Path $reviewPath 'msix-review.json') -Raw | ConvertFrom-Json
if($review.identity_name -ne 'SavedDesk.MsixPreview' -or $review.publisher -ne 'CN=SavedDesk MSIX Preview'){throw 'This script signs local previews only, never a Store identity.'}
$unsigned=Join-Path $reviewPath $review.package
if((Get-FileHash -LiteralPath $unsigned).Hash.ToLowerInvariant() -ne $review.package_sha256){throw 'Reviewed MSIX checksum mismatch.'}
$sdk=Get-ChildItem 'C:/Program Files (x86)/Windows Kits/10/bin' -Directory | Where-Object {$_.Name -match '^10\.0\.\d+\.0$' -and (Test-Path (Join-Path $_.FullName 'x64/signtool.exe'))} | Sort-Object {[version]$_.Name} -Descending | Select-Object -First 1
$sign=Join-Path $sdk.FullName 'x64/signtool.exe';$pack=Join-Path $sdk.FullName 'x64/makeappx.exe'
$test=Join-Path $root ('.cache/msix-host/'+[Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $test -Force | Out-Null
$stage=[IO.Path]::GetFullPath($review.staging)
if(-not $stage.StartsWith((Join-Path $root '.cache/msix-staging')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected staging path.'}
foreach($file in $review.files){
 $path=[IO.Path]::GetFullPath((Join-Path $stage $file.path))
 if(-not $path.StartsWith($stage+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or (Get-FileHash -LiteralPath $path).Hash.ToLowerInvariant() -ne $file.sha256){throw 'Reviewed MSIX staging differs from its file inventory.'}
}
$signed=Join-Path $reviewPath ("SavedDesk_$($review.version)_x64_local-test.msix")
$cer=Join-Path $reviewPath 'SavedDesk-MSIX-LOCAL-TEST.cer'
if((Test-Path -LiteralPath $signed) -or (Test-Path -LiteralPath $cer)){throw 'Test signing outputs already exist; retain immutable test assets.'}
$upgrade=Join-Path $test 'upgrade-test-only.msix'
$manifest=Join-Path $stage 'AppxManifest.xml';$original=[IO.File]::ReadAllBytes($manifest)
try {
 [xml]$xml=Get-Content -LiteralPath $manifest -Raw
 $v=[version]$review.version
 $upgradeVersion="$($v.Major).$($v.Minor).$($v.Build+1).0"
 $xml.Package.Identity.Version=$upgradeVersion
 $xml.Save($manifest)
 & $pack pack /d $stage /p $upgrade /o | Out-Null
 if($LASTEXITCODE){throw 'Upgrade test package build failed.'}
} finally {[IO.File]::WriteAllBytes($manifest,$original)}
$certificate=$null
try {
 $certificate=New-SelfSignedCertificate -Type Custom -Subject $review.publisher -FriendlyName 'SavedDesk MSIX LOCAL TEST ONLY' -KeyUsage DigitalSignature -KeyExportPolicy NonExportable -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddDays(30) -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3','2.5.29.19={text}')
 Export-Certificate -Cert $certificate -FilePath $cer | Out-Null
 Copy-Item -LiteralPath $unsigned -Destination $signed
 foreach($path in @($signed,$upgrade)) {
  & $sign sign /fd SHA256 /sha1 $certificate.Thumbprint /s My $path | Out-Null
  if($LASTEXITCODE){throw 'Local MSIX signing failed.'}
 }
 @{schema=1;local_test_only=$true;publicly_trusted=$false;store_submission_ready=$false;certificate_thumbprint=$certificate.Thumbprint;certificate_subject=$certificate.Subject;certificate_expires=$certificate.NotAfter.ToUniversalTime().ToString('o');certificate_file=$cer;certificate_sha256=(Get-FileHash -LiteralPath $cer).Hash.ToLowerInvariant();package=$signed;package_sha256=(Get-FileHash -LiteralPath $signed).Hash.ToLowerInvariant();upgrade_test_package=$upgrade;upgrade_test_sha256=(Get-FileHash -LiteralPath $upgrade).Hash.ToLowerInvariant();upgrade_test_version=$upgradeVersion;test_directory=$test;private_key_exported=$false} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $reviewPath 'local-test-signing.json') -Encoding UTF8
 Write-Output "Local test MSIX and public certificate: $reviewPath"
} finally {
 if($certificate){Remove-Item -LiteralPath ("Cert:\CurrentUser\My\"+$certificate.Thumbprint) -DeleteKey}
}
