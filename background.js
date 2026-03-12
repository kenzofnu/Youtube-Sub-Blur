chrome.commands.onCommand.addListener((command) => {
  if (
    command === "toggle-blur" ||
    command === "review-loop" ||
    command === "mine-subtitle"
  ) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: command }).catch(() => {});
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "anki-connect") {
    fetch("http://127.0.0.1:8765", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: message.ankiAction, version: 6, params: message.params }),
    })
      .then((r) => r.json())
      .then((data) => sendResponse(data))
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }

  if (message.action === "fetch-audio") {
    fetch("http://127.0.0.1:7331/audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: message.url, start: message.start, end: message.end }),
    })
      .then((r) => r.json())
      .then((data) => sendResponse(data))
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
});
