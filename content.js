(() => {
  const DEFAULTS = {
    defaultOn: true,
    blurAmount: 15,
    boxPosition: null,
    boxSize: null,
    rewindSeconds: 10,
    ankiField: "Picture",
    ankiAudioField: "SentenceAudio",
    audioSeconds: 5,
    reviewPasses: 2,
  };

  let overlay = null;
  let visible = false;
  let settings = { ...DEFAULTS };
  let isDragging = false;
  let isResizing = false;
  let dragOffset = { x: 0, y: 0 };
  let resizeEdge = null;
  let videoElement = null;
  let ocrOverlay = null;
  let ocrDismissTimer = null;

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULTS, (stored) => {
        Object.assign(settings, stored);
        resolve(settings);
      });
    });
  }

  function saveBoxState() {
    if (!overlay || !videoElement) return;
    const videoRect = videoElement.getBoundingClientRect();
    const container = getVideoContainer();
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    if (videoRect.width === 0 || videoRect.height === 0) return;

    const offsetX = videoRect.left - containerRect.left;
    const offsetY = videoRect.top - containerRect.top;

    const pos = {
      x: (overlay.offsetLeft - offsetX) / videoRect.width,
      y: (overlay.offsetTop - offsetY) / videoRect.height,
    };
    const size = {
      w: overlay.offsetWidth / videoRect.width,
      h: overlay.offsetHeight / videoRect.height,
    };

    settings.boxPosition = pos;
    settings.boxSize = size;

    try {
      chrome.storage.sync.set({ boxPosition: pos, boxSize: size });
    } catch (e) { /* extension context invalidated */ }
  }

  function findVideo() {
    return document.querySelector("video.html5-main-video") || document.querySelector("video");
  }

  function getVideoContainer() {
    return document.querySelector(".html5-video-player") || (videoElement && videoElement.parentElement);
  }

  function createOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "yt-sub-blur-overlay";
    overlay.innerHTML = `
      <div class="ysb-drag-handle" title="Drag to move">⠿</div>
      <div class="ysb-resize-handle ysb-resize-nw" data-edge="nw"></div>
      <div class="ysb-resize-handle ysb-resize-ne" data-edge="ne"></div>
      <div class="ysb-resize-handle ysb-resize-sw" data-edge="sw"></div>
      <div class="ysb-resize-handle ysb-resize-se" data-edge="se"></div>
      <div class="ysb-resize-handle ysb-resize-n" data-edge="n"></div>
      <div class="ysb-resize-handle ysb-resize-s" data-edge="s"></div>
      <div class="ysb-resize-handle ysb-resize-e" data-edge="e"></div>
      <div class="ysb-resize-handle ysb-resize-w" data-edge="w"></div>
    `;

    overlay.style.backdropFilter = `blur(${settings.blurAmount}px)`;
    overlay.style.webkitBackdropFilter = `blur(${settings.blurAmount}px)`;

    const container = getVideoContainer();
    if (container) {
      container.style.position = "relative";
      container.appendChild(overlay);
    }

    positionOverlay();
    setupInteractions();
    return overlay;
  }

  function positionOverlay() {
    if (!overlay || !videoElement) return;
    const videoRect = videoElement.getBoundingClientRect();
    const container = getVideoContainer();
    if (!container) return;
    const containerRect = container.getBoundingClientRect();

    // Video not rendered yet -- retry shortly
    if (videoRect.width < 10 || videoRect.height < 10) {
      setTimeout(() => positionOverlay(), 200);
      return;
    }

    const offsetX = videoRect.left - containerRect.left;
    const offsetY = videoRect.top - containerRect.top;

    if (settings.boxPosition && settings.boxSize) {
      overlay.style.left = `${offsetX + settings.boxPosition.x * videoRect.width}px`;
      overlay.style.top = `${offsetY + settings.boxPosition.y * videoRect.height}px`;
      overlay.style.width = `${settings.boxSize.w * videoRect.width}px`;
      overlay.style.height = `${settings.boxSize.h * videoRect.height}px`;
    } else {
      const w = videoRect.width * 0.6;
      const h = videoRect.height * 0.12;
      overlay.style.width = `${w}px`;
      overlay.style.height = `${h}px`;
      overlay.style.left = `${offsetX + (videoRect.width - w) / 2}px`;
      overlay.style.top = `${offsetY + videoRect.height - h - videoRect.height * 0.08}px`;
    }
  }

  function setupInteractions() {
    if (!overlay) return;

    const dragHandle = overlay.querySelector(".ysb-drag-handle");

    dragHandle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      dragOffset.x = e.clientX - overlay.offsetLeft;
      dragOffset.y = e.clientY - overlay.offsetTop;
      overlay.classList.add("ysb-moving");
    });

    overlay.querySelectorAll(".ysb-resize-handle").forEach((handle) => {
      handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        resizeEdge = handle.dataset.edge;
        dragOffset.x = e.clientX;
        dragOffset.y = e.clientY;
        dragOffset.startLeft = overlay.offsetLeft;
        dragOffset.startTop = overlay.offsetTop;
        dragOffset.startWidth = overlay.offsetWidth;
        dragOffset.startHeight = overlay.offsetHeight;
        overlay.classList.add("ysb-resizing");
      });
    });

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function onMouseMove(e) {
    if (isDragging && overlay) {
      const newLeft = e.clientX - dragOffset.x;
      const newTop = e.clientY - dragOffset.y;
      overlay.style.left = `${newLeft}px`;
      overlay.style.top = `${newTop}px`;
    }

    if (isResizing && overlay) {
      const dx = e.clientX - dragOffset.x;
      const dy = e.clientY - dragOffset.y;
      const minSize = 30;

      let newLeft = dragOffset.startLeft;
      let newTop = dragOffset.startTop;
      let newWidth = dragOffset.startWidth;
      let newHeight = dragOffset.startHeight;

      if (resizeEdge.includes("e")) newWidth = Math.max(minSize, dragOffset.startWidth + dx);
      if (resizeEdge.includes("s")) newHeight = Math.max(minSize, dragOffset.startHeight + dy);
      if (resizeEdge.includes("w")) {
        newWidth = Math.max(minSize, dragOffset.startWidth - dx);
        if (newWidth > minSize) newLeft = dragOffset.startLeft + dx;
      }
      if (resizeEdge.includes("n")) {
        newHeight = Math.max(minSize, dragOffset.startHeight - dy);
        if (newHeight > minSize) newTop = dragOffset.startTop + dy;
      }

      overlay.style.left = `${newLeft}px`;
      overlay.style.top = `${newTop}px`;
      overlay.style.width = `${newWidth}px`;
      overlay.style.height = `${newHeight}px`;
    }
  }

  function onMouseUp() {
    if (isDragging || isResizing) {
      isDragging = false;
      isResizing = false;
      resizeEdge = null;
      if (overlay) {
        overlay.classList.remove("ysb-moving", "ysb-resizing");
      }
      saveBoxState();
    }
  }

  async function show() {
    videoElement = findVideo();
    if (!videoElement) return;
    await loadSettings();
    createOverlay();
    overlay.style.display = "block";
    setBlur(true);
    visible = true;
  }

  function hide() {
    if (overlay) overlay.style.display = "none";
    visible = false;
  }

  function setBlur(on) {
    if (!overlay) return;
    if (on) {
      overlay.style.backdropFilter = `blur(${settings.blurAmount}px)`;
      overlay.style.webkitBackdropFilter = `blur(${settings.blurAmount}px)`;
      overlay.style.background = "rgba(0, 0, 0, 0.08)";
      overlay.style.border = "";
    } else {
      overlay.style.backdropFilter = "none";
      overlay.style.webkitBackdropFilter = "none";
      overlay.style.background = "transparent";
      overlay.style.border = "none";
    }
  }

  function toggle() {
    if (visible) hide();
    else show();
  }

  // Review loop state
  let reviewState = "idle"; // idle | pass1 | pass2 | newcontent
  let reviewCheckInterval = null;
  let intensiveMode = false;
  let programmaticSeek = false;

  function clearReviewInterval() {
    if (reviewCheckInterval) {
      clearInterval(reviewCheckInterval);
      reviewCheckInterval = null;
    }
  }

  function seekTo(time) {
    programmaticSeek = true;
    videoElement.currentTime = time;
    setTimeout(() => { programmaticSeek = false; }, 100);
  }

  function runIntensiveChunk(chunkStart, chunkEnd) {
    seekTo(chunkStart);
    setBlur(false);
    videoElement.play();
    reviewState = "pass1";

    reviewCheckInterval = setInterval(() => {
      if (reviewState === "pass1" && videoElement.currentTime >= chunkEnd) {
        clearReviewInterval();

        if (settings.reviewPasses === 1) {
          setBlur(true);
          if (!intensiveMode) {
            reviewState = "idle";
            return;
          }
          const rewind = settings.rewindSeconds || 10;
          const nextEnd = chunkEnd + rewind;
          reviewState = "newcontent";

          if (nextEnd > videoElement.duration) {
            intensiveMode = false;
            reviewState = "idle";
            return;
          }

          reviewCheckInterval = setInterval(() => {
            if (reviewState === "newcontent" && videoElement.currentTime >= nextEnd) {
              clearReviewInterval();
              runIntensiveChunk(chunkEnd, nextEnd);
            }
          }, 200);
          return;
        }

        seekTo(chunkStart);
        setBlur(true);
        videoElement.play();
        reviewState = "pass2";

        reviewCheckInterval = setInterval(() => {
          if (reviewState === "pass2" && videoElement.currentTime >= chunkEnd) {
            clearReviewInterval();

            if (!intensiveMode) {
              reviewState = "idle";
              return;
            }

            const rewind = settings.rewindSeconds || 10;
            const nextEnd = chunkEnd + rewind;
            reviewState = "newcontent";

            if (nextEnd > videoElement.duration) {
              intensiveMode = false;
              reviewState = "idle";
              return;
            }

            reviewCheckInterval = setInterval(() => {
              if (reviewState === "newcontent" && videoElement.currentTime >= nextEnd) {
                clearReviewInterval();
                runIntensiveChunk(chunkEnd, nextEnd);
              }
            }, 200);
          }
        }, 200);
      }
    }, 200);
  }

  function startReviewLoop() {
    if (!videoElement) return;

    if (reviewState !== "idle") {
      cancelReviewLoop();
      setBlur(true);
      return;
    }

    if (!visible) show();

    const rewind = settings.rewindSeconds || 10;
    const endTime = videoElement.currentTime;
    const startTime = Math.max(0, endTime - rewind);

    seekTo(startTime);
    setBlur(false);
    videoElement.play();
    reviewState = "pass1";

    reviewCheckInterval = setInterval(() => {
      if (reviewState === "pass1" && videoElement.currentTime >= endTime) {
        clearReviewInterval();

        if (settings.reviewPasses === 1) {
          setBlur(true);
          reviewState = "idle";
          videoElement.play();
          return;
        }

        seekTo(startTime);
        setBlur(true);
        videoElement.play();
        reviewState = "pass2";

        reviewCheckInterval = setInterval(() => {
          if (reviewState === "pass2" && videoElement.currentTime >= endTime) {
            clearReviewInterval();
            reviewState = "idle";
          }
        }, 200);
      }
    }, 200);
  }

  function startIntensiveMode() {
    if (!videoElement) return;

    if (intensiveMode) {
      cancelReviewLoop();
      show();
      return;
    }

    intensiveMode = true;
    if (!visible) show();

    const rewind = settings.rewindSeconds || 10;
    const currentTime = videoElement.currentTime;
    const chunkStart = Math.max(0, currentTime - rewind);

    runIntensiveChunk(chunkStart, currentTime);
  }

  function cancelReviewLoop() {
    clearReviewInterval();
    if (reviewState !== "idle") setBlur(true);
    reviewState = "idle";
    intensiveMode = false;
  }

  // --- AnkiConnect ---

  async function ankiConnect(action, params = {}) {
    const data = await chrome.runtime.sendMessage({
      action: "anki-connect",
      ankiAction: action,
      params,
    });
    if (data.error) throw new Error(data.error);
    return data.result;
  }

  async function getLatestNoteId() {
    const noteIds = await ankiConnect("findNotes", { query: "added:1" });
    if (!noteIds || noteIds.length === 0) return null;
    return Math.max(...noteIds);
  }

  function captureVideoFrame() {
    try {
      const video = findVideo();
      if (!video || video.videoWidth === 0) return null;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.92);
    } catch (e) {
      console.warn("[YSB] captureVideoFrame failed:", e);
      return null;
    }
  }

  let ankiPollInterval = null;

  function stopAnkiPoll() {
    if (ankiPollInterval) {
      clearInterval(ankiPollInterval);
      ankiPollInterval = null;
    }
  }

  async function fetchSentenceAudio(videoUrl, captureTime) {
    const duration = settings.audioSeconds || 5;
    const tail = Math.min(2, duration * 0.3);
    const start = Math.max(0, captureTime - duration + tail);
    const end = captureTime + tail;
    try {
      const data = await chrome.runtime.sendMessage({
        action: "fetch-audio",
        url: videoUrl,
        start,
        end,
      });
      if (data.error) throw new Error(data.error);
      return data.audio || null;
    } catch (e) {
      console.warn("[YSB] Audio extraction failed:", e.message);
      return null;
    }
  }

  async function startAnkiPoll(screenshotDataUrl, audioContext) {
    stopAnkiPoll();

    let baselineId;
    try {
      baselineId = await getLatestNoteId();
      console.log("[YSB] Anki poll started, baseline note ID:", baselineId);
    } catch (e) {
      console.warn("[YSB] AnkiConnect not reachable:", e.message);
      return;
    }

    // Start fetching audio in the background immediately
    let audioPromise = null;
    if (audioContext) {
      audioPromise = fetchSentenceAudio(audioContext.url, audioContext.time);
    }

    const picField = settings.ankiField || "Picture";
    const audioField = settings.ankiAudioField || "SentenceAudio";
    let elapsed = 0;
    const POLL_MS = 500;
    const TIMEOUT_MS = 60000;

    ankiPollInterval = setInterval(async () => {
      elapsed += POLL_MS;
      if (elapsed > TIMEOUT_MS) {
        console.log("[YSB] Anki poll timed out");
        stopAnkiPoll();
        return;
      }

      try {
        const latestId = await getLatestNoteId();
        if (latestId && latestId !== baselineId) {
          stopAnkiPoll();
          console.log("[YSB] New card detected:", latestId);

          const imgFile = `ysb_${Date.now()}.jpg`;
          const imgB64 = screenshotDataUrl.replace(/^data:image\/\w+;base64,/, "");

          await ankiConnect("storeMediaFile", { filename: imgFile, data: imgB64 });

          const fields = { [picField]: `<img src="${imgFile}">` };

          if (audioPromise) {
            const audioB64 = await audioPromise;
            if (audioB64) {
              const audioFile = `ysb_${Date.now()}.mp3`;
              await ankiConnect("storeMediaFile", { filename: audioFile, data: audioB64 });
              fields[audioField] = `[sound:${audioFile}]`;
              console.log("[YSB] Audio attached to card");
            }
          }

          await ankiConnect("updateNoteFields", {
            note: { id: latestId, fields },
          });
          console.log("[YSB] Media attached to card");
        }
      } catch (e) {
        console.warn("[YSB] Anki poll error:", e.message);
      }
    }, POLL_MS);
  }

  // --- OCR subtitle mining ---

  function captureBlurBoxArea() {
    const video = findVideo();
    if (!video || !overlay) return null;

    const videoRect = video.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();

    const scaleX = video.videoWidth / videoRect.width;
    const scaleY = video.videoHeight / videoRect.height;

    const sx = Math.max(0, (overlayRect.left - videoRect.left) * scaleX);
    const sy = Math.max(0, (overlayRect.top - videoRect.top) * scaleY);
    const sw = Math.min(video.videoWidth - sx, overlayRect.width * scaleX);
    const sh = Math.min(video.videoHeight - sy, overlayRect.height * scaleY);

    if (sw <= 0 || sh <= 0) {
      console.warn("[YSB] captureBlurBoxArea: invalid dimensions", { sx, sy, sw, sh, videoW: video.videoWidth, videoH: video.videoHeight, overlayRect, videoRect });
      return null;
    }

    const UPSCALE = 2;
    const canvas = document.createElement("canvas");
    canvas.width = sw * UPSCALE;
    canvas.height = sh * UPSCALE;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/png");
  }

  let ocrPausedVideo = false;
  let ocrBlurWasOff = false;

  function showOcrText(text, pauseVideo) {
    if (ocrOverlay) {
      ocrOverlay.remove();
      ocrOverlay = null;
    }
    if (!text || !overlay) return;

    ocrOverlay = document.createElement("div");
    ocrOverlay.id = "ysb-ocr-overlay";
    ocrOverlay.textContent = text.replace(/\n/g, " ");

    const container = getVideoContainer();
    if (container) {
      container.appendChild(ocrOverlay);
      ocrOverlay.style.left = overlay.style.left;
      ocrOverlay.style.top = overlay.style.top;
      ocrOverlay.style.width = overlay.style.width;
      ocrOverlay.style.minHeight = overlay.style.height;
    }

    if (pauseVideo && videoElement) {
      if (!videoElement.paused) videoElement.pause();
      ocrPausedVideo = true;
      const onPlay = () => {
        videoElement.removeEventListener("play", onPlay);
        removeOcrOverlay();
      };
      videoElement.addEventListener("play", onPlay);
    }
  }

  function removeOcrOverlay() {
    clearTimeout(ocrDismissTimer);
    ocrDismissTimer = null;
    if (ocrOverlay) {
      ocrOverlay.remove();
      ocrOverlay = null;
    }
    if (ocrBlurWasOff) {
      hide();
      ocrBlurWasOff = false;
    }
    if (ocrPausedVideo && videoElement) {
      videoElement.play();
      ocrPausedVideo = false;
    }
  }

  async function mineSubtitle() {
    ocrBlurWasOff = !visible;

    if (!videoElement || !overlay || !visible) {
      if (!visible) {
        await show();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }
      if (!overlay) return;
    }

    if (ocrOverlay) {
      stopAnkiPoll();
      removeOcrOverlay();
      return;
    }

    if (ocrBlurWasOff) setBlur(false);

    if (videoElement && !videoElement.paused) {
      videoElement.pause();
      ocrPausedVideo = true;
    }

    showOcrText("Recognizing…");

    const imageData = captureBlurBoxArea();
    if (!imageData) {
      if (ocrBlurWasOff) {
        setBlur(true);
        hide();
        ocrBlurWasOff = false;
      }
      showOcrText("Could not capture frame");
      return;
    }

    const screenshot = captureVideoFrame();
    const currentTime = videoElement ? videoElement.currentTime : 0;
    const videoUrl = window.location.href;

    try {
      const resp = await fetch("http://127.0.0.1:7331/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageData }),
      });
      const result = await resp.json();
      if (result && result.text) {
        showOcrText(result.text, true);
        if (screenshot) {
          startAnkiPoll(screenshot, { url: videoUrl, time: currentTime });
        }
      } else {
        showOcrText("No text detected", false);
      }
    } catch (e) {
      showOcrText("OCR server not running — start ocr_server.py", false);
    }
  }

  let repositionTimer = null;
  function onVideoResize() {
    if (!visible || !overlay) return;
    clearTimeout(repositionTimer);
    repositionTimer = setTimeout(() => positionOverlay(), 50);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "toggle-blur") {
      cancelReviewLoop();
      removeOcrOverlay();
      toggle();
    }
    if (message.action === "review-loop") startReviewLoop();
    if (message.action === "mine-subtitle") mineSubtitle();
    if (message.action === "start-intensive") startIntensiveMode();
    if (message.action === "stop-intensive") {
      cancelReviewLoop();
      setBlur(true);
    }
    if (message.action === "get-intensive-state") {
      sendResponse({ intensive: intensiveMode });
      return true;
    }
    if (message.action === "update-settings") {
      loadSettings().then(() => {
        if (overlay) {
          overlay.style.backdropFilter = `blur(${settings.blurAmount}px)`;
          overlay.style.webkitBackdropFilter = `blur(${settings.blurAmount}px)`;
        }
      });
    }
  });

  const resizeObserver = new ResizeObserver(() => onVideoResize());

  function onUserSeek() {
    if (!programmaticSeek && reviewState !== "idle") {
      cancelReviewLoop();
    }
  }

  function watchForVideo() {
    const observer = new MutationObserver(async () => {
      const video = findVideo();
      if (video && video !== videoElement) {
        videoElement = video;
        videoElement.addEventListener("seeking", onUserSeek);
        resizeObserver.observe(videoElement);
        if (visible) {
          await loadSettings();
          if (overlay) overlay.remove();
          overlay = null;
          show();
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function handleNavigation() {
    removeOcrOverlay();
    await loadSettings();
    videoElement = findVideo();
    if (videoElement) {
      videoElement.addEventListener("seeking", onUserSeek);
      resizeObserver.observe(videoElement);
      if (visible || settings.defaultOn) {
        if (overlay) {
          overlay.remove();
          overlay = null;
        }
        show();
      }
    }
  }

  async function init() {
    await loadSettings();
    watchForVideo();
    handleNavigation();

    document.addEventListener("yt-navigate-finish", handleNavigation);
    document.addEventListener("fullscreenchange", () => onVideoResize());
    document.addEventListener("webkitfullscreenchange", () => onVideoResize());
    window.addEventListener("resize", () => onVideoResize());
  }

  if (document.readyState === "complete") {
    init();
  } else {
    window.addEventListener("load", init);
  }
})();
