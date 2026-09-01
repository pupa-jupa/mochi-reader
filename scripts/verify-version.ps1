$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$packageJson = Get-Content -Raw -LiteralPath (Join-Path $repositoryRoot "package.json") | ConvertFrom-Json
$tauriConfig = Get-Content -Raw -LiteralPath (Join-Path $repositoryRoot "src-tauri/tauri.conf.json") | ConvertFrom-Json
$cargoToml = Get-Content -Raw -LiteralPath (Join-Path $repositoryRoot "src-tauri/Cargo.toml")
$cargoVersionMatch = [regex]::Match($cargoToml, '(?m)^version\s*=\s*"([^"]+)"')

if (-not $cargoVersionMatch.Success) {
    throw "Could not read the package version from src-tauri/Cargo.toml."
}

$versions = [ordered]@{
    "package.json" = [string]$packageJson.version
    "src-tauri/tauri.conf.json" = [string]$tauriConfig.version
    "src-tauri/Cargo.toml" = $cargoVersionMatch.Groups[1].Value
}
$uniqueVersions = @($versions.Values | Select-Object -Unique)

if ($uniqueVersions.Count -ne 1) {
    $details = ($versions.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ", "
    throw "Application versions do not match: $details"
}

$version = $uniqueVersions[0]
if ($version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$') {
    throw "Application version '$version' is not valid semantic versioning."
}

Write-Output "Application versions match: $version"
