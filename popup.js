const DEFAULTS = {
  defaultOn: true,
  blurAmount: 15,
  boxPosition: null,
  boxSize: null,
  rewindSeconds: 10,
  ankiField: "Picture",
  ankiAudioField: "SentenceAudio",
  audioSeconds: 5,
};

const defaultOnEl = document.getElementById("defaultOn");
const intensiveEl = document.getElementById("intensiveMode");
const blurAmountEl = document.getElementById("blurAmount");
const blurValueEl = document.getElementById("blurValue");
const rewindEl = document.getElementById("rewindSeconds");
const rewindValueEl = document.getElementById("rewindValue");
const ankiFieldEl = document.getElementById("ankiField");
const ankiAudioFieldEl = document.getElementById("ankiAudioField");
const audioSecondsEl = document.getElementById("audioSeconds");
const audioValueEl = document.getElementById("audioValue");
const resetBoxEl = document.getElementById("resetBox");
const statusEl = document.getElementById("status");
const shortcutsLink = document.getElementById("shortcutsLink");

shortcutsLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

function showStatus(text) {
  statusEl.textContent = text;
  setTimeout(() => (statusEl.textContent = ""), 2000);
}

function save(partial) {
  chrome.storage.sync.set(partial, () => {
    showStatus("Saved");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "update-settings" }).catch(() => {});
      }
    });
  });
}

chrome.storage.sync.get(DEFAULTS, (settings) => {
  defaultOnEl.checked = settings.defaultOn;
  blurAmountEl.value = settings.blurAmount;
  blurValueEl.textContent = settings.blurAmount;
  rewindEl.value = settings.rewindSeconds;
  rewindValueEl.textContent = settings.rewindSeconds + "s";
  ankiFieldEl.value = settings.ankiField || "Picture";
  ankiAudioFieldEl.value = settings.ankiAudioField || "SentenceAudio";
  audioSecondsEl.value = settings.audioSeconds || 5;
  audioValueEl.textContent = (settings.audioSeconds || 5) + "s";
});

defaultOnEl.addEventListener("change", () => {
  save({ defaultOn: defaultOnEl.checked });
});

intensiveEl.addEventListener("change", () => {
  const action = intensiveEl.checked ? "start-intensive" : "stop-intensive";
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action }).catch(() => {});
    }
  });
});

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) {
    chrome.tabs.sendMessage(tabs[0].id, { action: "get-intensive-state" })
      .then((response) => {
        if (response && response.intensive) intensiveEl.checked = true;
      })
      .catch(() => {});
  }
});

blurAmountEl.addEventListener("input", () => {
  blurValueEl.textContent = blurAmountEl.value;
});

blurAmountEl.addEventListener("change", () => {
  save({ blurAmount: parseInt(blurAmountEl.value) });
});

rewindEl.addEventListener("input", () => {
  rewindValueEl.textContent = rewindEl.value + "s";
});

rewindEl.addEventListener("change", () => {
  save({ rewindSeconds: parseInt(rewindEl.value) });
});

ankiFieldEl.addEventListener("change", () => {
  const val = ankiFieldEl.value.trim();
  if (val) save({ ankiField: val });
});

ankiAudioFieldEl.addEventListener("change", () => {
  const val = ankiAudioFieldEl.value.trim();
  if (val) save({ ankiAudioField: val });
});

audioSecondsEl.addEventListener("input", () => {
  audioValueEl.textContent = audioSecondsEl.value + "s";
});

audioSecondsEl.addEventListener("change", () => {
  save({ audioSeconds: parseInt(audioSecondsEl.value) });
});

resetBoxEl.addEventListener("click", () => {
  save({ boxPosition: null, boxSize: null });
  showStatus("Box position reset");
});
