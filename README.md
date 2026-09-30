# ayatodance

이미지 한 장으로 Live2D 느낌의 짧은 반복 영상을 만들고, 레이아웃 이미지를 얹어 webp/mp4로 저장하는 앱.
**웹(모바일 포함)** 과 **PC(exe)** 두 가지가 한 레포에 있다.

- 모델: Seedance 2.5 · Seedance 1.5 pro (BytePlus ModelArk), Veo 3 (Google Gemini API)
- 첫 프레임 = 끝 프레임으로 같은 이미지를 넣어 루프가 이어지게 함
- Draft(480p)로 먼저 보고, 같은 움직임으로 업스케일

## 폴더

| 폴더 | 내용 | 동작 |
|---|---|---|
| `docs/` | 웹 버전 (GitHub Pages) | 브라우저에서 API 직접 호출, 변환은 [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm). 키는 브라우저 localStorage |
| `desktop/` | PC 버전 소스 | Python + pywebview 창. API는 curl, 변환은 PC의 ffmpeg. 키는 Windows DPAPI로 암호화 |

웹 주소: https://pofitte1002.github.io/ayatodance/ (Pages 소스: `main` 브랜치의 `/docs`)

## PC 버전 빌드

```powershell
pip install pywebview pyinstaller pillow
winget install Gyan.FFmpeg          # 변환용
.\desktop\build.ps1                 # → desktop\dist\ayatodance.exe
.\desktop\build.ps1 -Out "C:\원하는\폴더"
```

결과 영상과 최종본은 exe 옆 `output\` 폴더에 저장된다.

## 주의

- 두 버전의 화면(`docs/index.html`, `desktop/index.html`)은 거의 같지만 **별도 파일**이다. 화면을 고치면 양쪽에 같이 반영할 것.
- API 키는 코드에 없다. 각 앱의 설정(⚙)에서 입력한다.
- `docs/vendor/ffmpeg/` = @ffmpeg/ffmpeg 0.12.15 (MIT), 코어(wasm)는 unpkg에서 불러온다.
- 폰트: 학교안심 둥근미소 (`docs/fonts/`, `desktop/fonts/`)
