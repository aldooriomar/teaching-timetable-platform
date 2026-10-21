[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Workbook = Join-Path $ProjectRoot 'backend\Teaching-Timetable-Data.xlsx'
if (-not (Test-Path -LiteralPath $Workbook -PathType Leaf)) {
    Write-Host "The Excel backend was not found: $Workbook" -ForegroundColor Red
    exit 1
}

Write-Host "Opening the live Excel backend:" -ForegroundColor Cyan
Write-Host $Workbook
Start-Process -FilePath $Workbook
