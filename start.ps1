[CmdletBinding()]
param(
    [switch]$Development,
    [switch]$SkipBuild,
    [switch]$Background
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Push-Location -LiteralPath $PSScriptRoot
try {
    $nodeExe = (Get-Command node -ErrorAction Stop).Source
    $npmExe = (Get-Command npm.cmd -ErrorAction Stop).Source
    $nodeVersion = & $nodeExe --version
    if ($LASTEXITCODE -ne 0 -or [int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 24) {
        throw 'Vouch requires Node.js 24 or later. Install Node.js 24 and retry.'
    }

    if (-not (Test-Path -LiteralPath '.env')) {
        Copy-Item -LiteralPath '.env.example' -Destination '.env'
        Write-Host 'Created .env. The synthetic demonstration works without credentials.'
    }
    if (-not (Test-Path -LiteralPath 'node_modules')) {
        & $npmExe ci
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    }

    if ($Development -and $Background) { throw 'Use -Background for production, or -Development in a terminal.' }
    if ($Development) {
        Write-Host 'Starting Vouch development at http://127.0.0.1:5173'
        & $npmExe run dev
    }
    else {
        if (-not $SkipBuild -or -not (Test-Path -LiteralPath 'dist/index.html')) {
            & $npmExe run build
            if ($LASTEXITCODE -ne 0) { throw 'The production build failed.' }
        }
        Write-Host 'Starting Vouch. Default address: http://127.0.0.1:3001'
        if ($Background) {
            $runtimeFolder = Join-Path $PSScriptRoot 'data'
            New-Item -ItemType Directory -Force -Path $runtimeFolder | Out-Null
            $entryFile = Join-Path $PSScriptRoot 'server\index.ts'
            $pidFile = Join-Path $runtimeFolder 'application.pid'
            if (Test-Path -LiteralPath $pidFile) {
                $existingPid = 0
                if (-not [int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$existingPid)) { throw 'Invalid Vouch process record; inspect data/application.pid.' }
                $existingProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $existingPid" -ErrorAction SilentlyContinue
                if ($null -ne $existingProcess) {
                    if ($existingProcess.Name -ne 'node.exe' -or -not $existingProcess.CommandLine.Contains($entryFile)) { throw 'Recorded process identity differs; no process was changed.' }
                    Write-Host 'Vouch is already running. Use ./stop.ps1 before restarting or changing credentials.'
                    return
                }
            }
            $appProcess = Start-Process -FilePath $nodeExe -ArgumentList @('--import', 'tsx', ('"' + $entryFile + '"')) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeFolder 'application.stdout.log') -RedirectStandardError (Join-Path $runtimeFolder 'application.stderr.log')
            $appProcess.Id | Set-Content -LiteralPath (Join-Path $runtimeFolder 'application.pid')
            Write-Host 'Vouch is running in the background. Use ./stop.ps1 before restarting or changing credentials.'
            return
        }
        & $npmExe start
    }
    if ($LASTEXITCODE -ne 0) { throw "Vouch exited with code $LASTEXITCODE." }
}
finally {
    Pop-Location
}
