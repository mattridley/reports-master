$ErrorActionPreference = "Stop"

Write-Host "Checking Windows desktop build prerequisites..."

$rustInfo = rustc -vV
if ($LASTEXITCODE -ne 0) {
  throw "Rust is not installed or rustc is not on PATH."
}

$hostLine = $rustInfo | Where-Object { $_ -like "host:*" }
Write-Host $hostLine

$link = Get-Command link.exe -ErrorAction SilentlyContinue
if (-not $link) {
  Write-Error @"
link.exe was not found.

The installed Rust host targets MSVC, so Cargo needs the Microsoft C++ linker.
Install "Build Tools for Visual Studio" with the "Desktop development with C++" workload,
then reopen your terminal so PATH includes the Visual C++ tools.

Download: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
"@
  exit 1
}

Write-Host "Found linker: $($link.Source)"
Write-Host "Windows build prerequisites look ready."
