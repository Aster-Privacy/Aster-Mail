@echo off
setlocal enabledelayedexpansion

set "DOMAIN=%~1"
set "SELECTOR=%~2"

if "%DOMAIN%"=="" set "DOMAIN=astermail.com"
if "%SELECTOR%"=="" set "SELECTOR=aster"

set "KEY_DIR=dkim"

echo Setting up DKIM for domain: %DOMAIN%
echo Selector: %SELECTOR%

if not exist "%KEY_DIR%" mkdir "%KEY_DIR%"

where openssl >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo OpenSSL not found. Please install OpenSSL first.
    echo You can install via: winget install OpenSSL.Light
    echo Or run the PowerShell version: .\setup_dkim.ps1
    exit /b 1
)

openssl genrsa -out "%KEY_DIR%\%DOMAIN%.key" 2048
openssl rsa -in "%KEY_DIR%\%DOMAIN%.key" -pubout -out "%KEY_DIR%\%DOMAIN%.pub"

echo.
echo DKIM keys generated successfully!
echo.
echo Key files:
echo   Private: %KEY_DIR%\%DOMAIN%.key
echo   Public:  %KEY_DIR%\%DOMAIN%.pub
echo.
echo Run the PowerShell script for the full DNS record output:
echo   powershell -ExecutionPolicy Bypass -File setup_dkim.ps1 -Domain %DOMAIN% -Selector %SELECTOR%
