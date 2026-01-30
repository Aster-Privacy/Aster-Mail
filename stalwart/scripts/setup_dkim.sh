#!/bin/bash
set -e

DOMAIN="${1:-astermail.com}"
SELECTOR="${2:-aster}"
KEY_DIR="/opt/stalwart/etc/dkim"

echo "Setting up DKIM for domain: ${DOMAIN}"
echo "Selector: ${SELECTOR}"

mkdir -p "${KEY_DIR}"

openssl genrsa -out "${KEY_DIR}/${DOMAIN}.key" 2048
openssl rsa -in "${KEY_DIR}/${DOMAIN}.key" -pubout -out "${KEY_DIR}/${DOMAIN}.pub"

chmod 600 "${KEY_DIR}/${DOMAIN}.key"
chmod 644 "${KEY_DIR}/${DOMAIN}.pub"

PUBLIC_KEY=$(grep -v "^-" "${KEY_DIR}/${DOMAIN}.pub" | tr -d '\n')

echo ""
echo "DKIM keys generated successfully!"
echo ""
echo "Add the following DNS TXT record:"
echo ""
echo "Name: ${SELECTOR}._domainkey.${DOMAIN}"
echo ""
echo "Value:"
echo "v=DKIM1; k=rsa; p=${PUBLIC_KEY}"
echo ""
echo "Key files:"
echo "  Private: ${KEY_DIR}/${DOMAIN}.key"
echo "  Public:  ${KEY_DIR}/${DOMAIN}.pub"
