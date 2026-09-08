# KiBee Pixel Agent Office PowerShell Launcher
$ErrorActionPreference = "Stop"

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "            KiBee Pixel Agent Office" -ForegroundColor Yellow
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""

$OfficeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $OfficeDir

if (Test-Path "$OfficeDir\.env") {
    Get-Content "$OfficeDir\.env" | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line.Split("=", 2)
            [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
        }
    }
}

Write-Host "Starting Pixel Agents Office server on port 3100..." -ForegroundColor Green
node "$OfficeDir\dist\cli.js" --port 3100
