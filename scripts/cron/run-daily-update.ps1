param(
  [string]$AppUrl = "http://127.0.0.1:3000",
  [string]$UpdateApiToken = $env:UPDATE_API_TOKEN
)

if ([string]::IsNullOrWhiteSpace($UpdateApiToken)) {
  throw "UPDATE_API_TOKEN is required"
}

$headers = @{
  "x-update-token" = $UpdateApiToken
}

Invoke-RestMethod -Method Post -Uri "$AppUrl/api/internal/update-daily" -Headers $headers

