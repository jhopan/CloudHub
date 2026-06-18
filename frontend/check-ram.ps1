Write-Output "=== CloudHub RAM Usage ==="
Write-Output ""

$all = Get-Process -ErrorAction SilentlyContinue
$targets = @('node','postgres','storage-gateway','go','rclone')

foreach ($name in $targets) {
    $procs = $all | Where-Object { $_.ProcessName -eq $name }
    if ($procs) {
        $total = ($procs | Measure-Object WorkingSet64 -Sum).Sum / 1MB
        $count = ($procs | Measure-Object).Count
        $peak = ($procs | Sort-Object WorkingSet64 -Descending | Select-Object -First 1)
        $peakMB = [math]::Round($peak.WorkingSet64 / 1MB, 1)
        Write-Output "${name}: ${count} processes, Total=$([math]::Round($total,1))MB, Peak single=${peakMB}MB"
    } else {
        Write-Output "${name}: not running"
    }
}

Write-Output ""
Write-Output "--- Per Node Process ---"
$all | Where-Object { $_.ProcessName -eq 'node' } | ForEach-Object {
    $mb = [math]::Round($_.WorkingSet64 / 1MB, 1)
    $cmd = $_.MainModule.FileName 2>$null
    Write-Output "  PID:$($_.Id) RAM:${mb}MB"
}

Write-Output ""
Write-Output "--- Total System ---"
$os = Get-CimInstance Win32_OperatingSystem
$totalRAM = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
$freeRAM = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
$usedRAM = [math]::Round($totalRAM - $freeRAM, 1)
Write-Output "System Total: ${totalRAM}GB"
Write-Output "System Used: ${usedRAM}GB"
Write-Output "System Free: ${freeRAM}GB"
