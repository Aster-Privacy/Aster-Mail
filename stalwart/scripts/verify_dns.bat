@echo off
setlocal

set "DOMAIN=%~1"
set "SELECTOR=%~2"

if "%DOMAIN%"=="" set "DOMAIN=astermail.com"
if "%SELECTOR%"=="" set "SELECTOR=aster"

echo Running PowerShell DNS verification script...
powershell -ExecutionPolicy Bypass -File "%~dp0verify_dns.ps1" -Domain %DOMAIN% -Selector %SELECTOR%
