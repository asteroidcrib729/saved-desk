param([Parameter(Mandatory=$true)][string]$ReviewDirectory,[switch]$Run)
$ErrorActionPreference='Stop'
if(-not $Run){throw 'Use -Run only after authorizing temporary local-machine preview trust and Windows UAC.'}
$root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$review=[IO.Path]::GetFullPath($ReviewDirectory)
if(-not $review.StartsWith((Join-Path $root 'release-artifacts')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected preview directory.'}
$s=Get-Content -LiteralPath (Join-Path $review 'local-test-signing.json') -Raw | ConvertFrom-Json
$evidence=[IO.Path]::GetFullPath($s.test_directory)
if(-not $evidence.StartsWith((Join-Path $root '.cache/msix-host')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected QA directory.'}
$status=Join-Path $evidence 'trust-status.json';$stop=Join-Path $evidence 'trust-stop'
if(Test-Path -LiteralPath $status){
 $previous=Get-Content -LiteralPath $status -Raw | ConvertFrom-Json
 if($previous.ready -or ($previous.added -and -not $previous.removed)){throw 'Previous temporary trust is still active; inspect its evidence.'}
 $attempt=[Guid]::NewGuid().ToString()
 Move-Item -LiteralPath $status -Destination ($status+'.'+$attempt)
 if(Test-Path -LiteralPath $stop){Move-Item -LiteralPath $stop -Destination ($stop+'.'+$attempt)}
 $hostReport=Join-Path $evidence 'msix-host.json'
 if(Test-Path -LiteralPath $hostReport){Move-Item -LiteralPath $hostReport -Destination ($hostReport+'.'+$attempt)}
}
$helper=Join-Path $PSScriptRoot 'msix-test-trust-helper.ps1'
$command="& '"+$helper.Replace("'","''")+"' -ReviewDirectory '"+$review.Replace("'","''")+"'"
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
$admin=Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',$encoded) -Verb RunAs -WindowStyle Hidden -PassThru
$passed=$false
try {
 $limit=[DateTime]::UtcNow.AddMinutes(2)
 while(-not (Test-Path -LiteralPath $status) -and -not $admin.HasExited -and [DateTime]::UtcNow -lt $limit){Start-Sleep -Seconds 1}
 if(-not (Test-Path -LiteralPath $status)){throw 'Administrator trust helper did not become ready.'}
 $record=Get-Content -LiteralPath $status -Raw | ConvertFrom-Json
 if(-not $record.ready){throw ('Trust helper failed: '+$record.error)}
 $runner=Join-Path $PSScriptRoot 'test-msix-host.ps1'
 & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File $runner -ReviewDirectory $review -Run
 if($LASTEXITCODE){throw 'MSIX host acceptance failed; inspect msix-host.json.'}
 $passed=$true
} finally {
 [IO.File]::WriteAllText($stop,'test finished')
 if(-not $admin.WaitForExit(60000)){throw 'Trust removal is still pending; do not leave the preview certificate trusted.'}
 $record=Get-Content -LiteralPath $status -Raw | ConvertFrom-Json
 if($record.added -and -not $record.removed){throw 'Temporary machine certificate trust was not removed.'}
 Write-Output ('Temporary preview trust removed: '+$record.removed)
}
if(-not $passed){exit 1}
