param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^v\d+\.\d+\.\d+$')]
  [string]$Tag,

  [string]$PackageDirectory,
  [string]$BackupRepoPath = 'D:\itemWork\bushu\yunwei\opspub',
  [string]$WebsitePath = 'D:\itemWork\bushu\doler\yuming\yuming\opspub'
)

$ErrorActionPreference = 'Stop'
$sourceRepo = 'aohaibin/opspub'
$version = $Tag.Substring(1)
$temporaryDownload = $null
$packageRoot = $PackageDirectory

function Invoke-Git {
  param([string]$Repository, [string[]]$Arguments)
  & git -C $Repository @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') failed in $Repository"
  }
}

function Write-Utf8NoBom {
  param([string]$Path, [string]$Content)
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

try {
  if (-not $packageRoot) {
    $temporaryDownload = Join-Path ([System.IO.Path]::GetTempPath()) ("opspub-$Tag-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $temporaryDownload | Out-Null
    & gh release download $Tag --repo $sourceRepo --dir $temporaryDownload
    if ($LASTEXITCODE -ne 0) { throw "GitHub Release assets for $Tag could not be downloaded. Confirm CI completed and gh is authenticated." }
    $packageRoot = $temporaryDownload
  }

  $packageRoot = (Resolve-Path -LiteralPath $packageRoot).Path
  $backupRoot = (Resolve-Path -LiteralPath $BackupRepoPath).Path
  $websiteRoot = (Resolve-Path -LiteralPath $WebsitePath).Path
  $websiteDownload = Join-Path $websiteRoot 'download'
  if (-not (Test-Path -LiteralPath $websiteDownload -PathType Container)) {
    throw "Website download directory does not exist: $websiteDownload"
  }

  $backupStatus = @(& git -C $backupRoot status --porcelain)
  if ($LASTEXITCODE -ne 0) { throw "Could not inspect backup repository: $backupRoot" }
  if ($backupStatus.Count -gt 0) {
    throw "Backup repository has local changes. Commit or move them before publishing: $backupRoot"
  }

  & git -C $backupRoot ls-remote --exit-code --heads origin master *> $null
  $remoteBranchExitCode = $LASTEXITCODE
  if ($remoteBranchExitCode -eq 0) {
    Invoke-Git -Repository $backupRoot -Arguments @('pull', '--rebase', 'origin', 'master')
  } elseif ($remoteBranchExitCode -ne 2) {
    throw "Could not inspect remote master branch in Gitee repository (git ls-remote exit code $remoteBranchExitCode). Check network access and authentication."
  }

  $assets = @(Get-ChildItem -LiteralPath $packageRoot -File)
  $setup = @($assets | Where-Object { $_.Name -match '(?i)-setup\.exe$' })
  $armDmg = @($assets | Where-Object { $_.Name -match '(?i)_aarch64\.dmg$' })
  $intelDmg = @($assets | Where-Object { $_.Name -match '(?i)_x64\.dmg$' })
  $debs = @($assets | Where-Object { $_.Extension -ieq '.deb' })
  $appImages = @($assets | Where-Object { $_.Extension -ieq '.AppImage' })
  if ($setup.Count -ne 1 -or $armDmg.Count -ne 1 -or $intelDmg.Count -ne 1 -or $debs.Count -ne 1 -or $appImages.Count -ne 1) {
    throw "Expected exactly one Windows NSIS installer, macOS ARM/Intel DMG, Linux DEB and AppImage in $packageRoot."
  }

  $windowsSignature = Join-Path $packageRoot ($setup[0].Name + '.sig')
  if (-not (Test-Path -LiteralPath $windowsSignature -PathType Leaf)) {
    throw "Windows updater signature is missing: $windowsSignature"
  }
  $signature = (Get-Content -LiteralPath $windowsSignature -Raw -Encoding utf8).Trim()
  try { [void][Convert]::FromBase64String($signature) }
  catch { throw "Windows updater signature is not valid base64: $windowsSignature" }

  $releaseDirectory = Join-Path $backupRoot (Join-Path 'releases' $Tag)
  New-Item -ItemType Directory -Force -Path $releaseDirectory | Out-Null
  foreach ($asset in $assets) {
    Copy-Item -LiteralPath $asset.FullName -Destination (Join-Path $releaseDirectory $asset.Name) -Force
  }

  $assetBaseUrl = "https://gitee.com/aohai/opspub/raw/master/releases/$Tag"
  $encodedInstaller = [System.Uri]::EscapeDataString($setup[0].Name)
  $notes = "OpsPub $Tag desktop release. Windows, macOS and Linux packages are available on the official website."
  $update = [ordered]@{
    version = $version
    notes = $notes
    pub_date = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    platforms = [ordered]@{
      'windows-x86_64' = [ordered]@{
        signature = $signature
        url = "$assetBaseUrl/$encodedInstaller"
      }
    }
  }
  $updatePath = Join-Path $backupRoot 'update.json'
  Write-Utf8NoBom -Path $updatePath -Content (($update | ConvertTo-Json -Depth 8) + "`n")

  $websitePackages = @(
    @{ Source = $setup[0].FullName; Name = 'OpsPub-Setup.exe' },
    @{ Source = $armDmg[0].FullName; Name = 'OpsPub-aarch64.dmg' },
    @{ Source = $intelDmg[0].FullName; Name = 'OpsPub-x64.dmg' },
    @{ Source = $debs[0].FullName; Name = 'OpsPub-amd64.deb' },
    @{ Source = $appImages[0].FullName; Name = 'OpsPub-x86_64.AppImage' }
  )
  foreach ($package in $websitePackages) {
    Copy-Item -LiteralPath $package.Source -Destination (Join-Path $websiteDownload $package.Name) -Force
  }
  $latestNames = @($websitePackages | ForEach-Object { $_.Name }) + 'version.json'
  Get-ChildItem -LiteralPath $websiteDownload -File |
    Where-Object { $_.Name -match '(?i)^opspub(?:[ _-].*)?\.(exe|dmg|deb|appimage|zip|sig)$' -and $_.Name -notin $latestNames } |
    Remove-Item -Force
  $manifest = [ordered]@{
    version = $version
    tag = $Tag
    publishedAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    files = @($websitePackages | ForEach-Object { $_.Name })
  }
  Write-Utf8NoBom -Path (Join-Path $websiteDownload 'version.json') -Content (($manifest | ConvertTo-Json -Depth 5) + "`n")

  $websiteFiles = @(
    'download/OpsPub-Setup.exe',
    'download/OpsPub-aarch64.dmg',
    'download/OpsPub-x64.dmg',
    'download/OpsPub-amd64.deb',
    'download/OpsPub-x86_64.AppImage',
    'download/version.json'
  )
  Invoke-Git -Repository $backupRoot -Arguments @('add', '--', "releases/$Tag", 'update.json')
  $staged = @(& git -C $backupRoot diff --cached --name-only)
  if ($LASTEXITCODE -ne 0) { throw 'Could not inspect staged Gitee release files.' }
  $unexpectedStaged = @($staged | Where-Object { $_ -ne 'update.json' -and $_ -notlike "releases/$Tag/*" })
  if ($staged -notcontains 'update.json' -or -not ($staged | Where-Object { $_ -like "releases/$Tag/*" }) -or $unexpectedStaged.Count -gt 0) {
    throw "Unexpected staged files in Gitee backup repository: $($staged -join ', ')"
  }

  Invoke-Git -Repository $backupRoot -Arguments @('commit', '-m', "release: OpsPub $Tag")
  if ($remoteBranchExitCode -eq 2) {
    # git ls-remote returns 2 when the remote ref is absent; that is the only
    # case where the first push should create the master branch.
    Invoke-Git -Repository $backupRoot -Arguments @('push', '--set-upstream', 'origin', 'HEAD:master')
  } else {
    Invoke-Git -Repository $backupRoot -Arguments @('push', 'origin', 'HEAD:master')
  }

  Write-Host "Published $Tag to Gitee backup repository."
  Write-Host "Latest website packages copied to $websiteDownload."
  Write-Host 'The website links use stable filenames, so only this release is exposed there.'
  Write-Host "Website files staged for a separate website commit: $($websiteFiles -join ', ')"
}
finally {
  if ($temporaryDownload -and (Test-Path -LiteralPath $temporaryDownload)) {
    Remove-Item -LiteralPath $temporaryDownload -Recurse -Force
  }
}
