#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Build a standalone Android debug APK for ParkSpot mobile app.

.DESCRIPTION
  Runs the full build pipeline:
    1. Bundle JS via expo export:embed (Expo Router entry point)
    2. Compile bundle to Hermes bytecode with hermesc
    3. Build APK via Gradle assembleDebug
    4. (Optionally) install on connected device via adb

.EXAMPLE
  .\build-android.ps1
  .\build-android.ps1 -Install
#>
param(
  [switch]$Install   # If set, installs the APK on a connected device via adb
)

$ErrorActionPreference = "Stop"

# ── Paths ────────────────────────────────────────────────────────────────────
$mobileDir   = $PSScriptRoot
$androidDir  = Join-Path $mobileDir "android"
$assetsDir   = Join-Path $androidDir "app\src\main\assets"
$resDir      = Join-Path $androidDir "app\src\main\res"
$bundlePath  = Join-Path $assetsDir "index.android.bundle"
$hermesc     = Join-Path $mobileDir "node_modules\hermes-compiler\hermesc\win64-bin\hermesc.exe"
$apkPath     = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"

# ── Environment ──────────────────────────────────────────────────────────────
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
$env:PATH      = "C:\Program Files\nodejs;" + $env:PATH

# ── Step 1: Bundle JS ────────────────────────────────────────────────────────
Write-Host "`n[1/3] Bundling JS via expo export:embed..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force $assetsDir | Out-Null
npx expo export:embed `
  --platform android `
  --entry-file node_modules/expo-router/entry.js `
  --bundle-output $bundlePath `
  --assets-dest $resDir
if ($LASTEXITCODE -ne 0) { throw "expo export:embed failed" }

# ── Step 2: Compile to Hermes bytecode ───────────────────────────────────────
Write-Host "`n[2/3] Compiling bundle to Hermes bytecode..." -ForegroundColor Cyan
$hbcPath = "$bundlePath.hbc"
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
  & $hermesc -emit-binary -out $hbcPath $bundlePath
  if ($LASTEXITCODE -ne 0) { throw "hermesc compilation failed with exit code $LASTEXITCODE" }
} finally {
  $ErrorActionPreference = $prevEAP
}
Remove-Item $bundlePath -Force
Rename-Item $hbcPath $bundlePath
$sizeMB = [math]::Round((Get-Item $bundlePath).Length / 1MB, 2)
Write-Host "  Bundle: $sizeMB MB (Hermes bytecode)" -ForegroundColor Green

# ── Step 3: Build APK ────────────────────────────────────────────────────────
Write-Host "`n[3/3] Building APK..." -ForegroundColor Cyan

# Clean stale CMake cache to force regeneration with CMAKE_OBJECT_PATH_MAX=120
$cxxDir = Join-Path $androidDir "app\.cxx"
if (Test-Path $cxxDir) {
  Write-Host "  Clearing stale CMake cache..." -ForegroundColor Yellow
  Remove-Item -Recurse -Force $cxxDir -ErrorAction SilentlyContinue
}

Push-Location $androidDir
try {
  .\gradlew.bat assembleDebug
  if ($LASTEXITCODE -ne 0) { throw "Gradle assembleDebug failed" }
} finally {
  Pop-Location
}


$apkMB = [math]::Round((Get-Item $apkPath).Length / 1MB, 1)
Write-Host "`n✅ APK ready: $apkPath ($apkMB MB)" -ForegroundColor Green

# ── Optional: Install ────────────────────────────────────────────────────────
if ($Install) {
  Write-Host "`nInstalling on connected device..." -ForegroundColor Cyan
  adb install -r $apkPath
}
