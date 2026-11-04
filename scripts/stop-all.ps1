# ==============================================================================
# FinTrack - Stop All Microservices (Ports 5001, 5002, 5003, 8000, 5173)
# ==============================================================================
# Usage:
#   .\scripts\stop-all.ps1
# ==============================================================================

Write-Host "`nStopping FinTrack microservices on ports 5001, 5002, 5003, 8000, 5173..." -ForegroundColor Yellow

$ports = @(5001, 5002, 5003, 8000, 5173)
$killedCount = 0

foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($procId in $pids) {
            try {
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                Write-Host "  -> Terminated process $procId listening on port $port" -ForegroundColor Green
                $killedCount++
            } catch {
                Write-Host "  -> Failed to stop process $procId on port $port" -ForegroundColor Red
            }
        }
    }
}

if ($killedCount -eq 0) {
    Write-Host "No active FinTrack processes were found listening on ports 5001-5003, 8000, or 5173." -ForegroundColor Gray
} else {
    Write-Host "`nSuccessfully terminated $killedCount service process(es). All ports are now free." -ForegroundColor Green
}
