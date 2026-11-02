# 스탯창만 화면 위에 띄우는 작은 창 (ayatodance-stat.exe)
# 잔량 차감은 본 앱(app.py spend)이 config.json에 해 두고, 여기선 읽기만 함
import json, os
import webview
from app import BASE, CFG, PACK


class Api:
    def pack(self):
        try:
            with open(CFG, encoding="utf-8") as f:
                c = json.load(f)
        except (OSError, ValueError):
            c = {}
        return {k: c.get(k) for k in PACK}

    def close(self):
        webview.windows[0].destroy()


if __name__ == "__main__":
    W, H = 460, 100
    s = webview.screens[0]
    webview.create_window("ayatodance-stat", os.path.join(BASE, "stat.html"), js_api=Api(),
                          width=W, height=H, x=s.width - W - 24, y=24,  # 화면 오른쪽 위
                          frameless=True, easy_drag=True, on_top=True, resizable=False, background_color="#6E7E9B")
    webview.start()
