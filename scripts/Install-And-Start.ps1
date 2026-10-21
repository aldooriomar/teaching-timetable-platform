[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 4310,
    [switch]$NoBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RuntimeDirectory = Join-Path $ProjectRoot '.runtime'
$PortableNodeHome = Join-Path $RuntimeDirectory 'node'
$PortableNode = Join-Path $PortableNodeHome 'node.exe'
$PortableNpm = Join-Path $PortableNodeHome 'npm.cmd'
$MinimumNodeVersion = [version]'20.12.0'

function Write-Step {
    param([string]$Text)
    Write-Host "`n$Text" -ForegroundColor Cyan
}

function Get-UsableNode {
    if (Test-Path -LiteralPath $PortableNode -PathType Leaf) {
        try {
            $Version = [version]((& $PortableNode --version).TrimStart('v'))
            if ($Version -ge $MinimumNodeVersion) {
                return [pscustomobject]@{ Node = $PortableNode; Npm = $PortableNpm; Version = $Version; Portable = $true }
            }
        }
        catch {}
    }

    $Command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($null -eq $Command) { $Command = Get-Command node -ErrorAction SilentlyContinue }
    if ($null -ne $Command) {
        try {
            $Version = [version]((& $Command.Source --version).TrimStart('v'))
            $NpmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
            if ($null -eq $NpmCommand) { $NpmCommand = Get-Command npm -ErrorAction SilentlyContinue }
            if ($Version -ge $MinimumNodeVersion -and $null -ne $NpmCommand) {
                return [pscustomobject]@{ Node = $Command.Source; Npm = $NpmCommand.Source; Version = $Version; Portable = $false }
            }
        }
        catch {}
    }
    return $null
}

function Install-PortableNode {
    Write-Step 'Downloading the official portable Node.js LTS runtime'
    $Architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    $FileTag = "win-$Architecture-zip"
    $Releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json'
    $Release = $Releases | Where-Object { $_.lts -and ($_.files -contains $FileTag) } | Select-Object -First 1
    if ($null -eq $Release) { throw "No official Node.js LTS $Architecture Windows ZIP release was found." }

    $Version = [string]$Release.version
    $ArchiveName = "node-$Version-win-$Architecture.zip"
    $DownloadBase = "https://nodejs.org/dist/$Version"
    $DownloadDirectory = Join-Path $RuntimeDirectory 'downloads'
    $ArchivePath = Join-Path $DownloadDirectory $ArchiveName
    $ChecksumPath = Join-Path $DownloadDirectory "node-$Version-SHASUMS256.txt"
    $Staging = Join-Path $RuntimeDirectory 'node-staging'

    New-Item -ItemType Directory -Path $DownloadDirectory -Force | Out-Null
    Invoke-WebRequest -Uri "$DownloadBase/$ArchiveName" -OutFile $ArchivePath -UseBasicParsing
    Invoke-WebRequest -Uri "$DownloadBase/SHASUMS256.txt" -OutFile $ChecksumPath -UseBasicParsing

    $EscapedArchiveName = [regex]::Escape($ArchiveName)
    $ChecksumLine = Get-Content -LiteralPath $ChecksumPath | Where-Object { $_ -match "^\s*([a-fA-F0-9]{64})\s+$EscapedArchiveName\s*$" } | Select-Object -First 1
    if (-not $ChecksumLine) { throw 'The official Node.js checksum could not be located.' }
    $ExpectedHash = ($ChecksumLine -split '\s+')[0]
    $ActualHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash
    if ($ActualHash -ne $ExpectedHash) { throw 'Node.js checksum verification failed. Nothing was installed.' }

    if (Test-Path -LiteralPath $Staging) { Remove-Item -LiteralPath $Staging -Recurse -Force }
    if (Test-Path -LiteralPath $PortableNodeHome) { Remove-Item -LiteralPath $PortableNodeHome -Recurse -Force }
    New-Item -ItemType Directory -Path $Staging -Force | Out-Null
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $Staging -Force
    $ExtractedRoot = Get-ChildItem -LiteralPath $Staging -Directory | Select-Object -First 1
    if ($null -eq $ExtractedRoot) { throw 'The portable Node.js archive did not contain the expected folder.' }
    Move-Item -LiteralPath $ExtractedRoot.FullName -Destination $PortableNodeHome
    Remove-Item -LiteralPath $Staging -Recurse -Force
    if (-not (Test-Path -LiteralPath $PortableNode -PathType Leaf)) { throw 'Portable Node.js extraction did not complete.' }
    Write-Host "Portable Node.js $Version installed inside the application folder. No administrator rights were used." -ForegroundColor Green
}

try {
    Write-Host 'Teaching Timetable Platform v3.0.0' -ForegroundColor Green
    Write-Host 'ABOUT: Omar Al-Doori (BUV) 2026'
    Write-Host "Folder: $ProjectRoot"

    if ($env:OS -ne 'Windows_NT') { throw 'This installation package requires Windows 10 or Windows 11.' }
    if ($PSVersionTable.PSVersion.Major -lt 5) { throw 'Windows PowerShell 5.1 or newer is required.' }

    Write-Step 'Checking the package and local computer'
    $RequiredFiles = @(
        'server.mjs', 'excel-store.mjs', 'package.json', 'package-lock.json', 'ABOUT.txt',
        'backend\Teaching-Timetable-Data.xlsx', 'frontend\index.html', 'frontend\app.js',
        'frontend\styles.css', 'frontend\admin.html', 'tests\smoke.test.mjs'
    )
    foreach ($RelativePath in $RequiredFiles) {
        if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot $RelativePath) -PathType Leaf)) {
            throw "Missing required package file: $RelativePath"
        }
    }
    Get-ChildItem -LiteralPath $ProjectRoot -Recurse -File | ForEach-Object {
        try { Unblock-File -LiteralPath $_.FullName -ErrorAction Stop } catch {}
    }
    @($RuntimeDirectory, (Join-Path $ProjectRoot 'logs'), (Join-Path $ProjectRoot 'backend\backups')) | ForEach-Object {
        New-Item -ItemType Directory -Path $_ -Force | Out-Null
    }

    $Runtime = Get-UsableNode
    if ($null -eq $Runtime) {
        Install-PortableNode
        $Runtime = Get-UsableNode
    }
    if ($null -eq $Runtime) { throw 'Node.js could not be prepared.' }
    Write-Host "Node.js $($Runtime.Version) verified." -ForegroundColor Green
    $NodePath = $Runtime.Node
    $NpmPath = $Runtime.Npm

    Write-Step 'Installing the locked Excel reader dependency'
    $LockFile = Join-Path $ProjectRoot 'package-lock.json'
    $LockHash = (Get-FileHash -LiteralPath $LockFile -Algorithm SHA256).Hash
    $SavedHashFile = Join-Path $RuntimeDirectory 'package-lock.sha256'
    $DependencyFile = Join-Path $ProjectRoot 'node_modules\read-excel-file\package.json'
    $SavedHash = if (Test-Path -LiteralPath $SavedHashFile) { (Get-Content -LiteralPath $SavedHashFile -Raw).Trim() } else { '' }
    if (-not (Test-Path -LiteralPath $DependencyFile) -or $SavedHash -ne $LockHash) {
        Push-Location $ProjectRoot
        try {
            & $NpmPath ci --omit=optional --ignore-scripts
            if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed with exit code $LASTEXITCODE." }
        }
        finally { Pop-Location }
        Set-Content -LiteralPath $SavedHashFile -Value $LockHash -Encoding ascii
    }
    else {
        Write-Host 'Dependencies already match the verified lock file.' -ForegroundColor Green
    }

    Write-Step 'Running code, Excel and live-service tests'
    Push-Location $ProjectRoot
    try {
        & $NodePath --check 'server.mjs'
        if ($LASTEXITCODE -ne 0) { throw 'Server code validation failed.' }
        & $NodePath --check 'excel-store.mjs'
        if ($LASTEXITCODE -ne 0) { throw 'Excel reader validation failed.' }
        & $NodePath --test 'tests\smoke.test.mjs'
        if ($LASTEXITCODE -ne 0) { throw 'The platform test failed.' }
    }
    finally { Pop-Location }

    Write-Step 'Starting the local platform'
    & (Join-Path $PSScriptRoot 'Start.ps1') -Port $Port -NoBrowser

    $Url = "http://127.0.0.1:$Port"
    $Health = Invoke-RestMethod -Uri "$Url/api/health" -TimeoutSec 4
    if ($Health.status -ne 'ok') { throw 'The service started but the Excel backend is not healthy.' }

    Write-Host "`nInstallation and verification completed successfully." -ForegroundColor Green
    Write-Host "Dashboard: $Url"
    Write-Host "Excel control: $Url/admin"
    Write-Host 'Live workbook: backend\Teaching-Timetable-Data.xlsx'
    Write-Host 'Use INSTALL-AND-START.bat again whenever you want to open the platform.'
    if (-not $NoBrowser) { Start-Process $Url }
}
catch {
    Write-Host "`nSetup stopped: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Review logs\server-error.log if the service reached the start stage.' -ForegroundColor Yellow
    exit 1
}
