$ErrorActionPreference = 'Stop'
$tools = Join-Path $env:LOCALAPPDATA 'RKHP Tools'
$node = Join-Path $tools 'node-v22.23.4-win-x64\node.exe'
$keyring = Join-Path $tools 'wrangler-x64\node_modules\@napi-rs\keyring'
if (!(Test-Path -LiteralPath $node) -or !(Test-Path -LiteralPath $keyring)) {
    throw 'テスト環境のCLIセットアップが必要です。'
}
$env:RKHP_KEYRING_MODULE = $keyring
$token = & $node -e "try { const {Entry}=require(process.env.RKHP_KEYRING_MODULE); const value=new Entry('rkhp-news-test','publish-token').getPassword(); if(typeof value!=='string'||!/^[A-Za-z0-9_-]{32,200}$/.test(value))process.exit(2);process.stdout.write(value); } catch { process.exit(2); }"
if ($LASTEXITCODE -ne 0 -or !$token) {
    throw '公開用トークンを資格情報ストアから取得できません。'
}
Set-Clipboard -Value $token
$token = $null
Write-Output '公開用トークンをクリップボードへコピーしました。Apps Scriptの設定画面へ貼り付け、チャットには送らないでください。'
