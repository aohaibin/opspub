param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^v\d+\.\d+\.\d+$')]
  [string]$Tag,

  [string]$PackageDirectory,
  [string]$ReleaseNotesFile,
  [string]$BackupRepoPath = 'D:\itemWork\bushu\yunwei\opspub',
  [string]$WebsitePath = 'D:\itemWork\bushu\doler\yuming\yuming\opspub'
)

$ErrorActionPreference = 'Stop'
$sourceRepo = 'aohaibin/opspub'
$version = $Tag.Substring(1)
$temporaryDownload = $null
$packageRoot = $PackageDirectory
$sourceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

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

function Get-ReleaseSummary {
  param([string]$RepositoryPath, [string]$ReleaseTag, [string]$NotesFile)

  $generator = Join-Path $PSScriptRoot 'generate-release-notes.mjs'
  $generatorArguments = @($generator, '--repository', $RepositoryPath, '--tag', $ReleaseTag)
  if ($NotesFile) { $generatorArguments += @('--notes-file', (Resolve-Path -LiteralPath $NotesFile).Path) }
  $previousEncoding = [Console]::OutputEncoding
  try {
    # Windows PowerShell 也按 UTF-8 解码 Node 输出，避免中文摘要在发布时变成乱码。
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $json = @(& node @generatorArguments)
    if ($LASTEXITCODE -ne 0) { throw 'Could not generate complete release notes from version history.' }
  } finally {
    [Console]::OutputEncoding = $previousEncoding
  }
  return (($json -join "`n") | ConvertFrom-Json)
}

try {
  # 先完整汇总版本区间；历史不全等情况在复制安装包或推送前失败。
  $releaseSummary = Get-ReleaseSummary -RepositoryPath $sourceRoot -ReleaseTag $Tag -NotesFile $ReleaseNotesFile
  $notes = $releaseSummary.notes
  Write-Host "Release notes generated from $($releaseSummary.range) ($($releaseSummary.commitCount) commits)."
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
  $windowsUpdater = @($assets | Where-Object { $_.Name -match '(?i)-setup\.nsis\.zip$' })
  $armDmg = @($assets | Where-Object { $_.Name -match '(?i)_aarch64\.dmg$' })
  $armUpdater = @($assets | Where-Object { $_.Name -match '(?i)_aarch64\.app\.tar\.gz$' })
  $intelDmg = @($assets | Where-Object { $_.Name -match '(?i)_x64\.dmg$' })
  $intelUpdater = @($assets | Where-Object { $_.Name -match '(?i)_x64\.app\.tar\.gz$' })
  $debs = @($assets | Where-Object { $_.Extension -ieq '.deb' })
  $appImages = @($assets | Where-Object { $_.Extension -ieq '.AppImage' })
  $linuxUpdater = @($assets | Where-Object { $_.Name -match '(?i)_amd64\.AppImage\.tar\.gz$' })
  if ($setup.Count -ne 1 -or $windowsUpdater.Count -ne 1 -or $armDmg.Count -ne 1 -or $armUpdater.Count -ne 1 -or $intelDmg.Count -ne 1 -or $intelUpdater.Count -ne 1 -or $debs.Count -ne 1 -or $appImages.Count -ne 1 -or $linuxUpdater.Count -ne 1) {
    throw "Expected Windows installer/updater, macOS ARM/Intel DMG/updater, Linux DEB/AppImage/updater in $packageRoot."
  }

  $updaterAssets = @($windowsUpdater[0], $armUpdater[0], $intelUpdater[0], $linuxUpdater[0])
  $updaterSignatures = @{}
  foreach ($asset in $updaterAssets) {
    $signaturePath = Join-Path $packageRoot ($asset.Name + '.sig')
    if (-not (Test-Path -LiteralPath $signaturePath -PathType Leaf)) {
      throw "Updater signature is missing: $signaturePath"
    }
    $assetSignature = (Get-Content -LiteralPath $signaturePath -Raw -Encoding utf8).Trim()
    try { [void][Convert]::FromBase64String($assetSignature) }
    catch { throw "Updater signature is not valid base64: $signaturePath" }
    $updaterSignatures[$asset.Name] = $assetSignature
  }
  $signature = $updaterSignatures[$windowsUpdater[0].Name]

  $releaseDirectory = Join-Path $backupRoot (Join-Path 'releases' $Tag)
  New-Item -ItemType Directory -Force -Path $releaseDirectory | Out-Null
  foreach ($asset in $assets) {
    Copy-Item -LiteralPath $asset.FullName -Destination (Join-Path $releaseDirectory $asset.Name) -Force
  }

  $assetBaseUrl = "https://gitee.com/aohai/opspub/raw/master/releases/$Tag"
  $encodedInstaller = [System.Uri]::EscapeDataString($windowsUpdater[0].Name)
  # 官网、备份源与版本清单共用一次发布时间，不使用提交时间，也不各自产生不同时间。
  $publishedAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
  $update = [ordered]@{
    version = $version
    notes = $notes
    pub_date = $publishedAt
    platforms = [ordered]@{
      'windows-x86_64' = [ordered]@{
        signature = $signature
        url = "$assetBaseUrl/$encodedInstaller"
      }
    }
  }
  $updatePath = Join-Path $backupRoot 'update.json'
  Write-Utf8NoBom -Path $updatePath -Content (($update | ConvertTo-Json -Depth 8) + "`n")

  $websiteAssetNames = @{
    Windows = 'OpsPub-updater-windows-x86_64.nsis.zip'
    Arm = 'OpsPub-updater-darwin-aarch64.app.tar.gz'
    Intel = 'OpsPub-updater-darwin-x86_64.app.tar.gz'
    Linux = 'OpsPub-updater-linux-x86_64.AppImage.tar.gz'
  }
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
  $websiteUpdaterPackages = @(
    @{ Source = $windowsUpdater[0].FullName; Name = $websiteAssetNames.Windows },
    @{ Source = $armUpdater[0].FullName; Name = $websiteAssetNames.Arm },
    @{ Source = $intelUpdater[0].FullName; Name = $websiteAssetNames.Intel },
    @{ Source = $linuxUpdater[0].FullName; Name = $websiteAssetNames.Linux }
  )
  foreach ($package in $websiteUpdaterPackages) {
    Copy-Item -LiteralPath $package.Source -Destination (Join-Path $websiteDownload $package.Name) -Force
  }
  $latestNames = @($websitePackages | ForEach-Object { $_.Name }) + @($websiteUpdaterPackages | ForEach-Object { $_.Name }) + 'version.json' + 'update.json'
  Get-ChildItem -LiteralPath $websiteDownload -File |
    Where-Object { $_.Name -match '(?i)^opspub(?:[ _-].*)?\.(exe|dmg|deb|appimage|zip|sig|gz)$' -and $_.Name -notin $latestNames } |
    Remove-Item -Force
  $manifest = [ordered]@{
    version = $version
    tag = $Tag
    publishedAt = $publishedAt
    notes = $notes
    files = @($websitePackages | ForEach-Object { $_.Name })
  }
  Write-Utf8NoBom -Path (Join-Path $websiteDownload 'version.json') -Content (($manifest | ConvertTo-Json -Depth 5) + "`n")

  $websiteBaseUrl = 'https://www.opspub.com/download'
  $websiteUpdate = [ordered]@{
    version = $version
    notes = $notes
    pub_date = $publishedAt
    platforms = [ordered]@{
      'windows-x86_64' = [ordered]@{
        signature = $signature
        url = "$websiteBaseUrl/$($websiteAssetNames.Windows)"
      }
      'darwin-aarch64' = [ordered]@{
        signature = $updaterSignatures[$armUpdater[0].Name]
        url = "$websiteBaseUrl/$($websiteAssetNames.Arm)"
      }
      'darwin-x86_64' = [ordered]@{
        signature = $updaterSignatures[$intelUpdater[0].Name]
        url = "$websiteBaseUrl/$($websiteAssetNames.Intel)"
      }
      'linux-x86_64' = [ordered]@{
        signature = $updaterSignatures[$linuxUpdater[0].Name]
        url = "$websiteBaseUrl/$($websiteAssetNames.Linux)"
      }
    }
  }
  Write-Utf8NoBom -Path (Join-Path $websiteDownload 'update.json') -Content (($websiteUpdate | ConvertTo-Json -Depth 8) + "`n")

  $websiteFiles = @(
    'download/OpsPub-Setup.exe',
    'download/OpsPub-aarch64.dmg',
    'download/OpsPub-x64.dmg',
    'download/OpsPub-amd64.deb',
    'download/OpsPub-x86_64.AppImage',
    'download/version.json',
    'download/update.json'
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
