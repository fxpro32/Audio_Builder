# Audio Builder restart / stop for Windows 10/11 (W1_WINDOWS, R45). Called by restart_app.cmd and stop_app.cmd.
# Stops the process listening on port 8420 only if its command line contains server\server.mjs or server/server.mjs
# (anything else on that port is left alone and the script refuses), then starts the app again with start_app.mjs.
# -StopOnly: stop, do not start again.
param([switch]$StopOnly)
$Port = 8420
$owner = $null
if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    $owner = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -First 1
} else {
    # Fallback without the NetTCPIP module: netstat -ano, the listening line for :8420
    foreach ($line in (netstat -ano -p TCP)) {
        $f = -split $line.Trim()
        # a listening socket has a foreign address ending in :0 (the state word is translated on non-English Windows)
        if ($f.Count -ge 5 -and $f[0] -eq 'TCP' -and $f[1] -match (':' + $Port + '$') -and $f[2] -match ':0$') { $owner = [int]$f[4]; break }
    }
}
if ($owner) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $owner" -ErrorAction SilentlyContinue
    $cmdLine = if ($proc) { [string]$proc.CommandLine } else { '' }
    if ($cmdLine -match 'server[\\/]server\.mjs') {
        Write-Host "Stopping Audio_Builder server (PID $owner)"
        Stop-Process -Id $owner -ErrorAction SilentlyContinue
        Wait-Process -Id $owner -Timeout 5 -ErrorAction SilentlyContinue
    } else {
        Write-Host "Port $Port is used by something that is not the Audio_Builder server (PID $owner); not touching it."
        exit 1
    }
} else {
    Write-Host "No server running on $Port."
}
if ($StopOnly) { exit 0 }
& node (Join-Path $PSScriptRoot 'start_app.mjs')
exit $LASTEXITCODE
