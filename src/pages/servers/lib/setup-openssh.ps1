#Requires -Version 5.1
#Requires -RunAsAdministrator
# OpsPub: run on the TARGET Windows host. Safe to re-run.
$ErrorActionPreference = 'Stop'

try {
    $cap = Get-WindowsCapability -Online | Where-Object { $_.Name -like 'OpenSSH.Server*' } | Select-Object -First 1
    if ($null -eq $cap) {
        throw 'OpenSSH capability unavailable. See https://github.com/PowerShell/Win32-OpenSSH/releases for older Windows.'
    }
    if ($cap.State -ne 'Installed') {
        Write-Host 'Installing OpenSSH Server...' -ForegroundColor Cyan
        $installation = Add-WindowsCapability -Online -Name $cap.Name
        if ($installation.RestartNeeded) {
            Write-Warning 'Windows requires a restart. Re-run after restarting.'
            return
        }
    }
    Set-Service -Name sshd -StartupType Automatic
    Start-Service -Name sshd

    $ruleName = 'OpenSSH-Server-In-TCP'
    if (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue) {
        Set-NetFirewallRule -Name $ruleName -Enabled True -Direction Inbound -Action Allow
        Get-NetFirewallRule -Name $ruleName | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort 22
    } else {
        New-NetFirewallRule -Name $ruleName -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 | Out-Null
    }

    Write-Host 'SSH service:' -ForegroundColor Cyan
    Get-Service sshd | Format-Table Name, Status, StartType
    Write-Host 'Host key fingerprints (compare on first connection):' -ForegroundColor Cyan
    $keygen = Get-Command ssh-keygen.exe -ErrorAction SilentlyContinue
    if ($keygen) {
        Get-ChildItem (Join-Path $env:ProgramData 'ssh\ssh_host_*_key.pub') -ErrorAction SilentlyContinue | ForEach-Object {
            & $keygen.Source -l -E sha256 -f $_.FullName
            # OpsPub currently displays the SHA-256 digest as colon-separated hex.
            $publicKey = (Get-Content -LiteralPath $_.FullName -Raw).Split(' ')[1]
            $sha = [Security.Cryptography.SHA256]::Create()
            try {
                $hash = $sha.ComputeHash([Convert]::FromBase64String($publicKey))
                Write-Host ('    OpsPub SHA256:' + (($hash | ForEach-Object { $_.ToString('x2') }) -join ':'))
            } finally { $sha.Dispose() }
        }
    }
    Write-Host 'Local IPv4 addresses:' -ForegroundColor Cyan
    Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' } | Format-Table IPAddress, InterfaceAlias
    Write-Host 'Ready. Add a Windows SSH server in OpsPub using port 22 and your Windows login.' -ForegroundColor Green
    Write-Warning 'Cloud VM: also allow inbound TCP 22 in the cloud security group.'
} catch {
    Write-Error ('OpenSSH setup failed: ' + $_.Exception.Message)
}
