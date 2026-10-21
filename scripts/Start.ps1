[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 4310,
    [switch]$NoBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RuntimeDirectory = Join-Path $ProjectRoot '.runtime'
$LogDirectory = Join-Path $ProjectRoot 'logs'
$PidFile = Join-Path $RuntimeDirectory 'server.pid'
$OutLog = Join-Path $LogDirectory 'server-output.log'
$ErrorLog = Join-Path $LogDirectory 'server-error.log'
$PortableNode = Join-Path $RuntimeDirectory 'node\node.exe'
$Url = "http://127.0.0.1:$Port"

$NodePath = if (Test-Path -LiteralPath $PortableNode -PathType Leaf) {
    $PortableNode
}
else {
    $NodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($null -eq $NodeCommand) { $NodeCommand = Get-Command node -ErrorAction SilentlyContinue }
    if ($null -eq $NodeCommand) { throw 'Node.js is unavailable. Run INSTALL-AND-START.bat.' }
    $NodeCommand.Source
}

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'node_modules\read-excel-file\package.json'))) {
    throw 'The Excel reader dependency is unavailable. Run INSTALL-AND-START.bat.'
}

@($RuntimeDirectory, $LogDirectory) | ForEach-Object { New-Item -ItemType Directory -Path $_ -Force | Out-Null }

if (Test-Path -LiteralPath $PidFile) {
    $ExistingPidText = (Get-Content -LiteralPath $PidFile -Raw).Trim()
    if ($ExistingPidText -match '^\d+$') {
        $ExistingProcess = Get-Process -Id ([int]$ExistingPidText) -ErrorAction SilentlyContinue
        if ($null -ne $ExistingProcess -and $ExistingProcess.ProcessName -match '^node') {
            try {
                $Health = Invoke-RestMethod -Uri "$Url/api/health" -TimeoutSec 2
                if ($Health.status -eq 'ok') {
                    Write-Host "Teaching Timetable is already running at $Url" -ForegroundColor Green
                    if (-not $NoBrowser) { Start-Process $Url }
                    exit 0
                }
            }
            catch {}
        }
    }
    Remove-Item -LiteralPath $PidFile -Force
}

$env:PORT = $Port.ToString()
$env:HOST = '127.0.0.1'
$ServerProcess = Start-Process -FilePath $NodePath -ArgumentList @('server.mjs') -WorkingDirectory $ProjectRoot -RedirectStandardOutput $OutLog -RedirectStandardError $ErrorLog -WindowStyle Hidden -PassThru
Set-Content -LiteralPath $PidFile -Value $ServerProcess.Id -Encoding ascii

$Ready = $false
for ($Attempt = 1; $Attempt -le 80; $Attempt++) {
    Start-Sleep -Milliseconds 250
    if ($ServerProcess.HasExited) { break }
    try {
        $Health = Invoke-RestMethod -Uri "$Url/api/health" -TimeoutSec 1
        if ($Health.status -eq 'ok') { $Ready = $true; break }
    }
    catch {}
}

if (-not $Ready) {
    if (-not $ServerProcess.HasExited) { Stop-Process -Id $ServerProcess.Id -Force }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    Write-Host "The timetable did not start. Review: $ErrorLog" -ForegroundColor Red
    if (Test-Path -LiteralPath $ErrorLog) { Get-Content -LiteralPath $ErrorLog -Tail 30 }
    exit 1
}

Write-Host 'Teaching Timetable is running.' -ForegroundColor Green
Write-Host "Dashboard: $Url"
Write-Host "Excel control: $Url/admin"
Write-Host 'Edit data: scripts\Edit-Data.ps1'
Write-Host 'Stop service: scripts\Stop.ps1'
if (-not $NoBrowser) { Start-Process $Url }
