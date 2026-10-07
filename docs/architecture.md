# Technical Architecture & Specification: QuickTranslate (EN → BN)

## 1. System Overview

QuickTranslate is a lightweight, zero-friction Chrome Extension (Manifest V3) that translates English words and phrases into Bangla (Bengali) directly within the user's reading workflow. 

Based on the design alignment:
- **Architecture Style:** Vanilla JavaScript (ES6+), HTML5, CSS3 without build step or external bundlers for transparent debugging and zero-friction development.
- **Encapsulation:** In-page translation tooltips are rendered inside an isolated **Shadow DOM** to guarantee zero style collisions with host web pages.
- **Data Engine:** A **Hybrid Translation Pipeline** combining an offline bundled dictionary for instant common-word lookups with a Google Translate background service worker fallback and dynamic LRU storage caching.

---

## 2. Component Architecture

```
+---------------------------------------------------------------------------------+
|                                 Google Chrome                                   |
|                                                                                 |
|  +-----------------------------------+    +----------------------------------+  |
|  |             Web Page              |    |       Extension Popup (UI)       |  |
|  |                                   |    |          popup.html / .js        |  |
|  |  +-----------------------------+  |    |                                  |  |
|  |  |  content.js                 |  |    |  +------------+---------------+  |  |
|  |  |  - Mouseup / DblClick event |  |    |  | Tab: Search| Tab: History  |  |  |
|  |  |  - Selection sanitization   |  |    |  +------------+---------------+  |  |
|  |  |  - Coordinate calculation   |  |    |  | Tab: Settings (Toggles)    |  |  |
|  |  +--------------+--------------+  |    |  +----------------------------+  |  |
|  |                 |                 |    +-----------------+----------------+  |
|  |  +--------------v--------------+  |                      |                   |
|  |  | Shadow DOM Container        |  |                      |                   |
|  |  |  - Isolated CSS             |  |                      |                   |
|  |  |  - Floating Action Badge    |  |                      |                   |
|  |  |  - Rich Translation Card    |  |                      |                   |
|  |  |  - Web Speech Pronunciation |  |                      |                   |
|  |  +-----------------------------+  |                      |                   |
|  +-----------------+-----------------+                      |                   |
|                    |                                        |                   |
|                    +-------------------\      /-------------+                   |
|                                         v    v                                  |
|                            chrome.runtime.sendMessage                           |
|                                         |                                       |
|                                         v                                       |
|  +---------------------------------------------------------------------------+  |
|  |                  Background Service Worker (background.js)                |  |
|  |                                                                           |  |
|  |  1. Check chrome.storage.local (LRU Cache)                                |  |
|  |  2. Check Bundled Offline Dictionary (data/dictionary.json)               |  |
|  |  3. Fallback: Google Translate Web API (translate.googleapis.com)         |  |
|  |  4. Save result to LRU Cache + History Log                                |  |
|  +---------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------+
```

---

## 3. Core Decision Matrix (Resolved via Grill-Me)

| Dimension | Decision | Rationale |
|---|---|---|
| **Tech Stack** | Vanilla JS / ES6+, HTML5, CSS3 | Instant iteration, loads directly in Chrome unpacked mode, no build tooling or node_modules required. |
| **Translation Engine** | Hybrid: Bundled dictionary + API Fallback | <10ms latency for common English vocabulary offline; seamless online fallback for phrases and rare words. |
| **Trigger Mechanism** | Immediate on double-click; Floating action icon on multi-word selection | Prevents interrupting everyday text selection/copying while remaining instantaneous when double-clicking unfamiliar words. |
| **DOM Isolation** | Shadow DOM (`attachShadow({ mode: 'open' })`) | Complete encapsulation: host page CSS (resets, themes, fonts) cannot distort tooltip UI, and tooltip styles never leak to host DOM. |
| **Popup UI** | Multi-tab popup (Search, History, Settings) | Provides quick manual lookups, 50-word revision list with deletion, and live user toggles in a single convenient panel. |
| **Offline Cache** | Curated Core (~5,000-10,000 words) + dynamic LRU Cache | Balances lightweight extension bundle (<1MB) with high hit-rate, persisting dynamic translations into `chrome.storage.local`. |
| **Privacy & Safety** | Exclude input/editable fields + Domain blacklist toggle | Prevents disruptive popups when typing inside forms, inputs, code editors, and textareas. Zero user browsing history tracking. |

---

## 4. Directory & File Structure

```
e2b/
├── manifest.json              # Chrome Extension Manifest V3 configuration
├── background.js              # Service worker handling dictionary lookup, API fallback, caching
├── content.js                 # Content script: selection listeners, coordinates, Shadow DOM injection
├── content.css                # Scoped stylesheet injected inside Shadow DOM
├── popup.html                 # Extension toolbar popup layout (Search, History, Settings tabs)
├── popup.js                   # Popup logic: tab switching, manual query, history, settings management
├── popup.css                  # Popup styling with modern dark/light styling
├── data/
│   └── dictionary.json        # Curated English-Bangla dictionary dataset
├── assets/
│   ├── icon16.png             # Toolbar icon (16x16)
│   ├── icon48.png             # Chrome extensions manager icon (48x48)
│   └── icon128.png            # Chrome Web Store & installation icon (128x128)
├── test/
│   └── demo.html              # Standalone demo page to test double-click, selection, and edge cases
└── docs/
    ├── prd.md                 # Product Requirement Document
    └── architecture.md        # Technical Architecture & Specification (This Document)
```

---

## 5. Detailed Technical Specifications

### 5.1 Content Script & Shadow DOM Injection
1. **Selection Detection (`content.js`):**
   - Listens to `mouseup` and `dblclick` events on `document`.
   - Ignores events originating inside editable elements: `input`, `textarea`, `[contenteditable="true"]`, `select`.
   - Extracts selection string via `window.getSelection()`.
   - Sanitizes text: trims whitespace, removes boundary punctuation, checks word count (1 to 4 words).
   - If user setting requires modifier key (e.g. `Alt/Option`), checks `event.altKey` before showing.
2. **Shadow Host & Root:**
   - Single custom element container `#quicktranslate-host` attached to `document.documentElement` or `document.body`.
   - Shadow root created with `mode: 'open'`.
   - Content stylesheet injected via `<style>` or `AdoptedStyleSheets` inside the shadow root.
3. **Smart Viewport Collision Positioning:**
   - Retrieves selection bounding rectangle via `range.getBoundingClientRect()`.
   - Calculates fixed viewport position.
   - If tooltip overflows right/bottom edges, automatically flips alignment above the selection or clamps within viewport padding (8px).

### 5.2 Translation Engine & Background Worker (`background.js`)
1. **Lookup Hierarchy:**
   - **Step 1:** Normalized input (`text.toLowerCase().trim()`).
   - **Step 2:** Check in-memory / `chrome.storage.local` LRU translation cache.
   - **Step 3:** Check bundled `dictionary.json`.
   - **Step 4:** If not found and user has network connectivity, fetch from Google Translate endpoint:
     `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=bn&dt=t&dt=bd&q=${encodeURIComponent(text)}`
   - **Step 5:** Parse translation, part-of-speech definitions, and synonyms.
   - **Step 6:** Save to cache and history (last 50 items).
2. **Error Handling & Fallback:**
   - If offline and word is missing from local dictionary, display helpful offline badge: *"Word not found in offline dictionary. Connect to internet for online lookup."*
   - Timeout on external API queries set to 3,000ms.

### 5.3 Audio Pronunciation (`Web Speech API`)
- Content script and popup trigger pronunciation using the native browser `speechSynthesis` API:
  ```javascript
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
  ```
- Works completely offline and with zero external audio streaming latency.

### 5.4 Storage Schema (`chrome.storage.local`)
```json
{
  "settings": {
    "enabled": true,
    "requireAltKey": false,
    "theme": "system",
    "disabledDomains": []
  },
  "history": [
    {
      "word": "serendipity",
      "meaning": "আকস্মিক সৌভাগ্য লাভ",
      "pos": "noun",
      "timestamp": 1728300000000
    }
  ],
  "cache": {
    "ephemeral": {
      "meaning": "ক্ষণস্থায়ী",
      "pos": "adjective",
      "timestamp": 1728300000000
    }
  }
}
```

---

## 6. Implementation Milestones

1. **Phase 1: Project Setup & Core Dictionary Data**
   - Setup `manifest.json` (Manifest V3, permissions: `storage`, `activeTab`, `scripting`).
   - Create curated `data/dictionary.json` with high-frequency English words and Bangla definitions.
   - Generate crisp SVG/PNG icons (16, 48, 128px).

2. **Phase 2: Background Service Worker & Translation Pipeline**
   - Implement message listeners for `TRANSLATE_QUERY`, `GET_HISTORY`, `CLEAR_HISTORY`, `GET_SETTINGS`, `UPDATE_SETTINGS`.
   - Implement hybrid lookup: cache check -> offline dictionary -> Google Translate web API fallback.
   - Implement LRU caching and history persistence.

3. **Phase 3: Content Script & Isolated Shadow DOM UI**
   - Implement selection capturing, double-click handler, and editable field suppression.
   - Build Shadow DOM container, floating action badge, and rich translation card.
   - Add pronunciation speaker button and copy-to-clipboard button.
   - Implement edge collision detection.

4. **Phase 4: Extension Toolbar Popup UI**
   - Build 3-tab modern UI (`popup.html`, `popup.css`, `popup.js`):
     - **Search Tab:** Instant input with Bangla output card.
     - **History Tab:** Scrollable 50-word revision list with individual and bulk delete.
     - **Settings Tab:** Modifier key toggle, theme toggle, domain exclusion toggle.

5. **Phase 5: Verification & Demo Page**
   - Create `test/demo.html` with various text samples, complex formatting, input fields, and instructions for testing the unpacked extension.
