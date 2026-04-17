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

DOMAIN="${1:-astermail.com}"
SELECTOR="${2:-aster}"
KEY_DIR="/opt/stalwart/etc/dkim"

echo "Setting up DKIM for domain: ${DOMAIN}"
echo "Selector: ${SELECTOR}"

mkdir -p "${KEY_DIR}"

openssl genrsa -out "${KEY_DIR}/${DOMAIN}.key" 4096
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
