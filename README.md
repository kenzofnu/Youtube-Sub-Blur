# YouTube Sub Blur

Chrome extension that blurs hard-coded subtitles on YouTube videos. Built for language immersion -- hide distracting hardsubs so you can focus on listening.

## Features

- Toggleable blur overlay with **Alt + B** (customizable)
- Drag to reposition, drag edges/corners to resize
- Box position and size saved automatically
- Scales between windowed, theater, and fullscreen
- Adjustable blur strength (1-40)
- Option to auto-show on every video

## Install from Chrome Web Store

Coming soon.

## Install manually

1. Download or clone this repo
2. Open `chrome://extensions/` and enable **Developer mode**
3. Click **Load unpacked** and select the project folder
4. Open any YouTube video and press **Alt + B**

## Settings

Click the extension icon to open the popup:

- **Default On** -- auto-show the blur box when a video loads
- **Blur Strength** -- how strong the blur effect is
- **Reset Box Position** -- restore default position

To change the hotkey, go to `chrome://extensions/shortcuts`.

## Privacy

No data is collected. The extension only stores your preferences (blur strength, box position, default on/off) locally via Chrome's storage API. See [Privacy Policy](PRIVACY_POLICY.md).
