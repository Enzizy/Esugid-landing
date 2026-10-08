$ErrorActionPreference = 'Stop'
$siteDirectory = Join-Path $PSScriptRoot 'dist'
$bundledPython = 'C:\Users\joynoinc\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (Test-Path -LiteralPath $bundledPython) {
    & $bundledPython -m http.server 5173 --bind 127.0.0.1 --directory $siteDirectory
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    python -m http.server 5173 --bind 127.0.0.1 --directory $siteDirectory
} else {
    throw 'Python is required to serve this local preview.'
}
