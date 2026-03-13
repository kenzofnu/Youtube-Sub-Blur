from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
import json
import base64
import re
import subprocess
import sys
import tempfile
import os
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


def _ffmpeg_subprocess_args():
    """Return extra kwargs to hide the ffmpeg console window on Windows."""
    if sys.platform != "win32":
        return {}
    si = subprocess.STARTUPINFO()
    si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    si.wShowWindow = subprocess.SW_HIDE
    return {
        "startupinfo": si,
        "creationflags": subprocess.CREATE_NO_WINDOW,
        "stdin": subprocess.DEVNULL,
    }


def extract_audio(url, start, end):
    """Use yt-dlp (Python API) + ffmpeg to extract an audio clip."""
    duration = end - start
    if duration <= 0 or duration > 60:
        raise ValueError("Invalid duration")

    with tempfile.TemporaryDirectory() as tmpdir:
        out_path = os.path.join(tmpdir, "clip.mp3")

        ydl_opts = {
            "format": "ba",
            "outtmpl": os.path.join(tmpdir, "full.%(ext)s"),
            "quiet": True,
            "no_warnings": True,
            "downloader": "native",
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        raw_file = None
        for f in os.listdir(tmpdir):
            if f.startswith("full."):
                raw_file = os.path.join(tmpdir, f)
                break

        if not raw_file:
            raise RuntimeError("yt-dlp produced no output file")

        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", raw_file,
                "-ss", f"{start:.2f}",
                "-t", f"{duration:.2f}",
                "-vn", "-acodec", "libmp3lame", "-q:a", "4",
                out_path,
            ],
            capture_output=True, text=True, timeout=60,
            **_ffmpeg_subprocess_args(),
        )
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {result.stderr.strip()}")

        if not os.path.exists(out_path):
            raise RuntimeError("Audio file was not created")

        with open(out_path, "rb") as f:
            return base64.b64encode(f.read()).decode()


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

            audio_b64 = extract_audio(url, start, end)

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"audio": audio_b64}).encode())
        except Exception as e:
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
