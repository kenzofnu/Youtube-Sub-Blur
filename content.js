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

    chrome.storage.sync.set({ boxPosition: pos, boxSize: size });
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

  function show() {
    videoElement = findVideo();
    if (!videoElement) return;
    createOverlay();
    overlay.style.display = "block";
    visible = true;
  }

  function hide() {
    if (overlay) overlay.style.display = "none";
    visible = false;
  }

  function toggle() {
    if (visible) hide();
    else show();
  }

  // Review loop state
  let reviewState = "idle"; // idle | pass1 | pass2
  let reviewReturnTime = 0;
  let reviewCheckInterval = null;

  function startReviewLoop() {
    if (!videoElement || reviewState !== "idle") return;
    if (!visible) show();

    reviewReturnTime = videoElement.currentTime;
    const rewind = settings.rewindSeconds || 10;
    videoElement.currentTime = Math.max(0, reviewReturnTime - rewind);

    // Pass 1: subs visible (blur off), paused
    hide();
    videoElement.pause();
    reviewState = "pass1";

    reviewCheckInterval = setInterval(() => {
      if (reviewState === "pass1" && videoElement.currentTime >= reviewReturnTime) {
        // Pass 1 done, start pass 2: blur on, rewind again
        clearInterval(reviewCheckInterval);
        videoElement.currentTime = Math.max(0, reviewReturnTime - rewind);
        show();
        videoElement.pause();
        reviewState = "pass2";

        reviewCheckInterval = setInterval(() => {
          if (reviewState === "pass2" && videoElement.currentTime >= reviewReturnTime) {
            clearInterval(reviewCheckInterval);
            reviewCheckInterval = null;
            reviewState = "idle";
          }
        }, 200);
      }
    }, 200);
  }

  function cancelReviewLoop() {
    if (reviewCheckInterval) {
      clearInterval(reviewCheckInterval);
      reviewCheckInterval = null;
    }
    reviewState = "idle";
  }

  let repositionTimer = null;
  function onVideoResize() {
    if (!visible || !overlay) return;
    clearTimeout(repositionTimer);
    repositionTimer = setTimeout(() => positionOverlay(), 50);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "toggle-blur") {
      cancelReviewLoop();
      toggle();
    }
    if (message.action === "review-loop") startReviewLoop();
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
