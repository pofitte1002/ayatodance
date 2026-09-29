// 영상 위에 레이아웃 이미지를 얹고 webp / mp4로 변환 (브라우저 안에서 ffmpeg.wasm)
import { FFmpeg } from "./vendor/ffmpeg/index.js";

const CORE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core";
let ff = null;

async function blobURL(url, type) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`ffmpeg 불러오기 실패 (${r.status})`);
  return URL.createObjectURL(new Blob([await r.arrayBuffer()], { type }));
}

async function load() {
  if (ff) return ff;
  const f = new FFmpeg();
  await f.load({ coreURL: await blobURL(CORE + ".js", "text/javascript"),
                 wasmURL: await blobURL(CORE + ".wasm", "application/wasm") });
  return (ff = f);
}

function videoSize(blob) {
  return new Promise((res, rej) => {
    const v = document.createElement("video");
    v.muted = true; v.preload = "metadata";
    v.onloadedmetadata = () => { res([v.videoWidth, v.videoHeight]); URL.revokeObjectURL(v.src); };
    v.onerror = () => rej(new Error("영상 정보를 읽지 못했어요"));
    v.src = URL.createObjectURL(blob);
  });
}

const XY = { 좌상: "W*0.05:H*0.06", 우상: "W*0.95-w:H*0.06", 좌하: "W*0.05:H*0.94-h",
             우하: "W*0.95-w:H*0.94-h", 중앙: "(W-w)/2:(H-h)/2" };

// o: {ov(dataURL|null), fit('full'|'part'), pos, size(%), fmt('webp'|'mp4'), fps('12'|'15'|'24'|'원본'), q, loop('무한'|'1회')}
export async function convert(video, o, onProgress) {
  const [W, H] = await videoSize(video);
  const f = await load();
  const cb = ({ progress }) => onProgress?.(Math.max(0, Math.min(1, progress)));
  f.on("progress", cb);
  try {
    await f.writeFile("in.mp4", new Uint8Array(await video.arrayBuffer()));
    const args = ["-i", "in.mp4"];
    let fc;
    if (o.ov) {
      await f.writeFile("ov.png", new Uint8Array(await (await fetch(o.ov)).arrayBuffer()));
      args.push("-i", "ov.png");
      const [sc, xy] = o.fit === "full"
        ? [`scale=${W}:${H}:force_original_aspect_ratio=decrease`, "(W-w)/2:(H-h)/2"]
        : [`scale=${Math.round(W * o.size / 100)}:-1`, XY[o.pos]];
      fc = `[1:v]${sc}[o];[0:v][o]overlay=${xy}:format=auto`;
    } else fc = "[0:v]null";
    if (o.fmt === "webp" && o.fps !== "원본") fc += `,fps=${o.fps}`;
    if (o.fmt === "mp4") fc += ",format=yuv420p";
    args.push("-filter_complex", fc + "[v]", "-map", "[v]");
    const out = "out." + o.fmt;
    if (o.fmt === "webp") args.push("-an", "-c:v", "libwebp", "-q:v", String(o.q), "-loop", o.loop === "무한" ? "0" : "1", out);
    else args.push("-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-c:a", "copy", out);
    if (await f.exec(args)) throw new Error("변환 실패 (ffmpeg)");
    const data = await f.readFile(out);
    return new Blob([data.buffer], { type: o.fmt === "webp" ? "image/webp" : "video/mp4" });
  } finally {
    f.off("progress", cb);
    for (const n of ["in.mp4", "ov.png", "out.webp", "out.mp4"]) await f.deleteFile(n).catch(() => {});
  }
}
