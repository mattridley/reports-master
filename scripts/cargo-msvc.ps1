$ErrorActionPreference = "Stop"

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $vswhere)) {
  throw "vswhere.exe was not found. Install Visual Studio Build Tools with Desktop development with C++."
}

$vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vsPath) {
  throw "Visual C++ tools were not found. Modify Visual Studio Build Tools and add Desktop development with C++."
}

$devCmd = Join-Path $vsPath "Common7\Tools\VsDevCmd.bat"
if (-not (Test-Path $devCmd)) {
  throw "VsDevCmd.bat was not found at $devCmd."
}

$cmdFile = [IO.Path]::ChangeExtension([IO.Path]::GetTempFileName(), ".cmd")
if ($args.Length -eq 0) {
  $cargoCommand = "cargo check --manifest-path src-tauri\Cargo.toml"
} else {
  $cargoCommand = "cargo " + ($args -join " ")
}

Set-Content -LiteralPath $cmdFile -Value @"
@echo off
call "$devCmd" -arch=x64 -host_arch=x64
where link.exe
$cargoCommand
"@

try {
  cmd.exe /d /c "`"$cmdFile`""
  exit $LASTEXITCODE
} finally {
  Remove-Item -LiteralPath $cmdFile -Force -ErrorAction SilentlyContinue
}
