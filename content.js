(() => {
  const DEFAULTS = {
    defaultOn: true,
    blurAmount: 15,
    boxPosition: null,
    boxSize: null,
    rewindSeconds: 10,
  };

  let overlay = null;
  let visible = false;
  let settings = { ...DEFAULTS };
  let isDragging = false;
  let isResizing = false;
  let dragOffset = { x: 0, y: 0 };
  let resizeEdge = null;
  let videoElement = null;

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
    } else {
      overlay.style.backdropFilter = "none";
      overlay.style.webkitBackdropFilter = "none";
      overlay.style.background = "transparent";
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

  function clearReviewInterval() {
    if (reviewCheckInterval) {
      clearInterval(reviewCheckInterval);
      reviewCheckInterval = null;
    }
  }

  function runIntensiveChunk(chunkStart, chunkEnd) {
    // Pass 1: rewind to chunkStart, unblur, play (read subs)
    videoElement.currentTime = chunkStart;
    setBlur(false);
    videoElement.play();
    reviewState = "pass1";

    reviewCheckInterval = setInterval(() => {
      if (reviewState === "pass1" && videoElement.currentTime >= chunkEnd) {
        clearReviewInterval();

        // Pass 2: rewind to chunkStart, blur, play (listen)
        videoElement.currentTime = chunkStart;
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

            // New content: let video play forward with blur for another chunk
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
                // Now loop that new chunk
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

    videoElement.currentTime = startTime;
    setBlur(false);
    videoElement.play();
    reviewState = "pass1";

    reviewCheckInterval = setInterval(() => {
      if (reviewState === "pass1" && videoElement.currentTime >= endTime) {
        clearReviewInterval();
        videoElement.currentTime = startTime;
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
    reviewState = "idle";
    intensiveMode = false;
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
      toggle();
    }
    if (message.action === "review-loop") startReviewLoop();
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

  function watchForVideo() {
    const observer = new MutationObserver(async () => {
      const video = findVideo();
      if (video && video !== videoElement) {
        videoElement = video;
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
    await loadSettings();
    videoElement = findVideo();
    if (videoElement) {
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
