param([string]$Destination = (Join-Path (Get-Location) 'hkbusgo-workspace'))
$ErrorActionPreference = 'Stop'
$workspacePath = [IO.Path]::GetFullPath($Destination)
$repositoryUrl = 'git@github.com:copypasteltd/HKBUS.git'
New-Item -ItemType Directory -Force -Path $workspacePath | Out-Null
foreach ($projectBranch in @('backend','admin','wechat','alipay','douyin','android')) {
  $checkoutPath = Join-Path $workspacePath $projectBranch
  if (Test-Path -LiteralPath $checkoutPath) { throw "Checkout already exists: $checkoutPath. No files were replaced." }
  & git clone --branch $projectBranch --single-branch $repositoryUrl $checkoutPath
  if ($LASTEXITCODE -ne 0) { throw "Clone failed for $projectBranch." }
}
Write-Output "Six independent checkouts created in $workspacePath. Follow each README to install and configure."
