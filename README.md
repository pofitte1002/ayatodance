# ayatodance

이미지 한 장으로 Live2D 느낌의 짧은 반복 영상을 만들고, 레이아웃 이미지를 얹어 webp/mp4로 저장하는 웹앱.
설치 없이 브라우저(모바일 포함)에서 동작한다.

- 모델: Seedance 2.5 · Seedance 1.5 pro (BytePlus ModelArk), Veo 3 (Google Gemini API)
- 첫 프레임 = 끝 프레임으로 같은 이미지를 넣어 루프가 이어지게 함
- Draft(480p)로 먼저 보고, 같은 움직임으로 업스케일
- 레이아웃 합성과 webp 변환은 기기 안에서 [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm)으로 처리

## 사용

1. 우측 상단 ⚙에서 API 키 입력 (이 브라우저의 localStorage에만 저장)
2. 이미지 넣기 → 모델·해상도·길이·수량 선택 → Draft 또는 본 생성
3. 결과 카드에서 webp / mp4 저장

## 파일

- `index.html` 화면 · `app.js` 생성/결과 로직 · `conv.js` 레이아웃 합성·변환
- `vendor/ffmpeg/` @ffmpeg/ffmpeg 0.12.15 (MIT) — 코어(wasm)는 unpkg에서 불러옴
- `fonts/` 학교안심 둥근미소
