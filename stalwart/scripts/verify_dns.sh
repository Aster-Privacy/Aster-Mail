#!/bin/bash
set -e

DOMAIN="${1:-astermail.com}"
SELECTOR="${2:-aster}"

echo "Verifying DNS records for: ${DOMAIN}"
echo "========================================"
echo ""

echo "1. Checking MX records..."
MX=$(dig +short MX "${DOMAIN}" 2>/dev/null)
if [ -n "${MX}" ]; then
    echo "   MX records found:"
    echo "${MX}" | while read line; do echo "   - ${line}"; done
else
    echo "   WARNING: No MX records found!"
fi
echo ""

echo "2. Checking SPF record..."
SPF=$(dig +short TXT "${DOMAIN}" 2>/dev/null | grep -i "v=spf1" || true)
if [ -n "${SPF}" ]; then
    echo "   SPF record found:"
    echo "   ${SPF}"
else
    echo "   WARNING: No SPF record found!"
    echo "   Recommended: v=spf1 mx include:_spf.astermail.com -all"
fi
echo ""

echo "3. Checking DKIM record..."
DKIM=$(dig +short TXT "${SELECTOR}._domainkey.${DOMAIN}" 2>/dev/null)
if [ -n "${DKIM}" ]; then
    echo "   DKIM record found:"
    echo "   ${DKIM}"
else
    echo "   WARNING: No DKIM record found for selector '${SELECTOR}'!"
fi
echo ""

echo "4. Checking DMARC record..."
DMARC=$(dig +short TXT "_dmarc.${DOMAIN}" 2>/dev/null)
if [ -n "${DMARC}" ]; then
    echo "   DMARC record found:"
    echo "   ${DMARC}"
else
    echo "   WARNING: No DMARC record found!"
    echo "   Recommended: v=DMARC1; p=reject; rua=mailto:dmarc@${DOMAIN}"
fi
echo ""

echo "5. Checking MTA-STS record..."
MTASTS=$(dig +short TXT "_mta-sts.${DOMAIN}" 2>/dev/null)
if [ -n "${MTASTS}" ]; then
    echo "   MTA-STS record found:"
    echo "   ${MTASTS}"
else
    echo "   INFO: No MTA-STS record found (optional but recommended)"
fi
echo ""

echo "6. Checking TLSRPT record..."
TLSRPT=$(dig +short TXT "_smtp._tls.${DOMAIN}" 2>/dev/null)
if [ -n "${TLSRPT}" ]; then
    echo "   TLSRPT record found:"
    echo "   ${TLSRPT}"
else
    echo "   INFO: No TLSRPT record found (optional)"
fi
echo ""

echo "Verification complete!"
