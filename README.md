# QuickTranslate (English → Bangla Chrome Extension)

An unobtrusive, zero-friction Chrome Extension (Manifest V3) that translates English vocabulary and multi-word phrases directly into Bangla (Bengali) within your reading workflow.

---

## 🌟 Key Features

- **Double-Click Instant Translation**: Double-click any unfamiliar English word to instantly display an isolated floating translation bubble with Bangla definitions, part of speech, and phonetics.
- **Multi-Word Phrase Action Badge**: Drag-selecting 2 to 4 words displays a subtle `বাং Translate` floating pill so routine text copying remains unhindered.
- **Zero Style Interference (Shadow DOM)**: In-page tooltips are isolated inside an open Shadow DOM root, eliminating host web page CSS conflicts.
- **Hybrid Translation Pipeline**:
  - **Instant Offline Dictionary**: 9,500+ curated high-frequency English words loaded locally (<10ms latency).
  - **Online Google Translate Fallback**: Seamless background worker API fallback for rare words, inflections, and multi-word phrases.
  - **Dynamic LRU Cache**: Automatically stores translation queries in `chrome.storage.local` for instant repeat access.
- **Audio Pronunciation**: Native Web Speech API integration (`SpeechSynthesis`) for instant spoken English audio.
- **3-Tab Extension Popup**:
  - **Search**: Manual search with quick chip suggestions and copy button.
  - **History**: Last 50 looked-up vocabulary items with audio playback and deletion.
  - **Settings**: Live toggles for Alt/Option key requirement, theme mode, and per-site domain exclusions.
- **Form Safety & Privacy**: Automatically suppressed in `<input>`, `<textarea>`, and `contenteditable` elements. Zero browsing history tracked.

---

## 🚀 How to Install in Google Chrome

1. Open Google Chrome and enter `chrome://extensions` in the address bar.
2. Enable **Developer mode** via the toggle switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left toolbar.
4. Select this directory: `/home/jihad/projects/others/e2b`.
5. The **QuickTranslate** icon will appear in your Chrome toolbar!

---

## 🧪 Testing the Extension

Open the test playground in your browser:
```bash
# Simply open in your browser:
file:///home/jihad/projects/others/e2b/test/demo.html
```
Test scenarios included:
1. **Double-click single words** (`serendipity`, `developer`, `computer`, `beautiful`).
2. **Drag-select multi-word phrases** (`artificial intelligence`, `machine learning`, `peace of mind`).
3. **Form input suppression** (inputs, textareas, and contenteditable boxes).
4. **Viewport edge collision handling** (top/bottom flip, left/right clamping).

---

## 📁 Project Structure

```
e2b/
├── manifest.json              # Chrome Extension Manifest V3 configuration
├── background.js              # Service worker: hybrid translation, caching, history
├── content.js                 # Content script: selection detection & Shadow DOM card
├── content.css                # Scoped stylesheet for Shadow DOM tooltip
├── popup.html                 # 3-tab toolbar modal (Search, History, Settings)
├── popup.css                  # Modern styling with light/dark theme tokens
├── popup.js                   # Popup tab switching, live query, and storage sync
├── data/
│   └── dictionary.json        # Curated 9,500 word English-Bangla dataset (795 KB)
├── assets/
│   ├── icon16.png             # Extension toolbar icon (16x16)
│   ├── icon48.png             # Extension management icon (48x48)
│   └── icon128.png            # Chrome Web Store & installation icon (128x128)
├── test/
│   └── demo.html              # Standalone interactive test suite
├── scripts/
│   ├── build_dictionary.py    # Python script compiling curated dictionary
│   ├── generate_icons.py      # Python script generating high-res icons
│   └── verify_extension.js    # Automated test runner for manifest, data, and API
└── docs/
    ├── prd.md                 # Product Requirement Document
    └── architecture.md        # Technical Architecture & Specification
```
