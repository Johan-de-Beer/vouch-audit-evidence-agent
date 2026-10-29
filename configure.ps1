[CmdletBinding()]
param(
    [ValidateSet('Meta', 'Baseten', 'Both')]
    [string]$Provider = 'Both'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Read-Host keeps credentials out of terminal output and command history.
# This writes the same private, Git-ignored .env consumed by the server.
$envPath = Join-Path $PSScriptRoot '.env'
$templatePath = Join-Path $PSScriptRoot '.env.example'
$envText = if (Test-Path -LiteralPath $envPath) {
    [IO.File]::ReadAllText($envPath)
} else {
    [IO.File]::ReadAllText($templatePath)
}
$newLine = if ($envText.Contains("`r`n")) { "`r`n" } else { "`n" }
$updated = $false
$providers = @()
if ($Provider -in @('Meta', 'Both')) { $providers += @{ Name = 'Meta'; Variable = 'MODEL_API_KEY' } }
if ($Provider -in @('Baseten', 'Both')) { $providers += @{ Name = 'Baseten'; Variable = 'BASETEN_API_KEY' } }

Write-Host 'Enter each API key in the hidden prompt. Leave blank to keep its current value.'
foreach ($item in $providers) {
    $providerName = $item.Name
    $variableName = $item.Variable
    $secret = Read-Host "$providerName API key" -AsSecureString
    $pointer = [IntPtr]::Zero
    $plainText = $null
    try {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        $plainText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        if ([string]::IsNullOrWhiteSpace($plainText)) { continue }
        if ($plainText -notmatch '^[a-zA-Z0-9._~+/=:-]+$') {
            throw "$providerName key contains unexpected characters. Nothing was saved; copy only the API key."
        }
        $replacement = $variableName + '="' + $plainText + '"'
        $pattern = '(?m)^[\t ]*(?:export[\t ]+)?' + [regex]::Escape($variableName) + '[\t ]*=.*\r?$'
        if ([regex]::IsMatch($envText, $pattern)) {
            $envText = [regex]::Replace($envText, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $replacement })
        } else {
            if (-not $envText.EndsWith("`n")) { $envText += $newLine }
            $envText += $replacement + $newLine
        }
        $updated = $true
    }
    finally {
        $plainText = $null
        if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        $secret.Dispose()
    }
}

if ($updated) {
    [IO.File]::WriteAllText($envPath, $envText, [Text.UTF8Encoding]::new($false))
    Write-Host 'Saved to the local .env. No key was printed or sent anywhere.'
    Write-Host 'Next: npm run live:preflight. Restart Vouch afterward with ./stop.ps1 and ./start.ps1 -SkipBuild -Background.'
} else {
    Write-Host 'No keys changed.'
}
$envText = $null
