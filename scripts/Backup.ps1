[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DataFile = Join-Path $ProjectRoot 'backend\Teaching-Timetable-Data.xlsx'
$BackupDirectory = Join-Path $ProjectRoot 'backend\backups'
if (-not (Test-Path -LiteralPath $DataFile -PathType Leaf)) {
    Write-Host "The timetable database was not found." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path -LiteralPath $BackupDirectory)) {
    New-Item -ItemType Directory -Path $BackupDirectory | Out-Null
}
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Destination = Join-Path $BackupDirectory "Teaching-Timetable-Data-$Stamp.xlsx"
Copy-Item -LiteralPath $DataFile -Destination $Destination
Write-Host "Backup created: $Destination" -ForegroundColor Green
