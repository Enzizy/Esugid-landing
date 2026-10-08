# E-sugid showcase — local preview server (no installs needed; uses Windows' built-in HttpListener).
#   Right-click > Run with PowerShell, or double-click START_PREVIEW.cmd
#   Options:  -Present   open straight into defense mode
#             -Static    open in Static mode (no 3D, no motion)
#             -Port 5173 preferred port (the next free one is used if busy)
#             -NoBrowser don't open a browser window
param([int]$Port = 5173, [switch]$Present, [switch]$Static, [switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'dist'))
if (-not (Test-Path -LiteralPath (Join-Path $root 'index.html'))) { throw "index.html not found in $root" }

$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.svg' = 'image/svg+xml'
  '.ttf' = 'font/ttf'; '.woff2' = 'font/woff2'; '.txt' = 'text/plain; charset=utf-8'; '.ico' = 'image/x-icon'; '.mp4' = 'video/mp4'
}

$listener = $null
for ($p = $Port; $p -lt $Port + 20; $p++) {
  $try = New-Object System.Net.HttpListener
  $try.Prefixes.Add("http://localhost:$p/")
  try { $try.Start(); $listener = $try; $Port = $p; break } catch { $try.Close() }
}
if (-not $listener) { throw "No free port between $Port and $($Port + 19)." }

$query = @()
if ($Present) { $query += 'present=1' }
if ($Static) { $query += 'static=1' }
$url = "http://localhost:$Port/" + $(if ($query.Count) { '?' + ($query -join '&') } else { '' })

Write-Host ''
Write-Host '  E-sugid thesis showcase' -ForegroundColor Green
Write-Host "  Serving $root"
Write-Host "  Open:   $url" -ForegroundColor Yellow
Write-Host '  Presenter tips: press P for defense mode, W for the presenter window, ? for all keys.'
Write-Host '  Keep this window open during the presentation. Press Ctrl+C to stop.'
Write-Host ''
if (-not $NoBrowser) { Start-Process $url }

try {
  while ($listener.IsListening) {
    $async = $listener.BeginGetContext($null, $null)
    while (-not $async.AsyncWaitHandle.WaitOne(400)) { }   # lets Ctrl+C through
    $ctx = $listener.EndGetContext($async)
    $res = $ctx.Response
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
      if ($path.EndsWith('/')) { $path += 'index.html' }
      $file = [IO.Path]::GetFullPath((Join-Path $root ($path.TrimStart('/') -replace '/', '\')))
      if ($file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
        $res.ContentType = $(if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' })
        $res.AddHeader('Cache-Control', 'no-cache')
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
        $msg = [Text.Encoding]::UTF8.GetBytes('Not found')
        $res.OutputStream.Write($msg, 0, $msg.Length)
      }
    } catch {
      # a browser cancelling a request is normal; keep serving
    } finally {
      try { $res.OutputStream.Close() } catch { }
    }
  }
} finally {
  $listener.Stop(); $listener.Close()
  Write-Host 'Preview server stopped.'
}
