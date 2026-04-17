param(
    [string]$Domain = "astermail.com",
    [string]$Selector = "aster",
    [string]$KeyDir = ".\dkim"
)

Write-Host "Setting up DKIM for domain: $Domain"
Write-Host "Selector: $Selector"

if (-not (Test-Path $KeyDir)) {
    New-Item -ItemType Directory -Path $KeyDir -Force | Out-Null
}

$PrivateKeyPath = Join-Path $KeyDir "$Domain.key"
$PublicKeyPath = Join-Path $KeyDir "$Domain.pub"

if (Get-Command openssl -ErrorAction SilentlyContinue) {
    openssl genrsa -out $PrivateKeyPath 4096
    openssl rsa -in $PrivateKeyPath -pubout -out $PublicKeyPath
} else {
    Write-Host ""
    Write-Host "OpenSSL not found. Install OpenSSL or use WSL to run the bash version."
    Write-Host "You can install OpenSSL via: winget install OpenSSL.Light"
    exit 1
}

$PublicKeyContent = Get-Content $PublicKeyPath | Where-Object { $_ -notmatch "^-" } | Out-String
$PublicKeyContent = $PublicKeyContent -replace "`r`n", "" -replace "`n", "" -replace " ", ""

Write-Host ""
Write-Host "DKIM keys generated successfully!"
Write-Host ""
Write-Host "Add the following DNS TXT record:"
Write-Host ""
Write-Host "Name: $Selector._domainkey.$Domain"
Write-Host ""
Write-Host "Value:"
Write-Host "v=DKIM1; k=rsa; p=$PublicKeyContent"
Write-Host ""
Write-Host "Key files:"
Write-Host "  Private: $PrivateKeyPath"
Write-Host "  Public:  $PublicKeyPath"
