[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot 'data\application.pid'
if (-not (Test-Path -LiteralPath $pidFile)) {
    Write-Host 'No managed background Vouch process was recorded.'
    return
}
$managedPid = 0
if (-not [int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$managedPid)) { throw 'Invalid Vouch process record.' }
$appProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $managedPid" -ErrorAction SilentlyContinue
if ($null -ne $appProcess) {
    $expectedEntry = Join-Path $PSScriptRoot 'server\index.ts'
    if ($appProcess.Name -ne 'node.exe' -or -not $appProcess.CommandLine.Contains($expectedEntry)) {
        throw 'The recorded process does not belong to this Vouch checkout; no process was stopped.'
    }
    Stop-Process -Id $managedPid -ErrorAction Stop
}
Remove-Item -LiteralPath $pidFile
Write-Host 'The managed background Vouch application has stopped.'
