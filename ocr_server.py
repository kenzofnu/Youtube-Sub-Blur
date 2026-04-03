import os
import warnings

warnings.filterwarnings("ignore", message="urllib3|chardet|charset_normalizer")

from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
import json
import base64
import re
import tempfile
import time
import subprocess
import threading
from io import BytesIO

import numpy as np
from PIL import Image
from meikiocr.ocr import MeikiOCR
from owocr.ocr import GoogleLens
import yt_dlp

meiki = None
glens = None

JAPANESE_RE = re.compile(
    r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF\uFF66-\uFF9F]"
)


def has_japanese(text):
    return bool(JAPANESE_RE.search(text))


def meiki_ocr(img_np):
    results = meiki.run_ocr(img_np, punct_conf_factor=0.2)
    lines = [r["text"] for r in results if r.get("text")]
    return "\n".join(lines)


def glens_ocr(img_pil):
    success, result = glens(img_pil)
    if not success:
        return ""
    lines = []
    for paragraph in result.paragraphs:
        for line in paragraph.lines:
            words = []
            for word in line.words:
                words.append(word.text)
                if word.separator:
                    words.append(word.separator)
            line_text = "".join(words).strip()
            if line_text:
                lines.append(line_text)
    return "\n".join(lines)


_audio_url_cache = {}
_cache_lock = threading.Lock()
_CACHE_TTL = 1800


def _video_id(url):
    m = re.search(r"[?&]v=([a-zA-Z0-9_-]{11})", url)
    return m.group(1) if m else url


def _resolve_audio_url(page_url):
    """Extract a direct audio stream URL via yt-dlp (expensive, cached)."""
    ydl_opts = {
        "format": "ba/b",
        "quiet": True,
        "no_warnings": True,
    }
    last_err = None
    for opts in (
        {**ydl_opts, "cookiesfrombrowser": ("chrome",)},
        ydl_opts,
    ):
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(page_url, download=False)
                return info["url"]
        except Exception as e:
            last_err = e
    raise last_err


def _get_audio_url(page_url, force_refresh=False):
    """Return a (possibly cached) direct audio stream URL."""
    vid = _video_id(page_url)
    if not force_refresh:
        with _cache_lock:
            entry = _audio_url_cache.get(vid)
            if entry and time.time() - entry[1] < _CACHE_TTL:
                return entry[0]
    stream_url = _resolve_audio_url(page_url)
    with _cache_lock:
        _audio_url_cache[vid] = (stream_url, time.time())
    return stream_url


def _ffmpeg_clip(stream_url, start, duration, out_path):
    """Use ffmpeg to grab an audio clip directly from a stream URL."""
    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{start:.2f}",
        "-i", stream_url,
        "-t", f"{duration:.2f}",
        "-acodec", "libmp3lame", "-q:a", "4",
        "-loglevel", "error",
        out_path,
    ]
    r = subprocess.run(cmd, capture_output=True, timeout=30)
    if r.returncode != 0:
        stderr = r.stderr.decode(errors="replace").strip()
        raise RuntimeError(f"ffmpeg error: {stderr}")


def extract_audio(url, start, end):
    """Download an audio clip: resolve stream URL once (cached), then ffmpeg clip."""
    duration = end - start
    if duration <= 0 or duration > 60:
        raise ValueError("Invalid duration")

    vid = _video_id(url)

    with tempfile.TemporaryDirectory() as tmpdir:
        out = os.path.join(tmpdir, "clip.mp3")
        stream_url = _get_audio_url(url)
        try:
            _ffmpeg_clip(stream_url, start, duration, out)
        except Exception:
            with _cache_lock:
                _audio_url_cache.pop(vid, None)
            stream_url = _get_audio_url(url, force_refresh=True)
            _ffmpeg_clip(stream_url, start, duration, out)

        with open(out, "rb") as fh:
            return base64.b64encode(fh.read()).decode()


class OCRHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/ocr":
            return self.handle_ocr()
        if self.path == "/audio":
            return self.handle_audio()
        self.send_response(404)
        self.end_headers()

    def handle_audio(self):
        try:
            content_length = int(self.headers["Content-Length"])
            body = self.rfile.read(content_length)
            data = json.loads(body)

            url = data["url"]
            start = float(data["start"])
            end = float(data["end"])

            vid = _video_id(url)
            print(f"[audio] {vid} {start:.1f}–{end:.1f}s", end=" ", flush=True)
            t0 = time.time()
            audio_b64 = extract_audio(url, start, end)
            print(f"OK ({time.time() - t0:.1f}s, {len(audio_b64) // 1024}KB)")

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"audio": audio_b64}).encode())
        except Exception as e:
            print(f"FAIL: {e}")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def handle_ocr(self):
        try:
            content_length = int(self.headers["Content-Length"])
            body = self.rfile.read(content_length)
            data = json.loads(body)

            img_str = data["image"]
            if "," in img_str:
                img_str = img_str.split(",", 1)[1]
            img_bytes = base64.b64decode(img_str)
            img_pil = Image.open(BytesIO(img_bytes)).convert("RGB")
            img_np = np.array(img_pil)[:, :, ::-1]  # RGB -> BGR for OpenCV

            # Pass 1: Google Lens (most accurate)
            text = glens_ocr(img_pil) if glens and glens.available else ""
            source = "glens"

            # Pass 2: fall back to meikiocr if Lens returned nothing
            if not text or not has_japanese(text):
                meiki_text = meiki_ocr(img_np)
                if meiki_text:
                    text = meiki_text
                    source = "meiki"

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"text": text, "source": source}).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"text": "", "error": str(e)}).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        pass


def main():
    global meiki, glens
    print("Loading meikiocr (local)...")
    meiki = MeikiOCR()
    print("Loading Google Lens (fallback)...")
    glens = GoogleLens()
    if not glens.available:
        print("WARNING: Google Lens not available, local-only mode")
    print("Ready. OCR server running on http://localhost:7331")
    print("  Pass 1: meikiocr (local, fast)")
    print("  Pass 2: Google Lens (fallback if meiki finds nothing)")

    class ThreadedServer(ThreadingMixIn, HTTPServer):
        daemon_threads = True

    server = ThreadedServer(("127.0.0.1", 7331), OCRHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()


if __name__ == "__main__":
    main()
