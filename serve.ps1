param(
  [int]$Port = 3000,
  [string]$PublicHost = ''
)

$ErrorActionPreference = 'Stop'
$root = Get-Location
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
if (-not [string]::IsNullOrWhiteSpace($PublicHost)) {
  $listener.Prefixes.Add("http://${PublicHost}:$Port/")
}
$listener.Start()
Write-Output "Serving http://localhost:$Port/"

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

$deliveryZones = @{
  'st_julians' = @{ label = "St. Julian's"; minSubtotal = 15.0; deliveryFee = 2.5; eta = '32-42 min' }
  'sliema' = @{ label = 'Sliema'; minSubtotal = 18.0; deliveryFee = 2.5; eta = '34-44 min' }
  'gzira' = @{ label = 'Gzira'; minSubtotal = 18.0; deliveryFee = 2.5; eta = '35-46 min' }
  'valletta' = @{ label = 'Valletta'; minSubtotal = 20.0; deliveryFee = 3.0; eta = '38-50 min' }
  'swieqi' = @{ label = 'Swieqi'; minSubtotal = 17.0; deliveryFee = 2.5; eta = '30-40 min' }
  'msida' = @{ label = 'Msida'; minSubtotal = 20.0; deliveryFee = 3.0; eta = '36-48 min' }
  'san_gwann' = @{ label = 'San Gwann'; minSubtotal = 17.0; deliveryFee = 2.5; eta = '31-42 min' }
  'birkirkara' = @{ label = 'Birkirkara'; minSubtotal = 24.0; deliveryFee = 3.5; eta = '40-55 min' }
}

$coupons = @{
  'VIP10' = @{ type = 'percent'; value = 10.0; minSubtotal = 25.0 }
  'LUNCH5' = @{ type = 'fixed'; value = 5.0; minSubtotal = 20.0 }
}

$pointValue = 0.1
$maxPointsDiscountRatio = 0.3

$ordersFile = Join-Path $root 'orders.json'
if (-not (Test-Path -LiteralPath $ordersFile -PathType Leaf)) {
  Set-Content -Path $ordersFile -Value '[]' -Encoding UTF8
}

function Round-Money {
  param([double]$Value)
  return [Math]::Round($Value, 2)
}

function Read-Orders {
  $raw = Get-Content -Path $ordersFile -Raw
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return @()
  }

  $parsed = $raw | ConvertFrom-Json
  if ($null -eq $parsed) {
    return @()
  }

  if ($parsed -is [array]) {
    return @($parsed)
  }

  return @($parsed)
}

function Write-JsonResponse {
  param(
    [Parameter(Mandatory = $true)]$Context,
    [Parameter(Mandatory = $true)][int]$StatusCode,
    [Parameter(Mandatory = $true)]$Payload
  )

  $json = $Payload | ConvertTo-Json -Depth 10
  $buffer = [Text.Encoding]::UTF8.GetBytes($json)
  $Context.Response.StatusCode = $StatusCode
  $Context.Response.ContentType = 'application/json; charset=UTF-8'
  $Context.Response.ContentLength64 = $buffer.Length
  $Context.Response.OutputStream.Write($buffer, 0, $buffer.Length)
  $Context.Response.Close()
}

while ($listener.IsListening) {
  $context = $listener.GetContext()

  try {
    $requestUrl = $context.Request.Url.AbsolutePath

    if ($requestUrl -eq '/api/config') {
      if ($context.Request.HttpMethod -ne 'GET') {
        Write-JsonResponse -Context $context -StatusCode 405 -Payload @{ error = 'Method not allowed.' }
        continue
      }

      Write-JsonResponse -Context $context -StatusCode 200 -Payload @{
        ok = $true
        deliveryZones = $deliveryZones
        coupons = $coupons
      }
      continue
    }

    if ($requestUrl -eq '/api/orders') {
      if ($context.Request.HttpMethod -ne 'GET') {
        Write-JsonResponse -Context $context -StatusCode 405 -Payload @{ error = 'Method not allowed.' }
        continue
      }

      $orders = Read-Orders
      $count = @($orders).Count
      $revenue = 0.0
      foreach ($item in $orders) {
        if ($null -ne $item.total) {
          $revenue += [double]$item.total
        }
      }

      Write-JsonResponse -Context $context -StatusCode 200 -Payload @{
        ok = $true
        count = $count
        revenue = (Round-Money -Value $revenue)
        orders = @($orders | Sort-Object -Property createdAt -Descending)
      }
      continue
    }

    if ($requestUrl -eq '/api/order') {
      if ($context.Request.HttpMethod -eq 'GET') {
        $orders = Read-Orders
        $count = @($orders).Count
        Write-JsonResponse -Context $context -StatusCode 200 -Payload @{ ok = $true; ordersCount = $count }
        continue
      }

      if ($context.Request.HttpMethod -ne 'POST') {
        Write-JsonResponse -Context $context -StatusCode 405 -Payload @{ error = 'Method not allowed.' }
        continue
      }

      $reader = New-Object IO.StreamReader($context.Request.InputStream, $context.Request.ContentEncoding)
      $rawBody = $reader.ReadToEnd()
      $reader.Close()

      if ([string]::IsNullOrWhiteSpace($rawBody)) {
        Write-JsonResponse -Context $context -StatusCode 400 -Payload @{ error = 'Request body is required.' }
        continue
      }

      try {
        $order = $rawBody | ConvertFrom-Json
      }
      catch {
        Write-JsonResponse -Context $context -StatusCode 400 -Payload @{ error = 'Invalid JSON payload.' }
        continue
      }

      if (-not $order.customer -or -not $order.customer.name -or -not $order.customer.phone -or -not $order.customer.address) {
        Write-JsonResponse -Context $context -StatusCode 400 -Payload @{ error = 'Customer details are incomplete.' }
        continue
      }

      if (-not $order.items -or @($order.items).Count -eq 0) {
        Write-JsonResponse -Context $context -StatusCode 400 -Payload @{ error = 'At least one item is required.' }
        continue
      }

      $localityKey = [string]$order.locality
      if (-not $deliveryZones.ContainsKey($localityKey)) {
        Write-JsonResponse -Context $context -StatusCode 400 -Payload @{ error = 'Unsupported delivery locality.' }
        continue
      }

      $zone = $deliveryZones[$localityKey]
      $subtotal = [double]$order.subtotal
      $providedDeliveryFee = [double]$order.deliveryFee
      $providedTotal = [double]$order.total

      if ($subtotal -lt [double]$zone.minSubtotal) {
        Write-JsonResponse -Context $context -StatusCode 400 -Payload @{ error = "Minimum order for $($zone.label) is EUR $($zone.minSubtotal)." }
        continue
      }

      if ((Round-Money -Value $providedDeliveryFee) -ne (Round-Money -Value ([double]$zone.deliveryFee))) {
        Write-JsonResponse -Context $context -StatusCode 400 -Payload @{ error = 'Delivery fee mismatch for selected locality.' }
        continue
      }

      $couponCode = ''
      $couponDiscount = 0.0
      $pointsUsed = 0
      $pointsDiscount = 0.0

      if ($order.discounts) {
        if ($order.discounts.couponCode) {
          $couponCode = ([string]$order.discounts.couponCode).Trim().ToUpperInvariant()
        }
        if ($null -ne $order.discounts.pointsUsed) {
          $pointsUsed = [int]$order.discounts.pointsUsed
        }
      }

      if ($couponCode) {
        if (-not $coupons.ContainsKey($couponCode)) {
          Write-JsonResponse -Context $context -StatusCode 400 -Payload @{ error = 'Invalid coupon code.' }
          continue
        }

        $coupon = $coupons[$couponCode]
        if ($subtotal -lt [double]$coupon.minSubtotal) {
          Write-JsonResponse -Context $context -StatusCode 400 -Payload @{ error = "Coupon $couponCode requires subtotal of at least EUR $($coupon.minSubtotal)." }
          continue
        }

        if ($coupon.type -eq 'percent') {
          $couponDiscount = Round-Money -Value (($subtotal * [double]$coupon.value) / 100.0)
        }
        else {
          $couponDiscount = Round-Money -Value ([double]$coupon.value)
        }
      }

      if ($pointsUsed -lt 0) {
        Write-JsonResponse -Context $context -StatusCode 400 -Payload @{ error = 'Points used cannot be negative.' }
        continue
      }

      $maxPointsDiscount = Round-Money -Value ($subtotal * $maxPointsDiscountRatio)
      $requestedPointsDiscount = Round-Money -Value ($pointsUsed * $pointValue)
      $pointsDiscount = [Math]::Min($maxPointsDiscount, $requestedPointsDiscount)

      $expectedTotal = Round-Money -Value ($subtotal - $couponDiscount - $pointsDiscount + [double]$zone.deliveryFee)
      if ([Math]::Abs($expectedTotal - $providedTotal) -gt 0.01) {
        Write-JsonResponse -Context $context -StatusCode 400 -Payload @{ error = 'Total mismatch. Please refresh and try checkout again.' }
        continue
      }

      $existingOrders = Read-Orders
      $orderId = 'EMP-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + (Get-Random -Minimum 100 -Maximum 999)
      $storedOrder = [ordered]@{
        orderId = $orderId
        createdAt = (Get-Date).ToString('o')
        locality = $localityKey
        localityLabel = $zone.label
        customer = $order.customer
        payment = $order.payment
        items = $order.items
        subtotal = (Round-Money -Value $subtotal)
        deliveryFee = (Round-Money -Value ([double]$zone.deliveryFee))
        discounts = @{
          couponCode = if ($couponCode) { $couponCode } else { $null }
          couponDiscount = $couponDiscount
          pointsUsed = $pointsUsed
          pointsDiscount = $pointsDiscount
        }
        total = $expectedTotal
      }

      $updatedOrders = @($existingOrders) + @($storedOrder)
      $updatedOrders | ConvertTo-Json -Depth 12 | Set-Content -Path $ordersFile -Encoding UTF8

      Write-JsonResponse -Context $context -StatusCode 201 -Payload @{ ok = $true; orderId = $orderId; total = $expectedTotal }
      continue
    }

    if ($requestUrl -eq '/') { $requestUrl = '/index.html' }

    $localPath = $requestUrl.TrimStart('/') -replace '/', [IO.Path]::DirectorySeparatorChar
    $filePath = Join-Path $root $localPath

    if (-not $filePath.StartsWith($root.Path, [System.StringComparison]::OrdinalIgnoreCase)) {
      $context.Response.StatusCode = 403
      $context.Response.ContentType = 'text/plain; charset=UTF-8'
      $buffer = [Text.Encoding]::UTF8.GetBytes('403 Forbidden')
      $context.Response.OutputStream.Write($buffer, 0, $buffer.Length)
      $context.Response.Close()
      continue
    }

    if (-not (Test-Path $filePath -PathType Leaf)) {
      $context.Response.StatusCode = 404
      $context.Response.ContentType = 'text/plain; charset=UTF-8'
      $buffer = [Text.Encoding]::UTF8.GetBytes('404 Not Found')
      $context.Response.OutputStream.Write($buffer, 0, $buffer.Length)
      $context.Response.Close()
      continue
    }

    $ext = [IO.Path]::GetExtension($filePath).ToLowerInvariant()
    $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }

    $context.Response.ContentType = $contentType
    $bytes = [IO.File]::ReadAllBytes($filePath)
    $context.Response.StatusCode = 200
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $context.Response.Close()
  }
  catch {
    if ($context.Response.OutputStream.CanWrite) {
      $context.Response.StatusCode = 500
      $context.Response.ContentType = 'application/json; charset=UTF-8'
      $buffer = [Text.Encoding]::UTF8.GetBytes('{"error":"500 Internal Server Error"}')
      $context.Response.OutputStream.Write($buffer, 0, $buffer.Length)
      $context.Response.Close()
    }
  }
}
