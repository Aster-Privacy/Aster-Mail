param(
    [string]$Domain = "astermail.org",
    [string]$Selector = "aster"
)

Write-Host "Verifying DNS records for: $Domain"
Write-Host "========================================"
Write-Host ""

Write-Host "1. Checking MX records..."
try {
    $MX = Resolve-DnsName -Name $Domain -Type MX -ErrorAction Stop
    Write-Host "   MX records found:"
    foreach ($record in $MX) {
        Write-Host "   - $($record.Preference) $($record.NameExchange)"
    }
} catch {
    Write-Host "   WARNING: No MX records found!"
}
Write-Host ""

Write-Host "2. Checking SPF record..."
try {
    $TXT = Resolve-DnsName -Name $Domain -Type TXT -ErrorAction Stop
    $SPF = $TXT | Where-Object { $_.Strings -like "*v=spf1*" }
    if ($SPF) {
        Write-Host "   SPF record found:"
        Write-Host "   $($SPF.Strings)"
    } else {
        Write-Host "   WARNING: No SPF record found!"
        Write-Host "   Recommended: v=spf1 mx include:spf.astermail.org ~all"
    }
} catch {
    Write-Host "   WARNING: Could not query TXT records!"
}
Write-Host ""

Write-Host "3. Checking DKIM record..."
try {
    $DKIMName = "$Selector._domainkey.$Domain"
    $DKIM = Resolve-DnsName -Name $DKIMName -Type TXT -ErrorAction Stop
    Write-Host "   DKIM record found:"
    Write-Host "   $($DKIM.Strings)"
} catch {
    Write-Host "   WARNING: No DKIM record found for selector '$Selector'!"
}
Write-Host ""

Write-Host "4. Checking DMARC record..."
try {
    $DMARCName = "_dmarc.$Domain"
    $DMARC = Resolve-DnsName -Name $DMARCName -Type TXT -ErrorAction Stop
    Write-Host "   DMARC record found:"
    Write-Host "   $($DMARC.Strings)"
} catch {
    Write-Host "   WARNING: No DMARC record found!"
    Write-Host "   Recommended: v=DMARC1; p=reject; rua=mailto:dmarc@$Domain"
}
Write-Host ""

Write-Host "5. Checking MTA-STS record..."
try {
    $MTASTSName = "_mta-sts.$Domain"
    $MTASTS = Resolve-DnsName -Name $MTASTSName -Type TXT -ErrorAction Stop
    Write-Host "   MTA-STS record found:"
    Write-Host "   $($MTASTS.Strings)"
} catch {
    Write-Host "   INFO: No MTA-STS record found (optional but recommended)"
}
Write-Host ""

Write-Host "6. Checking TLSRPT record..."
try {
    $TLSRPTName = "_smtp._tls.$Domain"
    $TLSRPT = Resolve-DnsName -Name $TLSRPTName -Type TXT -ErrorAction Stop
    Write-Host "   TLSRPT record found:"
    Write-Host "   $($TLSRPT.Strings)"
} catch {
    Write-Host "   INFO: No TLSRPT record found (optional)"
}
Write-Host ""

Write-Host "Verification complete!"
