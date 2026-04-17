#!/bin/bash

#
# Aster Communications Inc.
#
# Copyright (c) 2026 Aster Communications Inc.
#
# This file is part of this project.
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the AGPLv3 as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# AGPLv3 for more details.
#
# You should have received a copy of the AGPLv3
# along with this program. If not, see <https://www.gnu.org/licenses/>.
#
set -e

DOMAIN="${1:-astermail.org}"
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
    echo "   Recommended: v=spf1 mx include:spf.astermail.org ~all"
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
