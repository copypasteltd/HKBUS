param([Parameter(Mandatory=$true)][string]$Workspace)
$ErrorActionPreference = 'Stop'
$workspacePath = [IO.Path]::GetFullPath($Workspace)
foreach ($projectBranch in @('backend','admin','wechat','alipay','douyin','android')) {
  $checkoutPath = Join-Path $workspacePath $projectBranch
  if (!(Test-Path -LiteralPath (Join-Path $checkoutPath 'package-lock.json'))) { throw "Missing independent checkout: $checkoutPath" }
  Push-Location $checkoutPath
  try {
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "$projectBranch installation failed." }
    & npm.cmd run typecheck
    if ($LASTEXITCODE -ne 0) { throw "$projectBranch type check failed." }
    if ($projectBranch -ne 'admin') {
      & npm.cmd test
      if ($LASTEXITCODE -ne 0) { throw "$projectBranch regression tests failed." }
    }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "$projectBranch build failed." }
  } finally { Pop-Location }
}
Write-Output 'All six projects built. Official IDE, physical-device, store and production-hosting acceptance are separate.'
