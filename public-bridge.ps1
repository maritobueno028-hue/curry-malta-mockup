param(
  [int]$Port = 3005,
  [string]$ApiBase = 'http://localhost:3000'
)

$ErrorActionPreference = 'Stop'
$root = Get-Location

$mime = @{
  '.html' = 'text/html; charset=UTF-8'
  '.css'  = 'text/css; charset=UTF-8'
  '.js'   = 'application/javascript; charset=UTF-8'
  '.json' = 'application/json; charset=UTF-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.svg'  = 'image/svg+xml'
  '.webp' = 'image/webp'
  '.ico'  = 'image/x-icon'
}

function Write-Response {
  param(
    [Parameter(Mandatory = $true)][System.Net.Sockets.NetworkStream]$Stream,
    [Parameter(Mandatory = $true)][int]$StatusCode,
    [Parameter(Mandatory = $true)][string]$StatusText,
    [Parameter(Mandatory = $true)][byte[]]$Body,
    [Parameter(Mandatory = $true)][string]$ContentType
  )

  $header = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nConnection: close`r`n`r`n"
  $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($Body.Length -gt 0) {
    $Stream.Write($Body, 0, $Body.Length)
  }
}

function Read-Body {
  param(
    [Parameter(Mandatory = $true)][System.IO.StreamReader]$Reader,
    [Parameter(Mandatory = $true)][int]$Length
  )

  if ($Length -le 0) { return '' }
  $chars = New-Object char[] $Length
  $readCount = 0
  while ($readCount -lt $Length) {
    $n = $Reader.Read($chars, $readCount, $Length - $readCount)
    if ($n -le 0) { break }
    $readCount += $n
  }

  return [string]::new($chars, 0, $readCount)
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
$listener.Start()
Write-Output "Public bridge serving on http://0.0.0.0:$Port"

while ($true) {
  $client = $listener.AcceptTcpClient()

  try {
    $stream = $client.GetStream()
    $stream.ReadTimeout = 5000
    $stream.WriteTimeout = 5000
    $reader = [System.IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 8192, $true)

    $requestLine = $reader.ReadLine()
    if ($requestLine -like 'PROXY *') {
      $requestLine = $reader.ReadLine()
    }
    if ([string]::IsNullOrWhiteSpace($requestLine)) {
      $client.Close()
      continue
    }

    $parts = $requestLine.Split(' ')
    if ($parts.Count -lt 2) {
      $bad = [Text.Encoding]::UTF8.GetBytes('Bad Request')
      Write-Response -Stream $stream -StatusCode 400 -StatusText 'Bad Request' -Body $bad -ContentType 'text/plain; charset=UTF-8'
      $client.Close()
      continue
    }

    $method = $parts[0].ToUpperInvariant()
    $target = $parts[1]
    $pathOnly = $target.Split('?')[0]

    $headers = @{}
    while ($true) {
      $line = $reader.ReadLine()
      if ($line -eq $null -or $line -eq '') { break }
      $idx = $line.IndexOf(':')
      if ($idx -gt 0) {
        $key = $line.Substring(0, $idx).Trim().ToLowerInvariant()
        $value = $line.Substring($idx + 1).Trim()
        $headers[$key] = $value
      }
    }

    $contentLength = 0
    if ($headers.ContainsKey('content-length')) {
      [int]::TryParse($headers['content-length'], [ref]$contentLength) | Out-Null
    }

    $body = Read-Body -Reader $reader -Length $contentLength

    if ($pathOnly.StartsWith('/api/')) {
      $proxyUrl = "$ApiBase$pathOnly"
      try {
        if ($method -eq 'POST') {
          $resp = Invoke-WebRequest -Uri $proxyUrl -Method POST -Body $body -ContentType 'application/json; charset=UTF-8' -UseBasicParsing
        }
        elseif ($method -eq 'GET') {
          $resp = Invoke-WebRequest -Uri $proxyUrl -Method GET -UseBasicParsing
        }
        else {
          $msg = [Text.Encoding]::UTF8.GetBytes('{"error":"Method not allowed."}')
          Write-Response -Stream $stream -StatusCode 405 -StatusText 'Method Not Allowed' -Body $msg -ContentType 'application/json; charset=UTF-8'
          $client.Close()
          continue
        }

        $bytes = [Text.Encoding]::UTF8.GetBytes($resp.Content)
        Write-Response -Stream $stream -StatusCode ([int]$resp.StatusCode) -StatusText 'OK' -Body $bytes -ContentType 'application/json; charset=UTF-8'
      }
      catch {
        $status = 502
        $statusText = 'Bad Gateway'
        $err = @{ error = 'Upstream API unavailable.' } | ConvertTo-Json
        $bytes = [Text.Encoding]::UTF8.GetBytes($err)
        Write-Response -Stream $stream -StatusCode $status -StatusText $statusText -Body $bytes -ContentType 'application/json; charset=UTF-8'
      }

      $client.Close()
      continue
    }

    $relativePath = if ($pathOnly -eq '/') { 'index.html' } else { $pathOnly.TrimStart('/') }
    $fullPath = Join-Path $root $relativePath

    if ((Test-Path -LiteralPath $fullPath -PathType Leaf) -and ($fullPath.StartsWith($root.Path))) {
      $ext = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
      $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $fileBytes = [System.IO.File]::ReadAllBytes($fullPath)
      Write-Response -Stream $stream -StatusCode 200 -StatusText 'OK' -Body $fileBytes -ContentType $contentType
    }
    else {
      $notFound = [Text.Encoding]::UTF8.GetBytes('Not Found')
      Write-Response -Stream $stream -StatusCode 404 -StatusText 'Not Found' -Body $notFound -ContentType 'text/plain; charset=UTF-8'
    }

    $client.Close()
  }
  catch {
    try {
      $stream = $client.GetStream()
      $errBytes = [Text.Encoding]::UTF8.GetBytes('Internal Server Error')
      Write-Response -Stream $stream -StatusCode 500 -StatusText 'Internal Server Error' -Body $errBytes -ContentType 'text/plain; charset=UTF-8'
    }
    catch {}
    $client.Close()
  }
}
