# Creator Autofill — Chrome Extension

Autofill Google Forms for brand collaborations with your saved creator profile.

## Installation

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `creator-autofill` folder
4. The extension icon appears in your toolbar

## Usage

1. Click the extension icon → fill in your details → **Save details**
2. Open any Google Form (e.g. a brand collab form)
3. Click the extension icon → **⚡ Autofill Form**

## Files

- `manifest.json` — Extension manifest (MV3)
- `popup.html`    — Extension UI
- `popup.js`      — Save/load logic + autofill trigger
- `content.js`    — Page-level listener for Google Forms
- `icons/`        — Extension icons
