param(
  [switch]$ConfirmStaging,
  [string]$Origin = 'LUN',
  [string]$Destination = 'JNB',
  [string]$DepartureDate,
  [Parameter(Mandatory = $true)][string]$ProviderReference
)

$ErrorActionPreference = 'Stop'
$ProjectRef = 'ikbffvqkxwhkwlocjufc'
$Endpoint = "https://$ProjectRef.supabase.co/functions/v1/create-booking-request"
if (-not $ConfirmStaging) { throw 'Pass -ConfirmStaging only after checking the staging dashboard ref ikbffvqkxwhkwlocjufc.' }
if ([string]::IsNullOrWhiteSpace($DepartureDate)) { $DepartureDate = (Get-Date).AddDays(30).ToString('yyyy-MM-dd') }
if ($Origin -notmatch '^[A-Za-z]{3}$' -or $Destination -notmatch '^[A-Za-z]{3}$' -or $Origin -eq $Destination -or $DepartureDate -notmatch '^\d{4}-\d{2}-\d{2}$' -or [string]::IsNullOrWhiteSpace($ProviderReference)) {
  throw 'Provide a valid future route/date and a real staging offer reference from flight search.'
}
$ApiKey = $env:LUSKAM_STAGING_PUBLISHABLE_KEY
$AccessToken = $env:LUSKAM_CUSTOMER_A_ACCESS_TOKEN
if ([string]::IsNullOrWhiteSpace($ApiKey) -or [string]::IsNullOrWhiteSpace($AccessToken)) {
  throw 'Set staging publishable key and a synthetic Customer A access token in this shell.'
}
$ExpectedCustomerA = '2e33f3a7-61e6-4971-8c2e-4dc817df7937'
$RunMarker = 'P9D' + [guid]::NewGuid().ToString('N')
$RunEmail = "phase9d+$($RunMarker)@example.invalid"
$RunStartedAtUtc = [DateTimeOffset]::UtcNow
try {
  $jwtPayload = $AccessToken.Split('.')[1].Replace('-', '+').Replace('_', '/')
  while (($jwtPayload.Length % 4) -ne 0) { $jwtPayload += '=' }
  $tokenClaims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($jwtPayload)) | ConvertFrom-Json
  if ($tokenClaims.sub -ne $ExpectedCustomerA) { throw 'wrong subject' }
}
catch { throw 'The access token must belong to the configured synthetic staging Customer A.' }

$client = [System.Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromSeconds(90)
$client.DefaultRequestHeaders.Add('apikey', $ApiKey)
$client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $AccessToken)

function New-Body([string]$Operation, [string]$QuoteToken, [string]$IdempotencyKey) {
  $payload = @{
    operation = $Operation
    search = @{ origin = $Origin.ToUpperInvariant(); destination = $Destination.ToUpperInvariant(); departureDate = $DepartureDate; returnDate = $null; cabin = 'Economy'; passengers = @{ adults = 1; children = 0; infants = 0 } }
    providerReference = $ProviderReference
  }
  if ($Operation -eq 'submit_flight') {
    $payload.quoteToken = $QuoteToken
    $payload.idempotencyKey = $IdempotencyKey
    $payload.passengers = @(@{ type = 'adult'; title = 'MR'; firstName = $RunMarker; lastName = 'Synthetic' })
    $payload.contact = @{ email = $RunEmail; phone = '+260000000000' }
  }
  return $payload | ConvertTo-Json -Depth 10 -Compress
}

function Start-Http([string]$JsonBody) {
  $content = [System.Net.Http.StringContent]::new($JsonBody, [System.Text.Encoding]::UTF8, 'application/json')
  return $client.PostAsync($Endpoint, $content)
}

function Read-Http($Task) {
  $response = $Task.GetAwaiter().GetResult()
  $raw = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $parsed = $null
  try { $parsed = $raw | ConvertFrom-Json } catch { }
  $retryAfter = 0
  if ($response.Headers.RetryAfter -and $response.Headers.RetryAfter.Delta) { $retryAfter = [int][Math]::Ceiling($response.Headers.RetryAfter.Delta.TotalSeconds) }
  return [pscustomobject]@{ Status = [int]$response.StatusCode; Body = $parsed; RetryAfter = $retryAfter }
}

function New-Quote {
  $response = Read-Http (Start-Http (New-Body 'quote' '' ''))
  if ($response.Status -ne 200 -or [string]::IsNullOrWhiteSpace($response.Body.quoteToken)) {
    throw "Staging quote request failed with HTTP $($response.Status); response content was not printed."
  }
  return [string]$response.Body.quoteToken
}

$createdIds = [System.Collections.Generic.HashSet[string]]::new()
Write-Output "Synthetic cleanup marker for this run: $RunMarker"
Write-Output "Rate-limit cleanup start time (UTC): $($RunStartedAtUtc.ToString('o'))"
try {
  # Two simultaneous identical submissions must return the same booking.
  $sameToken = New-Quote
  $sameKey = [guid]::NewGuid().ToString()
  $sameBody = New-Body 'submit_flight' $sameToken $sameKey
  $sameResponses = @((Start-Http $sameBody), (Start-Http $sameBody)) | ForEach-Object { Read-Http $_ }
  foreach ($result in $sameResponses) { if ($result.Body.booking.id) { [void]$createdIds.Add([string]$result.Body.booking.id) } }
  if (@($sameResponses | Where-Object { $_.Status -in 200, 201 }).Count -ne 2) { throw 'Concurrent same-key replay did not return two successful responses.' }
  $sameIds = @($sameResponses | ForEach-Object { [string]$_.Body.booking.id } | Select-Object -Unique)
  if ($sameIds.Count -ne 1 -or [string]::IsNullOrWhiteSpace($sameIds[0])) { throw 'Concurrent same-key submissions did not resolve to one booking ID.' }
  [void]$createdIds.Add($sameIds[0])
  Write-Output 'PASS: concurrent same-key submissions resolve to one booking'

  # A distinct signed quote nonce can be consumed once even if callers choose
  # two different valid UUID idempotency keys.
  $differentToken = New-Quote
  $differentResponses = @(
    (Start-Http (New-Body 'submit_flight' $differentToken ([guid]::NewGuid().ToString()))),
    (Start-Http (New-Body 'submit_flight' $differentToken ([guid]::NewGuid().ToString())))
  ) | ForEach-Object { Read-Http $_ }
  foreach ($result in $differentResponses) { if ($result.Body.booking.id) { [void]$createdIds.Add([string]$result.Body.booking.id) } }
  if (@($differentResponses | Where-Object { $_.Status -in 200, 201 }).Count -ne 1 -or @($differentResponses | Where-Object { $_.Status -eq 409 }).Count -ne 1) {
    throw 'Concurrent different-key reuse of one quote did not produce one success and one conflict.'
  }
  Write-Output 'PASS: one quote nonce cannot create two requests with different keys'

  # Same request retry returns the existing booking; next request is over the
  # five-per-ten-minute submission budget (four calls above plus these two).
  $retry = Read-Http (Start-Http $sameBody)
  if ($retry.Status -ne 200 -or -not $retry.Body.duplicate -or [string]$retry.Body.booking.id -ne $sameIds[0]) { throw 'Same-key retry did not return the existing request.' }
  Write-Output 'PASS: retry returns the original request'
  $throttled = Read-Http (Start-Http $sameBody)
  if ($throttled.Status -ne 429 -or $throttled.RetryAfter -lt 1) { throw "Expected HTTP 429 with Retry-After after the configured submission budget; got HTTP $($throttled.Status)." }
  Write-Output 'PASS: submit rate limit returns HTTP 429 with Retry-After'

}
finally {
  Write-Output "Synthetic cleanup marker for this run: $RunMarker"
  Write-Output "Rate-limit cleanup start time (UTC): $($RunStartedAtUtc.ToString('o'))"
  if ($createdIds.Count -gt 0) {
    Write-Output 'Synthetic staging booking IDs to clean up, whether the test passed or failed:'
    $createdIds | ForEach-Object { Write-Output $_ }
    Write-Output 'Clean these IDs with the run-marker guard in PHASE9D_EDGE_HARDENING.md; retain matching nonce tombstones.'
  } else {
    Write-Output 'No booking IDs were returned. Use the run marker to check for a request committed before a lost response.'
  }
  $client.Dispose()
}
