/**
 * QuickTranslate: English to Bangla
 * Manifest V3 Background Service Worker
 * Handles hybrid translation pipeline, storage caching, history, and user settings.
 */

const DEFAULT_SETTINGS = {
  enabled: true,
  requireAltKey: false,
  theme: 'system', // 'system' | 'light' | 'dark'
  autoSpeak: false,
  disabledDomains: []
};

const MAX_HISTORY_ITEMS = 50;
const MAX_CACHE_ITEMS = 500;
const ONLINE_API_TIMEOUT_MS = 3500;

// In-memory reference for fast lookup during service worker lifetime
let offlineDictionary = null;
let isDictionaryLoading = false;

/**
 * Initialize default configuration on extension install or update.
 */
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const data = await chrome.storage.local.get(['settings', 'history', 'cache']);
    const updates = {};

    if (!data.settings) {
      updates.settings = DEFAULT_SETTINGS;
    } else {
      // Merge any missing keys
      updates.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    }

    if (!Array.isArray(data.history)) {
      updates.history = [];
    }

    if (!data.cache || typeof data.cache !== 'object') {
      updates.cache = {};
    }

    if (Object.keys(updates).length > 0) {
      await chrome.storage.local.set(updates);
    }

    // Preload offline dictionary in background
    loadOfflineDictionary();
    console.log('[QuickTranslate] Extension installed and initialized successfully.');
  } catch (err) {
    console.error('[QuickTranslate] Error initializing extension state:', err);
  }
});

/**
 * Loads the offline dictionary dataset lazily from data/dictionary.json.
 */
async function loadOfflineDictionary() {
  if (offlineDictionary) {
    return offlineDictionary;
  }
  if (isDictionaryLoading) {
    // Wait for the active load promise
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (offlineDictionary) {
          clearInterval(interval);
          resolve(offlineDictionary);
        }
      }, 50);
    });
  }

  isDictionaryLoading = true;
  try {
    const url = chrome.runtime.getURL('data/dictionary.json');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load dictionary: ${response.status}`);
    }
    offlineDictionary = await response.json();
    console.log(`[QuickTranslate] Offline dictionary loaded with ${Object.keys(offlineDictionary).length} entries.`);
  } catch (err) {
    console.error('[QuickTranslate] Failed to load offline dictionary JSON:', err);
    offlineDictionary = {};
  } finally {
    isDictionaryLoading = false;
  }
  return offlineDictionary;
}

/**
 * Normalizes query string: strips excessive punctuation, lowercase single words.
 */
function normalizeQuery(text) {
  if (!text) return '';
  return text
    .trim()
    .replace(/^["'“”‘’.,;:!?()\[\]{}]+|["'“”‘’.,;:!?()\[\]{}]+$/g, '')
    .trim();
}

/**
 * Extracts hostname from URL safely.
 */
function getHostname(url) {
  try {
    if (!url) return '';
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Stemming helper to find base words if inflected form is missing in offline dict.
 */
function findStemmedMatch(word, dict) {
  const w = word.toLowerCase();

  // Try plural / 3rd person singular (-s, -es)
  if (w.endsWith('es') && w.length > 4) {
    const base = w.slice(0, -2);
    if (dict[base]) return { ...dict[base], baseWord: base };
  }
  if (w.endsWith('s') && w.length > 3) {
    const base = w.slice(0, -1);
    if (dict[base]) return { ...dict[base], baseWord: base };
  }

  // Try past tense (-ed)
  if (w.endsWith('ed') && w.length > 4) {
    const base1 = w.slice(0, -2);
    if (dict[base1]) return { ...dict[base1], baseWord: base1 };
    const base2 = w.slice(0, -1); // e.g. liked -> like
    if (dict[base2]) return { ...dict[base2], baseWord: base2 };
  }

  // Try gerund (-ing)
  if (w.endsWith('ing') && w.length > 5) {
    const base1 = w.slice(0, -3);
    if (dict[base1]) return { ...dict[base1], baseWord: base1 };
    const base2 = base1 + 'e'; // e.g. making -> make
    if (dict[base2]) return { ...dict[base2], baseWord: base2 };
  }

  // Try adverb (-ly)
  if (w.endsWith('ly') && w.length > 4) {
    const base = w.slice(0, -2);
    if (dict[base]) return { ...dict[base], baseWord: base };
  }

  return null;
}

/**
 * Query the Google Translate web endpoint.
 */
async function fetchOnlineTranslation(query) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ONLINE_API_TIMEOUT_MS);

  try {
    const apiUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=bn&dt=t&dt=bd&dt=rm&q=${encodeURIComponent(query)}`;
    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`API returned HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!data || !data[0]) {
      throw new Error('Invalid response structure');
    }

    // Combine sentence translation parts
    let meaning = '';
    if (Array.isArray(data[0])) {
      meaning = data[0]
        .filter((part) => part && part[0])
        .map((part) => part[0])
        .join('')
        .trim();
    }

    // Extract pronunciation/phonetics if available
    let pron = '';
    if (Array.isArray(data[0]) && data[0].length > 1) {
      const pronItem = data[0][data[0].length - 1];
      if (Array.isArray(pronItem) && pronItem[3]) {
        pron = pronItem[3];
      }
    }

    // Extract Part of Speech and synonyms if available from data[1]
    let pos = '';
    const synonyms = [];
    if (Array.isArray(data[1]) && data[1].length > 0) {
      const primaryGroup = data[1][0];
      if (primaryGroup && primaryGroup[0]) {
        pos = primaryGroup[0]; // e.g. 'noun', 'verb'
      }
      for (const group of data[1]) {
        if (Array.isArray(group[1])) {
          synonyms.push(...group[1].slice(0, 3));
        }
      }
    }

    return {
      meaning: meaning || query,
      pos: pos || '',
      pron: pron || '',
      synonyms: [...new Set(synonyms)].slice(0, 4)
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Save entry to LRU Cache in chrome.storage.local.
 */
async function saveToCache(normalizedQuery, entry) {
  try {
    const data = await chrome.storage.local.get(['cache']);
    const cache = data.cache || {};
    const keys = Object.keys(cache);

    // Evict oldest entries if cache exceeds MAX_CACHE_ITEMS
    if (keys.length >= MAX_CACHE_ITEMS) {
      const oldestKeys = keys.slice(0, keys.length - MAX_CACHE_ITEMS + 1);
      for (const k of oldestKeys) {
        delete cache[k];
      }
    }

    cache[normalizedQuery] = {
      ...entry,
      timestamp: Date.now()
    };

    await chrome.storage.local.set({ cache });
  } catch (err) {
    console.warn('[QuickTranslate] Failed to update storage cache:', err);
  }
}

/**
 * Record successfully translated words into user revision history (max 50).
 */
async function saveToHistory(record) {
  try {
    const data = await chrome.storage.local.get(['history']);
    let history = data.history || [];

    // Deduplicate: remove existing entry of this word
    const wordLower = record.word.toLowerCase();
    history = history.filter((item) => item.word.toLowerCase() !== wordLower);

    // Prepend newest item
    history.unshift({
      word: record.word,
      meaning: record.meaning,
      pos: record.pos || '',
      pron: record.pron || '',
      source: record.source || 'online',
      timestamp: Date.now()
    });

    // Enforce max limit
    if (history.length > MAX_HISTORY_ITEMS) {
      history = history.slice(0, MAX_HISTORY_ITEMS);
    }

    await chrome.storage.local.set({ history });
  } catch (err) {
    console.warn('[QuickTranslate] Failed to record history:', err);
  }
}

/**
 * Core Translation Pipeline Coordinator.
 */
async function handleTranslation(rawText, sourceUrl = '') {
  const normalized = normalizeQuery(rawText);
  if (!normalized) {
    return { success: false, error: 'Empty query' };
  }

  // 1. Check domain suppression settings
  const { settings, cache } = await chrome.storage.local.get(['settings', 'cache']);
  const currentSettings = settings || DEFAULT_SETTINGS;

  if (sourceUrl) {
    const host = getHostname(sourceUrl);
    if (host && Array.isArray(currentSettings.disabledDomains) && currentSettings.disabledDomains.includes(host)) {
      return { success: false, disabledOnDomain: true };
    }
  }

  const lowerQuery = normalized.toLowerCase();

  // 2. Check local LRU cache
  if (cache && cache[lowerQuery]) {
    const cachedItem = cache[lowerQuery];
    // Record in history if not already top
    saveToHistory({ word: normalized, ...cachedItem });
    return {
      success: true,
      word: normalized,
      meaning: cachedItem.meaning,
      pos: cachedItem.pos || '',
      pron: cachedItem.pron || '',
      source: 'cache'
    };
  }

  // 3. Check bundled offline dictionary
  const dict = await loadOfflineDictionary();
  let offlineMatch = dict[lowerQuery];
  let isStemmed = false;
  let baseForm = '';

  if (!offlineMatch) {
    const stemmed = findStemmedMatch(lowerQuery, dict);
    if (stemmed) {
      offlineMatch = stemmed;
      isStemmed = true;
      baseForm = stemmed.baseWord;
    }
  }

  if (offlineMatch) {
    const result = {
      success: true,
      word: normalized,
      meaning: offlineMatch.bn,
      pos: offlineMatch.pos || '',
      pron: offlineMatch.pron || '',
      source: 'offline',
      baseForm: isStemmed ? baseForm : undefined
    };

    // Cache and save to history
    saveToCache(lowerQuery, result);
    saveToHistory(result);
    return result;
  }

  // 4. Online fallback to Google Translate web API
  try {
    const onlineResult = await fetchOnlineTranslation(normalized);
    const result = {
      success: true,
      word: normalized,
      meaning: onlineResult.meaning,
      pos: onlineResult.pos,
      pron: onlineResult.pron,
      synonyms: onlineResult.synonyms,
      source: 'online'
    };

    // Cache and save to history
    saveToCache(lowerQuery, result);
    saveToHistory(result);
    return result;
  } catch (netErr) {
    console.warn('[QuickTranslate] Online fallback failed:', netErr);

    return {
      success: false,
      word: normalized,
      error: 'Word not found in offline dictionary. Internet connection required for new words.',
      isOfflineError: true
    };
  }
}

/**
 * Message Dispatcher for Chrome Runtime Events.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  const senderUrl = sender?.tab?.url || '';

  switch (message.type) {
    case 'TRANSLATE_QUERY': {
      handleTranslation(message.text, senderUrl)
        .then(sendResponse)
        .catch((err) => {
          sendResponse({ success: false, error: err.message || 'Translation failed' });
        });
      return true; // Keep channel open for async response
    }

    case 'GET_SETTINGS': {
      chrome.storage.local.get(['settings']).then((data) => {
        sendResponse({ settings: data.settings || DEFAULT_SETTINGS });
      });
      return true;
    }

    case 'UPDATE_SETTINGS': {
      chrome.storage.local.get(['settings']).then((data) => {
        const current = data.settings || DEFAULT_SETTINGS;
        const updated = { ...current, ...message.settings };
        chrome.storage.local.set({ settings: updated }).then(() => {
          sendResponse({ success: true, settings: updated });
        });
      });
      return true;
    }

    case 'TOGGLE_DOMAIN': {
      chrome.storage.local.get(['settings']).then((data) => {
        const current = data.settings || DEFAULT_SETTINGS;
        const domains = new Set(current.disabledDomains || []);
        const targetDomain = message.domain;

        if (!targetDomain) {
          sendResponse({ success: false, error: 'No domain provided' });
          return;
        }

        if (domains.has(targetDomain)) {
          domains.delete(targetDomain);
        } else {
          domains.add(targetDomain);
        }

        const updated = { ...current, disabledDomains: Array.from(domains) };
        chrome.storage.local.set({ settings: updated }).then(() => {
          sendResponse({ success: true, disabledDomains: updated.disabledDomains });
        });
      });
      return true;
    }

    case 'GET_HISTORY': {
      chrome.storage.local.get(['history']).then((data) => {
        sendResponse({ history: data.history || [] });
      });
      return true;
    }

    case 'CLEAR_HISTORY': {
      chrome.storage.local.set({ history: [] }).then(() => {
        sendResponse({ success: true });
      });
      return true;
    }

    case 'DELETE_HISTORY_ITEM': {
      chrome.storage.local.get(['history']).then((data) => {
        const history = (data.history || []).filter(
          (item) => item.word.toLowerCase() !== (message.word || '').toLowerCase()
        );
        chrome.storage.local.set({ history }).then(() => {
          sendResponse({ success: true, history });
        });
      });
      return true;
    }

    case 'CHECK_STATUS': {
      const dictCount = offlineDictionary ? Object.keys(offlineDictionary).length : 0;
      chrome.storage.local.get(['cache', 'history', 'settings']).then((data) => {
        sendResponse({
          ready: true,
          offlineEntriesCount: dictCount,
          cachedEntriesCount: Object.keys(data.cache || {}).length,
          historyCount: (data.history || []).length,
          settings: data.settings || DEFAULT_SETTINGS
        });
      });
      return true;
    }

    default:
      return false;
  }
});
