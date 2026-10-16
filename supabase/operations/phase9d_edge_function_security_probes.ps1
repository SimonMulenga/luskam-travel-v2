param(
  [switch]$ConfirmStaging
)

$ErrorActionPreference = 'Stop'
$StagingProjectRef = 'ikbffvqkxwhkwlocjufc'
$Endpoint = "https://$StagingProjectRef.supabase.co/functions/v1/create-booking-request"

if (-not $ConfirmStaging) {
  throw 'Pass -ConfirmStaging only after verifying the Supabase dashboard project ref is ikbffvqkxwhkwlocjufc.'
}

$PublishableKey = $env:LUSKAM_STAGING_PUBLISHABLE_KEY
$CustomerAToken = $env:LUSKAM_CUSTOMER_A_ACCESS_TOKEN
if ([string]::IsNullOrWhiteSpace($PublishableKey) -or [string]::IsNullOrWhiteSpace($CustomerAToken)) {
  throw 'Set LUSKAM_STAGING_PUBLISHABLE_KEY and a synthetic Customer A access token in this shell.'
}

function Invoke-StatusProbe {
  param(
    [string]$Name,
    [string]$Token,
    [string]$JsonBody,
    [int]$ExpectedStatus
  )

  $headers = @{ apikey = $PublishableKey }
  if (-not [string]::IsNullOrWhiteSpace($Token)) {
    $headers.Authorization = "Bearer $Token"
  }

  $actualStatus = $null
  try {
    $response = Invoke-WebRequest -Uri $Endpoint -Method Post -Headers $headers `
      -ContentType 'application/json' -Body $JsonBody
    $actualStatus = [int]$response.StatusCode
  }
  catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $actualStatus = [int]$_.Exception.Response.StatusCode
    }
    else {
      throw "Probe '$Name' did not receive an HTTP response. Check staging network/function availability."
    }
  }

  if ($actualStatus -ne $ExpectedStatus) {
    throw "FAIL: $Name expected HTTP $ExpectedStatus, got HTTP $actualStatus. No response body or token was printed."
  }
  Write-Output "PASS: $Name returned HTTP $ExpectedStatus"
}

# No-auth probe uses an unsupported operation, so even if auth regresses it
# cannot create a booking request.
$anonymousBody = @{ operation = 'phase9d_auth_probe_only' } | ConvertTo-Json -Compress
Invoke-StatusProbe -Name 'anonymous request rejected before operation dispatch' -Token '' `
  -JsonBody $anonymousBody -ExpectedStatus 401

$futureDate = (Get-Date).AddDays(30).ToString('yyyy-MM-dd')
$baseQuote = @{
  operation = 'quote'
  search = @{
    origin = 'LUN'
    destination = 'JNB'
    departureDate = $futureDate
    returnDate = $null
    cabin = 'Economy'
    passengers = @{ adults = 1; children = 0; infants = 0 }
  }
  providerReference = "phase9d-invalid-offer-$([guid]::NewGuid().ToString())"
}

# A supplied ownership field must be rejected before provider lookup. If the
# guard regresses, the bogus provider reference can at most cause a search and
# provider log entry; quote operation does not insert a booking.
$spoofedOwner = @{} + $baseQuote
$spoofedOwner.user_id = 'fcae4a89-7e69-4cbb-aa87-b666101fd815'
Invoke-StatusProbe -Name 'client-supplied booking owner rejected' -Token $CustomerAToken `
  -JsonBody ($spoofedOwner | ConvertTo-Json -Depth 8 -Compress) -ExpectedStatus 400

# Each authority field is sent with a non-writing quote operation. The valid
# search shape ensures the expected 400 comes from the controlled-field guard.
$controlledFields = @{
  total_amount = 1
  price = 1
  currency = 'XXX'
  status = 'confirmed'
  payment_status = 'paid'
  reference = 'FORGED-REFERENCE'
  provider_offer_id = 'FORGED-OFFER'
}
foreach ($field in $controlledFields.Keys) {
  $probe = @{} + $baseQuote
  $probe[$field] = $controlledFields[$field]
  Invoke-StatusProbe -Name "client-supplied $field rejected" -Token $CustomerAToken `
    -JsonBody ($probe | ConvertTo-Json -Depth 8 -Compress) -ExpectedStatus 400
}

Write-Output 'Completed non-writing probes. This script does not test fare lookup, quote expiry, replay, or successful booking creation.'
