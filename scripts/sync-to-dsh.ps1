# 同步插件到本机 dsh（开发时用）
#
# 用途：把本仓库的源码复制到 dsh profile 的 node_modules，
# 供 dsh web 加载。dsh 的 bundle 机制从 profile 的 node_modules 读取，
# 所以改完代码必须跑一次本脚本，再重启 dsh web。
#
# 用法：
#   pwsh -File scripts/sync-to-dsh.ps1

$ErrorActionPreference = 'Stop'

$source = Split-Path -Parent $PSScriptRoot
$profileDir = if ($env:DSH_PROFILE_DIR) { $env:DSH_PROFILE_DIR }
              else { Join-Path $env:USERPROFILE '.dsh\profiles\web' }
$target = Join-Path $profileDir 'node_modules\dsh-plugin-busy-workspace'

if (-not (Test-Path $profileDir)) {
    Write-Error "找不到 dsh profile 目录：$profileDir"
}

if (Test-Path $target) {
    Remove-Item $target -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $target | Out-Null

# 只复制 dsh 运行时需要的文件，测试与文档不必进 node_modules
foreach ($item in @('lib', 'assets', 'package.json', 'cordis.patch.yml', 'README.md', 'README.zh.md', 'screenshots.json', 'LICENSE')) {
    $from = Join-Path $source $item
    if (Test-Path $from) {
        Copy-Item $from -Destination $target -Recurse -Force
    }
}

Write-Host "已同步到：$target"
Get-ChildItem $target -Recurse -File | ForEach-Object {
    Write-Host ("  " + $_.FullName.Replace($target, ''))
}

# 检查 profile 是否已注册该 bundle
$pkgPath = Join-Path $profileDir 'package.json'
$pkg = Get-Content $pkgPath -Raw -Encoding utf8 | ConvertFrom-Json
$registered = $pkg.dsh.profile.bundles -contains 'dsh-plugin-busy-workspace'

Write-Host ""
if ($registered) {
    Write-Host "profile 已注册 bundle：dsh-plugin-busy-workspace" -ForegroundColor Green
    Write-Host "下一步：重启 dsh web 并刷新页面。"
} else {
    Write-Host "profile 尚未注册 bundle，请在该 profile 的 package.json 的 dsh.profile.bundles 中加入：" -ForegroundColor Yellow
    Write-Host '  "dsh-plugin-busy-workspace"'
}
