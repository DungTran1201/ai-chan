# Generate Self-Signed SSL Certificate for Local HTTPS Development & Testing
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$certDir = Join-Path $scriptDir "..\docker\nginx\certs"

if (-not (Test-Path $certDir)) {
    New-Item -ItemType Directory -Path $certDir -Force | Out-Null
}

$certFile = Join-Path $certDir "cert.crt"
$keyFile = Join-Path $certDir "cert.key"

Write-Host ">>> Generating local self-signed SSL certificate for HTTPS..." -ForegroundColor Cyan

$opensslPath = "C:\Program Files\Git\usr\bin\openssl.exe"
if (-not (Test-Path $opensslPath)) {
    $opensslPath = (Get-Command openssl -ErrorAction SilentlyContinue).Source
}

if ($opensslPath -and (Test-Path $opensslPath)) {
    & $opensslPath req -x509 -nodes -days 365 -newkey rsa:2048 `
        -keyout $keyFile `
        -out $certFile `
        -subj "/C=VN/ST=Hanoi/L=Hanoi/O=AI-Chan/OU=Engineering/CN=localhost"
    Write-Host ">>> SSL Certificate generated successfully at:" -ForegroundColor Green
    Write-Host "    Certificate: $certFile"
    Write-Host "    Private Key: $keyFile"
} else {
    Write-Warning "OpenSSL not found. Please install OpenSSL or Git for Windows."
}
