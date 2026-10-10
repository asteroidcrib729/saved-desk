param([Parameter(Mandatory=$true)][string]$ReviewDirectory)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$review=[IO.Path]::GetFullPath($ReviewDirectory)
if(-not $review.StartsWith((Join-Path $root 'release-artifacts')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected preview directory.'}
$s=Get-Content -LiteralPath (Join-Path $review 'local-test-signing.json') -Raw | ConvertFrom-Json
$evidence=[IO.Path]::GetFullPath($s.test_directory)
if(-not $s.local_test_only -or $s.certificate_subject -ne 'CN=SavedDesk MSIX Preview' -or -not $evidence.StartsWith((Join-Path $root '.cache/msix-host')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Use reviewed preview evidence only.'}
if((Get-FileHash -LiteralPath $s.certificate_file).Hash.ToLowerInvariant() -ne $s.certificate_sha256){throw 'Certificate hash mismatch.'}
$cert=New-Object Security.Cryptography.X509Certificates.X509Certificate2($s.certificate_file)
if($cert.Subject -ne $s.certificate_subject -or $cert.Thumbprint -ne $s.certificate_thumbprint -or $cert.HasPrivateKey){throw 'Unexpected certificate.'}
$path='Cert:\LocalMachine\TrustedPeople\'+$cert.Thumbprint
$debugPath='Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
$createdKeys=@()
foreach($segment in @('Software\Policies\Microsoft\Edge','Software\Policies\Microsoft\Edge\WebView2',$debugPath)){if(-not (Test-Path -LiteralPath ('HKCU:\'+$segment))){$createdKeys+=$segment}}
$debugKey=$null;$hadArgument=$false;$previousArgument=$null;$previousKind=[Microsoft.Win32.RegistryValueKind]::String
$added=$false
$status=Join-Path $evidence 'trust-status.json';$stop=Join-Path $evidence 'trust-stop'
$record=@{ready=$false;removed=$false;added=$false;thumbprint=$cert.Thumbprint;store='LocalMachine TrustedPeople'}
try {
 if(-not (Test-Path -LiteralPath $path)){Import-Certificate -FilePath $s.certificate_file -CertStoreLocation Cert:\LocalMachine\TrustedPeople | Out-Null;$added=$true}
 $debugKey=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($debugPath)
 $hadArgument=$debugKey.GetValueNames() -contains 'saveddesk.exe'
 if($hadArgument){$previousArgument=$debugKey.GetValue('saveddesk.exe',$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames);$previousKind=$debugKey.GetValueKind('saveddesk.exe')}
 $listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0);$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
 $debugKey.SetValue('saveddesk.exe',"--remote-debugging-address=127.0.0.1 --remote-debugging-port=$port",[Microsoft.Win32.RegistryValueKind]::String)
 $record.debug_port=$port;$record.app_scoped_debug_setting=$true
 $record.ready=$true;$record.added=$added
 $record | ConvertTo-Json | Set-Content -LiteralPath $status -Encoding UTF8
 $limit=[DateTime]::UtcNow.AddMinutes(15)
 while(-not (Test-Path -LiteralPath $stop) -and [DateTime]::UtcNow -lt $limit){Start-Sleep -Seconds 1}
} catch {$record.error=$_.Exception.Message} finally {
 if($debugKey){try{if($hadArgument){$debugKey.SetValue('saveddesk.exe',$previousArgument,$previousKind)}else{$debugKey.DeleteValue('saveddesk.exe',$false)}}finally{$debugKey.Dispose()}}
 for($n=$createdKeys.Count-1;$n -ge 0;$n--){$key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($createdKeys[$n]);$empty=$false;try{$empty=$key -and $key.ValueCount -eq 0 -and $key.SubKeyCount -eq 0}finally{if($key){$key.Dispose()}};if($empty){[Microsoft.Win32.Registry]::CurrentUser.DeleteSubKey($createdKeys[$n],$false)}}
 $record.debug_setting_restored=$true
 if($added -and (Test-Path -LiteralPath $path)){Remove-Item -LiteralPath $path}
 $record.ready=$false;$record.removed=$added -and -not (Test-Path -LiteralPath $path)
 $record.finished_at_utc=[DateTime]::UtcNow.ToString('o')
 $record | ConvertTo-Json | Set-Content -LiteralPath $status -Encoding UTF8
}
