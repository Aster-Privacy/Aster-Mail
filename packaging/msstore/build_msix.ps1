param(
  [Parameter(Mandatory = $true)][string]$MsiPath,
  [Parameter(Mandatory = $true)][string]$ManifestPath,
  [Parameter(Mandatory = $true)][string]$IconDirectory,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'

$work_root = Join-Path ([System.IO.Path]::GetTempPath()) ("aster-msix-" + [guid]::NewGuid())
$admin_root = Join-Path $work_root 'admin'
$layout_root = Join-Path $work_root 'layout'
$assets_root = Join-Path $layout_root 'assets'
New-Item -ItemType Directory -Force -Path $admin_root, $layout_root, $assets_root | Out-Null

$msi_full_path = (Resolve-Path $MsiPath).Path
$extraction = Start-Process msiexec.exe -ArgumentList @('/a', "`"$msi_full_path`"", '/qn', "TARGETDIR=`"$admin_root`"") -Wait -PassThru
if ($extraction.ExitCode -ne 0) {
  throw "msiexec administrative extraction failed with exit code $($extraction.ExitCode)"
}

$executable = Get-ChildItem -Path $admin_root -Recurse -Filter 'aster-mail-desktop.exe' | Select-Object -First 1
if (-not $executable) {
  throw 'aster-mail-desktop.exe was not found in the extracted MSI'
}

Get-ChildItem -Path $executable.DirectoryName | Where-Object { $_.Extension -ne '.msi' } | Copy-Item -Destination $layout_root -Recurse -Force

foreach ($icon in 'StoreLogo.png', 'Square150x150Logo.png', 'Square44x44Logo.png') {
  Copy-Item -Path (Join-Path $IconDirectory $icon) -Destination (Join-Path $assets_root $icon)
}
Copy-Item -Path $ManifestPath -Destination (Join-Path $layout_root 'AppxManifest.xml')

$makeappx = Get-ChildItem -Path "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter 'makeappx.exe' |
  Where-Object { $_.Directory.Name -eq 'x64' -and $_.Directory.Parent.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
  Sort-Object { [version]$_.Directory.Parent.Name } -Descending |
  Select-Object -First 1
if (-not $makeappx) {
  throw 'makeappx.exe was not found in the Windows SDK'
}

$output_directory = Split-Path -Parent $OutputPath
if ($output_directory) {
  New-Item -ItemType Directory -Force -Path $output_directory | Out-Null
}

& $makeappx.FullName pack /d $layout_root /p $OutputPath /o
if ($LASTEXITCODE -ne 0) {
  throw "makeappx failed with exit code $LASTEXITCODE"
}

Remove-Item -Recurse -Force $work_root
