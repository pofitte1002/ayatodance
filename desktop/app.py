import base64, ctypes, ctypes.wintypes as wt, glob, json, os, re, shutil, subprocess, sys, tempfile, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
import webview

BASE = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
CFG_DIR = os.path.join(os.environ["APPDATA"], "ayatodance")
CFG = os.path.join(CFG_DIR, "config.json")
ARK = "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks"
GEM = "https://generativelanguage.googleapis.com/v1beta"
# 문서 예시 기준 버전 포함 ID
SD = {"sd25": "dreamina-seedance-2-5-260628", "sd15": "seedance-1-5-pro-251215"}
VEO_DEFAULT = "veo-3.1-generate-preview"
NOWIN = 0x08000000  # CREATE_NO_WINDOW: ffmpeg 콘솔창 안 뜨게


# ---- API 키 저장: Windows DPAPI로 암호화 (이 PC의 이 사용자만 복호화 가능) ----
class _Blob(ctypes.Structure):
    _fields_ = [("n", wt.DWORD), ("p", ctypes.POINTER(ctypes.c_char))]

def _dpapi(data: bytes, enc: bool) -> bytes:
    i, o = _Blob(len(data), ctypes.create_string_buffer(data, len(data))), _Blob()
    f = ctypes.windll.crypt32.CryptProtectData if enc else ctypes.windll.crypt32.CryptUnprotectData
    if not f(ctypes.byref(i), None, None, None, None, 0, ctypes.byref(o)):
        raise OSError("DPAPI 실패")
    try:
        return ctypes.string_at(o.p, o.n)
    finally:
        ctypes.windll.kernel32.LocalFree(o.p)

def load_cfg():
    try:
        with open(CFG, encoding="utf-8") as f:
            c = json.load(f)
    except (OSError, ValueError):
        c = {}
    for k in ("ark_key", "google_key"):
        if c.get(k):
            try:
                c[k] = _dpapi(base64.b64decode(c[k]), False).decode()
            except Exception:
                c[k] = ""
    return c

def save_cfg(c):
    os.makedirs(CFG_DIR, exist_ok=True)
    out = dict(c)
    for k in ("ark_key", "google_key"):
        if out.get(k):
            out[k] = base64.b64encode(_dpapi(out[k].encode(), True)).decode()
    with open(CFG, "w", encoding="utf-8") as f:
        json.dump(out, f)


# ---- 공용 ----
# 결과·최종본은 exe(개발 중엔 이 파일) 옆 output 폴더에 저장
OUT = os.path.join(os.path.dirname(sys.executable if getattr(sys, "frozen", False) else os.path.abspath(__file__)), "output")

class HttpErr(RuntimeError):
    def __init__(self, msg, status=0, net=False):
        super().__init__(msg)
        self.status, self.net = status, net

def transient(e):  # 네트워크 끊김·5xx는 폴링 중 다음 회차에 다시
    return isinstance(e, HttpErr) and (e.net or e.status >= 500)

# 콘텐츠 검수(저작권·유명 IP·실존 인물 등) 거절은 앱 버그가 아니라 제공사 서버 판정 → 알아보기 쉽게 풀어서 보여줌
def explain(code, msg):
    if not re.search(r"Sensitive|Copyright|저작권|RiskDetected|PolicyViolation|usage guidelines|safety|RaiMediaFiltered|copyright", f"{code} {msg}", re.I):
        return ""
    return ("제공사 콘텐츠 검수에 걸려 거절됐어요 (저작권·유명 캐릭터·실존 인물·민감 요소 등). "
            "앱 오류가 아니라 서버 판정이라 다시 눌러도 같은 결과가 나올 수 있어요. 직접 만든 오리지널 이미지나 다른 이미지로 시도해 주세요.\n"
            f"[{code or '원문'}] {msg}")

def http(url, body=None, headers=None, timeout=120):
    # urllib은 서버가 본문을 다 받기 전에 오류 응답+연결종료하면 10054만 보고 실제 오류를 잃어버림 → Windows 내장 curl 사용
    # 키는 명령줄에 안 보이게 stdin config로, 본문은 임시 파일로 전달
    conf = [f'header = "{k}: {v}"' for k, v in {"Content-Type": "application/json", **(headers or {})}.items()]
    tmp = None
    if body is not None:
        fd, tmp = tempfile.mkstemp(suffix=".json")
        with os.fdopen(fd, "wb") as f:
            f.write(json.dumps(body).encode())
        conf.append(f'data-binary = "@{tmp.replace(os.sep, "/")}"')
    try:
        r = subprocess.run([os.path.join(os.environ["SystemRoot"], "System32", "curl.exe"), "-sS", "--max-time", str(timeout),
                            "-w", "\n%{http_code}", "--config", "-", url],
                           input="\n".join(conf).encode(), capture_output=True, creationflags=NOWIN)
    finally:
        if tmp: os.remove(tmp)
    if r.returncode:
        raise HttpErr(f"네트워크 오류: {r.stderr.decode(errors='replace').strip()}", net=True)
    txt, code = r.stdout.decode("utf-8", "replace").rsplit("\n", 1)
    if not code.startswith("2"):
        ec = ""
        try:
            e = json.loads(txt)["error"]
            msg, ec = e.get("message") or txt[:500], e.get("code") or e.get("status") or ""
        except Exception:
            msg = txt[:500]
        raise HttpErr(explain(ec, msg) or f"HTTP {code}: {ec + ' · ' if ec else ''}{msg}", int(code) if code.isdigit() else 0)
    return json.loads(txt)

def download(url, path, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=300) as r, open(path, "wb") as f:
        shutil.copyfileobj(r, f)
    return path

def uniq(stem, ext):
    p, n = stem + ext, 2
    while os.path.exists(p):
        p, n = f"{stem}_{n}{ext}", n + 1
    return p

def tool(name):
    p = shutil.which(name)
    if p:
        return p
    la = os.environ.get("LOCALAPPDATA", "")
    for g in (rf"{la}\Microsoft\WinGet\Links\{name}.exe", rf"{la}\Microsoft\WinGet\Packages\*FFmpeg*\**\bin\{name}.exe"):
        hit = glob.glob(g, recursive=True)
        if hit:
            return hit[0]
    raise RuntimeError("ffmpeg를 찾을 수 없어요. (winget install Gyan.FFmpeg)")


# ---- Seedance (BytePlus Ark) ----
def ark_run(key, body, stem):
    h = {"Authorization": f"Bearer {key}"}
    tid = http(ARK, body, h)["id"]
    t0 = time.time()
    while time.time() - t0 < 1800:
        time.sleep(5)
        try:
            r = http(f"{ARK}/{tid}", headers=h)
        except HttpErr as e:
            if transient(e): continue
            raise
        if r["status"] == "succeeded":
            return download(r["content"]["video_url"], uniq(stem, ".mp4")), tid
        if r["status"] in ("failed", "cancelled", "expired"):
            er = r.get("error") or {}
            raise RuntimeError(explain(er.get("code", ""), er.get("message", "")) or
                               f"{r['status']}: {er.get('code') + ' · ' if er.get('code') else ''}{er.get('message', '')}")
    raise RuntimeError(f"30분 초과 (task {tid})")

def seedance_one(key, eng, img, prompt, res, dur, audio, draft, stem):
    first = {"type": "image_url", "image_url": {"url": img}, "role": "first_frame"}
    last = {"type": "image_url", "image_url": {"url": img}, "role": "last_frame"}
    content = [{"type": "text", "text": prompt}, first]
    # 1.5 pro Draft는 끝 프레임 불가(문서). 2.5 Draft는 문서에 제한 없음 → 넣어봄, 거부되면 오류가 그대로 표시됨
    if not (draft and eng == "sd15"):
        content.append(last)
    body = {"model": SD[eng], "content": content, "resolution": "480p" if draft else res,
            "duration": dur, "ratio": "adaptive", "generate_audio": audio, "watermark": False}
    if draft:
        body["draft"] = True
    return ark_run(key, body, stem)

def seedance_upscale(key, eng, tid, res, stem):
    # Draft task ID로 같은 모델 본편 생성. 프롬프트·길이·비율·오디오는 서버가 Draft 값 재사용. 2.5는 1080p만.
    body = {"model": SD[eng], "content": [{"type": "draft_task", "draft_task": {"id": tid}}],
            "resolution": "1080p" if eng == "sd25" else res, "watermark": False}
    return ark_run(key, body, stem)


# ---- Veo (Gemini API) ----  ponytail: 키 없이 작성, 첫 실행 때 검증 필요
def veo_one(key, model, img, prompt, res, dur, ratio, stem):
    mime, b64 = img[5:].split(";base64,")
    pic = {"bytesBase64Encoded": b64, "mimeType": mime}
    h = {"x-goog-api-key": key}
    body = {"instances": [{"prompt": prompt, "image": pic, "lastFrame": pic}],
            "parameters": {"aspectRatio": ratio, "resolution": res, "durationSeconds": dur}}
    op = http(f"{GEM}/models/{model}:predictLongRunning", body, h)["name"]
    t0 = time.time()
    while time.time() - t0 < 1800:
        time.sleep(8)
        try:
            r = http(f"{GEM}/{op}", headers=h)
        except HttpErr as e:
            if transient(e): continue
            raise
        if r.get("done"):
            er = r.get("error")
            if er:
                raise RuntimeError(explain(er.get("status", ""), er.get("message", "")) or er.get("message", "") or json.dumps(er, ensure_ascii=False))
            g = (r.get("response") or {}).get("generateVideoResponse") or {}
            samples = g.get("generatedSamples") or []
            if not samples:  # 검수로 걸러지면 샘플 없이 done:true로 옴
                why = " / ".join(g.get("raiMediaFilteredReasons") or [])
                raise RuntimeError(explain("RaiMediaFiltered", why) if why else "영상 없이 끝났어요 (응답이 비어 있음)")
            return download(samples[0]["video"]["uri"], stem + ".mp4", h)
    raise RuntimeError("30분 초과")


# ---- JS에서 부르는 함수들 ----
class Api:
    def get_settings(self):
        c = load_cfg()
        return {"ark": bool(c.get("ark_key")), "google": bool(c.get("google_key")),
                "veo_model": c.get("veo_model") or VEO_DEFAULT, "out": OUT}

    def save_settings(self, ark, google, veo_model, clear):
        c = load_cfg()
        if ark: c["ark_key"] = ark.strip()
        if google: c["google_key"] = google.strip()
        for k in clear: c.pop(k, None)
        c["veo_model"] = veo_model.strip() or VEO_DEFAULT
        save_cfg(c)
        return self.get_settings()

    def generate(self, o):
        """o: img(dataURL), prompt, engine('sd25'|'sd15'|'veo'), draft, res, dur, cnt, audio, ratio"""
        c = load_cfg()
        os.makedirs(OUT, exist_ok=True)
        eng = o["engine"]
        stamp = time.strftime("%m%d_%H%M%S")
        if eng == "veo":
            if not c.get("google_key"): raise RuntimeError("설정에서 Google API 키를 넣어주세요.")
            job = lambda i: veo_one(c["google_key"], c.get("veo_model") or VEO_DEFAULT, o["img"], o["prompt"],
                                    o["res"], o["dur"], o["ratio"], os.path.join(OUT, f"veo_{stamp}_{i+1}"))
        else:
            if not c.get("ark_key"): raise RuntimeError("설정에서 BytePlus API 키를 넣어주세요.")
            d = bool(o.get("draft"))
            tag = f"{eng}{'_draft' if d else ''}"
            job = lambda i: seedance_one(c["ark_key"], eng, o["img"], o["prompt"], o["res"], o["dur"], o["audio"], d,
                                         os.path.join(OUT, f"{tag}_{stamp}_{i+1}"))
        out = []
        with ThreadPoolExecutor(4) as ex:
            for f in [ex.submit(job, i) for i in range(o["cnt"])]:
                try:
                    r = f.result()
                    out.append({"ok": True, "path": r[0], "tid": r[1]} if isinstance(r, tuple) else {"ok": True, "path": r})
                except Exception as e: out.append({"ok": False, "err": str(e)})
        return out

    def upscale(self, eng, tid, res, src):
        c = load_cfg()
        if not c.get("ark_key"): raise RuntimeError("설정에서 BytePlus API 키를 넣어주세요.")
        path, _ = seedance_upscale(c["ark_key"], eng, tid, res, os.path.splitext(src)[0].replace("_draft", "") + "_up")
        return path

    def export(self, video, ov_data, fit, pos, size, fmt, fps, q, loop):
        """video 위에 레이아웃 이미지를 얹고 webp 또는 mp4로 저장. 해상도·길이 유지."""
        ff = tool("ffmpeg")
        W, H = map(int, subprocess.run([tool("ffprobe"), "-v", "error", "-select_streams", "v:0", "-show_entries",
                   "stream=width,height", "-of", "csv=p=0", video], capture_output=True, text=True,
                   creationflags=NOWIN).stdout.strip().split(","))
        args, vf = [ff, "-y", "-i", video], []
        if ov_data:
            ovp = os.path.splitext(video)[0] + "_layout.png"
            with open(ovp, "wb") as f:
                f.write(base64.b64decode(ov_data.split(",", 1)[1]))
            args += ["-i", ovp]
            if fit == "full":
                sc, xy = f"scale={W}:{H}:force_original_aspect_ratio=decrease", "(W-w)/2:(H-h)/2"
            else:
                sc = f"scale={int(W * size / 100)}:-1"
                xy = {"좌상": "W*0.05:H*0.06", "우상": "W*0.95-w:H*0.06", "좌하": "W*0.05:H*0.94-h",
                      "우하": "W*0.95-w:H*0.94-h", "중앙": "(W-w)/2:(H-h)/2"}[pos]
            vf.append(f"[1:v]{sc}[o];[0:v][o]overlay={xy}:format=auto")
        chain = ",".join(([f"fps={fps}"] if fmt == "webp" and fps != "원본" else []))
        if vf:
            fc = vf[0] + ("," + chain if chain else "") + ("" if fmt == "webp" else ",format=yuv420p")
        else:
            fc = "[0:v]" + (chain or "null") + ("" if fmt == "webp" else ",format=yuv420p")
        stem = os.path.splitext(video)[0] + ("_final" if ov_data else "_out")
        args += ["-filter_complex", fc + "[v]", "-map", "[v]"]
        if fmt == "webp":
            dst = uniq(stem, ".webp")
            args += ["-an", "-c:v", "libwebp", "-q:v", str(q), "-loop", "0" if loop == "무한" else "1", dst]
        else:
            dst = uniq(stem, ".mp4")
            args += ["-map", "0:a?", "-c:v", "libx264", "-crf", "18", "-c:a", "copy", dst]
        r = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace", creationflags=NOWIN)
        if r.returncode:
            raise RuntimeError(r.stderr[-800:])
        return {"path": dst, "mb": round(os.path.getsize(dst) / 1048576, 2)}

    def open_folder(self, path=None):
        os.makedirs(OUT, exist_ok=True)
        if path: subprocess.run(["explorer", "/select,", path])
        else: os.startfile(OUT)


if __name__ == "__main__":
    webview.create_window("ayatodance", os.path.join(BASE, "index.html"), js_api=Api(),
                          width=1400, height=980, min_size=(900, 700))
    webview.start()
