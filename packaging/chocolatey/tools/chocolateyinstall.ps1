$ErrorActionPreference = 'Stop'

$install_log = Join-Path $env:TEMP "$($env:ChocolateyPackageName).$($env:ChocolateyPackageVersion).MsiInstall.log"

$package_args = @{
  packageName    = $env:ChocolateyPackageName
  fileType       = 'msi'
  url64bit       = 'https://github.com/Aster-Privacy/Aster-Mail/releases/download/v@VERSION@/Aster-Mail-x64.msi'
  checksum64     = '@MSI_SHA256@'
  checksumType64 = 'sha256'
  silentArgs     = "/qn /norestart /l*v `"$install_log`""
  validExitCodes = @(0, 3010, 1641)
}

Install-ChocolateyPackage @package_args
