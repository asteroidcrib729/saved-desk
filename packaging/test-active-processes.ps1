# Installer tests refuse owner-app processes; explicitly frozen debug fixtures are independent.
function Get-UnisolatedSavedDeskProcesses([string]$ProjectRoot) {
    $processes=@(Get-CimInstance Win32_Process)
    $active=@(Get-Process saveddesk,saveddesk-worker,saveddesk-native-host -ErrorAction SilentlyContinue)
    $fixtureRoot=[IO.Path]::GetFullPath((Join-Path $ProjectRoot '.cache/native-soak'))+[IO.Path]::DirectorySeparatorChar
    foreach($process in $active) {
        $isolated=$false
        # A worker is independent only when its own executable and actual ancestor app
        # both live under the same UUID fixture application directory. No environment
        # claim or image name alone authorizes ignoring an active process.
        if($process.ProcessName -eq 'saveddesk-worker' -and $process.Path) {
            $path=[IO.Path]::GetFullPath($process.Path)
            if($path.StartsWith($fixtureRoot,[StringComparison]::OrdinalIgnoreCase)) {
                $relative=$path.Substring($fixtureRoot.Length)
                if($relative -match '^([0-9a-f-]{36})\\application\\worker\\saveddesk-worker\.exe$') {
                    $fixtureApp=Join-Path $fixtureRoot ($Matches[1]+'\application\saveddesk-soak.exe')
                    $pidToCheck=$process.Id
                    for($depth=0;$depth -lt 8;$depth++) {
                        $item=$processes | Where-Object ProcessId -eq $pidToCheck | Select-Object -First 1
                        if(-not $item){break}
                        if($item.ExecutablePath -and [IO.Path]::GetFullPath($item.ExecutablePath) -eq $fixtureApp){$isolated=$true;break}
                        $pidToCheck=$item.ParentProcessId
                    }
                }
            }
        }
        if(-not $isolated){$process}
    }
}
