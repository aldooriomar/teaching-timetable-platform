[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PortableNode = Join-Path $ProjectRoot '.runtime\node\node.exe'
$NodePath = if (Test-Path -LiteralPath $PortableNode -PathType Leaf) { $PortableNode } else {
    $NodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($null -eq $NodeCommand) { Write-Host "Node.js was not found." -ForegroundColor Red; exit 1 }
    $NodeCommand.Source
}

Push-Location $ProjectRoot
try {
    & $NodePath --check 'server.mjs'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $NodePath --test 'tests\smoke.test.mjs'
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
