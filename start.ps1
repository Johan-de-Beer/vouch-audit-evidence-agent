[CmdletBinding()]
param(
    [switch]$Development,
    [switch]$SkipBuild
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
        & $npmExe start
    }
    if ($LASTEXITCODE -ne 0) { throw "Vouch exited with code $LASTEXITCODE." }
}
finally {
    Pop-Location
}
