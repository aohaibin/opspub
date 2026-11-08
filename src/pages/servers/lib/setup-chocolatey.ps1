#Requires -Version 5.1
#Requires -RunAsAdministrator
# OpsPub: optional package manager bootstrap on the TARGET Windows host.
$ErrorActionPreference = 'Stop'

if (Get-Command choco -ErrorAction SilentlyContinue) {
    Write-Host ('Chocolatey is already installed: ' + (choco --version)) -ForegroundColor Green
    return
}

$release = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' -Name Release -ErrorAction SilentlyContinue).Release
if (-not $release -or $release -lt 528040) {
    Write-Warning 'Chocolatey 2.x requires .NET Framework 4.8. Install .NET 4.8 and complete any required restart before re-running.'
    return
}

try {
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072
    # Use the official HTTPS installer. The target must have Internet access.
    Invoke-Expression ((New-Object Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    $chocoRoot = if ($env:ChocolateyInstall) { $env:ChocolateyInstall } else { Join-Path $env:ProgramData 'chocolatey' }
    $chocoExe = Join-Path $chocoRoot 'bin\choco.exe'
    if (Test-Path -LiteralPath $chocoExe) {
        & $chocoExe --version
        Write-Host 'Chocolatey installed. Open a NEW terminal to use the updated PATH.' -ForegroundColor Green
    } else {
        throw 'Installer returned without a usable choco.exe. Check the installer output.'
    }
} catch {
    Write-Error ('Chocolatey setup failed: ' + $_.Exception.Message)
}
