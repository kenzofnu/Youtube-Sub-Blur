const DEFAULTS = {
  defaultOn: true,
  blurAmount: 15,
  boxPosition: null,
  boxSize: null,
  rewindSeconds: 10,
};

const defaultOnEl = document.getElementById("defaultOn");
const blurAmountEl = document.getElementById("blurAmount");
const blurValueEl = document.getElementById("blurValue");
const rewindEl = document.getElementById("rewindSeconds");
const rewindValueEl = document.getElementById("rewindValue");
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
});

defaultOnEl.addEventListener("change", () => {
  save({ defaultOn: defaultOnEl.checked });
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

resetBoxEl.addEventListener("click", () => {
  save({ boxPosition: null, boxSize: null });
  showStatus("Box position reset");
});
