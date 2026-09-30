# PC용 ayatodance.exe 빌드. 사용: .\build.ps1            → desktop\dist\ayatodance.exe
#                              .\build.ps1 -Out "C:\경로" → 그 폴더에 exe 생성
# 준비: pip install pywebview pyinstaller pillow (Python 3.10+)
param([string]$Out = "$PSScriptRoot\dist")
$work = Join-Path $env:TEMP "ayatodance-build"
Get-Process ayatodance -ErrorAction SilentlyContinue | Stop-Process -Force   # 실행 중이면 덮어쓸 수 없음
python -m PyInstaller --noconfirm --onefile --windowed --name ayatodance `
  --icon "$PSScriptRoot\ayatodance.ico" `
  --add-data "$PSScriptRoot\index.html;." --add-data "$PSScriptRoot\fonts;fonts" `
  --workpath $work --specpath $work --distpath $Out "$PSScriptRoot\app.py" 2>&1 | Select-Object -Last 2
if ($LASTEXITCODE) { throw "빌드 실패" }
Get-ChildItem "$Out\ayatodance.exe"
