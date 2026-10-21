[CmdletBinding()]
param(
    [string]$ProjectRoot = '',
    [string]$RepositoryUrl = 'https://github.com/aldooriomar/teaching-timetable-platform.git',
    [string]$Branch = 'main'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Step {
    param([string]$Text)
    Write-Host "`n$Text" -ForegroundColor Cyan
}

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    & $script:GitExe @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Git command failed: git $($Arguments -join ' ')"
    }
}

function Find-ProjectRoot {
    param([string]$RequestedPath)

    $Candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) { $Candidates += $RequestedPath }
    $Candidates += (Get-Location).Path
    $Candidates += $PSScriptRoot
    $Candidates += (Split-Path -Parent $PSScriptRoot)
    $Candidates += (Join-Path $env:USERPROFILE 'Teaching-Timetable-Windows-v3.0.0')
    $Candidates += (Join-Path $env:USERPROFILE 'Teaching Timetable Windows v1.0.0')

    foreach ($Candidate in ($Candidates | Select-Object -Unique)) {
        if ([string]::IsNullOrWhiteSpace($Candidate)) { continue }
        if ((Test-Path -LiteralPath (Join-Path $Candidate 'server.mjs') -PathType Leaf) -and
            (Test-Path -LiteralPath (Join-Path $Candidate 'backend\Teaching-Timetable-Data.xlsx') -PathType Leaf) -and
            (Test-Path -LiteralPath (Join-Path $Candidate 'frontend\index.html') -PathType Leaf)) {
            return (Resolve-Path -LiteralPath $Candidate).Path
        }
    }

    throw 'The Teaching Timetable project folder was not found. Pass it with -ProjectRoot.'
}

function Get-PortableGit {
    $ExistingGit = Get-Command git.exe -ErrorAction SilentlyContinue
    if ($null -eq $ExistingGit) { $ExistingGit = Get-Command git -ErrorAction SilentlyContinue }
    if ($null -ne $ExistingGit) { return $ExistingGit.Source }

    $ToolRoot = Join-Path $env:LOCALAPPDATA 'TeachingTimetableTools'
    $PortableRoot = Join-Path $ToolRoot 'PortableGit'
    $PortableGit = Join-Path $PortableRoot 'cmd\git.exe'
    if (Test-Path -LiteralPath $PortableGit -PathType Leaf) { return $PortableGit }

    Write-Step 'Git was not found. Preparing official PortableGit without administrator rights'
    New-Item -ItemType Directory -Path $ToolRoot -Force | Out-Null

    $Headers = @{ 'User-Agent' = 'Teaching-Timetable-Publisher' }
    $Release = Invoke-RestMethod -Uri 'https://api.github.com/repos/git-for-windows/git/releases/latest' -Headers $Headers
    $ArchitecturePattern = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
        '^PortableGit-.*-arm64\.7z\.exe$'
    }
    else {
        '^PortableGit-.*-64-bit\.7z\.exe$'
    }
    $Asset = $Release.assets | Where-Object { $_.name -match $ArchitecturePattern } | Select-Object -First 1
    if ($null -eq $Asset) { throw 'The official PortableGit download could not be located.' }

    $ArchivePath = Join-Path $ToolRoot $Asset.name
    Invoke-WebRequest -Uri $Asset.browser_download_url -OutFile $ArchivePath -Headers $Headers -UseBasicParsing

    $DigestProperty = $Asset.PSObject.Properties['digest']
    if ($null -ne $DigestProperty -and ([string]$DigestProperty.Value) -match '^sha256:([a-fA-F0-9]{64})$') {
        $ExpectedHash = $Matches[1]
        $ActualHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash
        if ($ActualHash -ne $ExpectedHash) {
            throw 'PortableGit checksum verification failed. The downloaded file will not be used.'
        }
    }
    Unblock-File -LiteralPath $ArchivePath -ErrorAction SilentlyContinue

    if (Test-Path -LiteralPath $PortableRoot) {
        Remove-Item -LiteralPath $PortableRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Path $PortableRoot -Force | Out-Null
    $EscapedInstallPath = $PortableRoot.Replace('\', '\\')
    $InstallArgument = '-InstallPath="' + $EscapedInstallPath + '"'
    & $ArchivePath '-y' '-gm2' $InstallArgument
    if ($LASTEXITCODE -ne 0) {
        throw "PortableGit extraction failed with exit code $LASTEXITCODE."
    }

    if (-not (Test-Path -LiteralPath $PortableGit -PathType Leaf)) {
        $PortableGitCandidate = Get-ChildItem -LiteralPath $PortableRoot -Recurse -Filter 'git.exe' -File |
            Where-Object { $_.FullName -match '[\\/]cmd[\\/]git\.exe$' } |
            Select-Object -First 1
        if ($null -eq $PortableGitCandidate) {
            throw 'PortableGit extraction finished, but cmd\git.exe was not found.'
        }
        $PortableGit = $PortableGitCandidate.FullName
    }

    $CredentialManager = Get-ChildItem -LiteralPath $PortableRoot -Recurse -File |
        Where-Object { $_.Name -in @('git-credential-manager.exe', 'git-credential-manager-core.exe') } |
        Select-Object -First 1
    if ($null -ne $CredentialManager) {
        & $CredentialManager.FullName configure
    }

    Write-Host "PortableGit $(& $PortableGit --version) is ready." -ForegroundColor Green
    return $PortableGit
}

try {
    Write-Host 'Teaching Timetable GitHub Publisher' -ForegroundColor Green
    Write-Host 'ABOUT: Omar Al-Doori (BUV) 2026'

    $ProjectRoot = Find-ProjectRoot -RequestedPath $ProjectRoot
    Write-Host "Project: $ProjectRoot"
    Write-Host "Repository: $RepositoryUrl"

    Write-Step 'Checking required platform folders and files'
    $RequiredPaths = @(
        '.github\workflows\verify.yml',
        'backend\Teaching-Timetable-Data.xlsx',
        'frontend\index.html',
        'frontend\app.js',
        'scripts\Install-And-Start.ps1',
        'tests\smoke.test.mjs',
        'README.md',
        'LICENSE',
        'server.mjs',
        'excel-store.mjs',
        'package.json',
        'package-lock.json'
    )
    foreach ($RelativePath in $RequiredPaths) {
        if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot $RelativePath) -PathType Leaf)) {
            throw "Required file is missing: $RelativePath"
        }
    }
    Write-Host 'The backend, frontend, scripts, tests and GitHub workflow are present.' -ForegroundColor Green

    $script:GitExe = Get-PortableGit
    Write-Host "Using $(& $script:GitExe --version)"

    Push-Location $ProjectRoot
    try {
        Write-Step 'Creating the local Git repository'
        if (-not (Test-Path -LiteralPath '.git' -PathType Container)) {
            Invoke-Git init
        }
        Invoke-Git config user.name 'Omar Aldoori'
        Invoke-Git config user.email 'aldooriomar@users.noreply.github.com'
        Invoke-Git branch -M $Branch

        $ExistingOrigin = & $script:GitExe remote get-url origin 2>$null
        if ($LASTEXITCODE -ne 0) {
            Invoke-Git remote add origin $RepositoryUrl
        }
        elseif (($ExistingOrigin | Out-String).Trim() -ne $RepositoryUrl) {
            Invoke-Git remote set-url origin $RepositoryUrl
        }

        Write-Step 'Adding the complete platform with its original folder structure'
        Invoke-Git add --all

        $TrackedFiles = @(& $script:GitExe ls-files)
        if ($LASTEXITCODE -ne 0) { throw 'Git could not list the prepared files.' }
        $RequiredTrackedPaths = @(
            '.github/workflows/verify.yml',
            'backend/Teaching-Timetable-Data.xlsx',
            'frontend/index.html',
            'scripts/Install-And-Start.ps1',
            'tests/smoke.test.mjs'
        )
        foreach ($RequiredTrackedPath in $RequiredTrackedPaths) {
            if ($TrackedFiles -notcontains $RequiredTrackedPath) {
                throw "Git did not preserve required path: $RequiredTrackedPath"
            }
        }

        $UnwantedTracked = $TrackedFiles | Where-Object {
            $_ -match '(^|/)(node_modules|\.runtime|logs)/' -or $_ -match '^backend/backups/.+\.xlsx$'
        }
        if ($UnwantedTracked) {
            throw "Generated or private files would be uploaded: $($UnwantedTracked -join ', ')"
        }

        $PendingChanges = @(& $script:GitExe status --porcelain)
        if ($PendingChanges.Count -gt 0) {
            Invoke-Git commit -m 'Release Teaching Timetable Platform v3.0.0'
        }
        else {
            Write-Host 'No new local changes require a commit.' -ForegroundColor Yellow
        }

        Write-Step 'Checking the private GitHub repository'
        $env:GCM_INTERACTIVE = 'always'
        $RemoteMain = @(& $script:GitExe ls-remote --heads origin "refs/heads/$Branch")
        if ($LASTEXITCODE -ne 0) {
            throw 'GitHub authentication or repository access failed. Complete the browser sign-in and run the script again.'
        }

        if ($RemoteMain.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace(($RemoteMain -join ''))) {
            Write-Host 'The GitHub branch already contains a commit.' -ForegroundColor Yellow
            Write-Host 'This may be the incomplete browser upload.' -ForegroundColor Yellow
            $Confirmation = Read-Host 'Type REPLACE to replace that new branch with the correct complete folder structure'
            if ($Confirmation -cne 'REPLACE') {
                throw 'The remote repository was not changed.'
            }
            Invoke-Git fetch origin $Branch
            $RemoteCommit = (& $script:GitExe rev-parse "origin/$Branch").Trim()
            if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($RemoteCommit)) {
                throw 'The current remote commit could not be confirmed safely.'
            }
            Invoke-Git push "--force-with-lease=refs/heads/$Branch`:$RemoteCommit" -u origin $Branch
        }
        else {
            Write-Step 'Uploading the complete platform to GitHub'
            Invoke-Git push -u origin $Branch
        }

        Write-Step 'Verifying the uploaded source structure'
        Invoke-Git status --short --branch
        Write-Host 'Upload completed. GitHub now has the correct backend, frontend, scripts, tests and documentation paths.' -ForegroundColor Green
    }
    finally {
        Pop-Location
    }

    $RepositoryPage = $RepositoryUrl -replace '\.git$', ''
    Start-Process $RepositoryPage
}
catch {
    Write-Host "`nUpload stopped: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'No platform files were deleted from this computer.' -ForegroundColor Yellow
    exit 1
}
