# PC용 exe 빌드. 사용: .\build.ps1            → desktop\dist\ayatodance.exe, ayatodance-stat.exe
#                         .\build.ps1 -Out "C:\경로" → 그 폴더에 exe 생성
#                         .\build.ps1 -Apps ayatodance-stat → 스탯창만
# 준비: pip install pywebview pyinstaller pillow (Python 3.10+)
param([string]$Out = "$PSScriptRoot\dist", [string[]]$Apps = @("ayatodance", "ayatodance-stat"))
$work = Join-Path $env:TEMP "ayatodance-build"
$src = @{ "ayatodance" = @("app.py", "index.html"); "ayatodance-stat" = @("stat.py", "stat.html") }
foreach ($a in $Apps) {
  $py, $html = $src[$a]
  Get-Process $a -ErrorAction SilentlyContinue | Stop-Process -Force   # 실행 중이면 덮어쓸 수 없음
  python -m PyInstaller --noconfirm --onefile --windowed --name $a `
    --icon "$PSScriptRoot\ayatodance.ico" `
    --add-data "$PSScriptRoot\$html;." --add-data "$PSScriptRoot\fonts;fonts" `
    --workpath $work --specpath $work --distpath $Out "$PSScriptRoot\$py" 2>&1 | Select-Object -Last 2
  if ($LASTEXITCODE) { throw "빌드 실패: $a" }
  Get-ChildItem "$Out\$a.exe"
}
