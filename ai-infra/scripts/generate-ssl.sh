#!/usr/bin/env bash
# Generate Self-Signed SSL Certificate for Local HTTPS Development & Testing
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="${SCRIPT_DIR}/../docker/nginx/certs"

mkdir -p "${CERT_DIR}"

CERT_FILE="${CERT_DIR}/cert.crt"
KEY_FILE="${CERT_DIR}/cert.key"

echo ">>> Generating local self-signed SSL certificate for HTTPS..."
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "${KEY_FILE}" \
    -out "${CERT_FILE}" \
    -subj "/C=VN/ST=Hanoi/L=Hanoi/O=AI-Chan/OU=Engineering/CN=localhost"

echo ">>> SSL Certificate generated successfully at:"
echo "    Certificate: ${CERT_FILE}"
echo "    Private Key: ${KEY_FILE}"
