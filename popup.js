/**
 * QuickTranslate: English to Bangla
 * Toolbar Popup Script (popup.js)
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements - Navigation
  const tabButtons = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.panel');
  const historyBadge = document.getElementById('historyBadge');

  // DOM Elements - Search
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const searchResultArea = document.getElementById('searchResultArea');
  const chipButtons = document.querySelectorAll('.chip');

  // DOM Elements - History
  const historyList = document.getElementById('historyList');
  const historyEmptyState = document.getElementById('historyEmptyState');
  const historyCountText = document.getElementById('historyCountText');
  const clearAllHistoryBtn = document.getElementById('clearAllHistoryBtn');

  // DOM Elements - Settings & Site Status
  const siteStatusBadge = document.getElementById('siteStatusBadge');
  const currentDomainText = document.getElementById('currentDomainText');
  const siteToggleCheckbox = document.getElementById('siteToggleCheckbox');
  const siteToggleLabel = document.getElementById('siteToggleLabel');
  const settingEnabled = document.getElementById('settingEnabled');
  const settingAltKey = document.getElementById('settingAltKey');
  const settingAutoSpeak = document.getElementById('settingAutoSpeak');
  const themeSegmented = document.getElementById('themeSegmented');
  const dictStatsText = document.getElementById('dictStatsText');

  let currentHost = '';
  let appSettings = {
    enabled: true,
    requireAltKey: false,
    theme: 'system',
    autoSpeak: false,
    disabledDomains: []
  };

  /* -------------------------------------------------------------
     0. Resilient Message Dispatcher (Supports Extension + Web Preview)
  ------------------------------------------------------------- */
  let cachedMockDict = null;

  async function mockBackgroundHandler(message) {
    if (message.type === 'TRANSLATE_QUERY') {
      const q = (message.text || '').trim().toLowerCase();
      if (!cachedMockDict) {
        try {
          const res = await fetch('data/dictionary.json');
          cachedMockDict = await res.json();
        } catch {
          cachedMockDict = {};
        }
      }
      if (cachedMockDict && cachedMockDict[q]) {
        const item = {
          success: true,
          word: message.text,
          meaning: cachedMockDict[q].bn,
          pos: cachedMockDict[q].pos || '',
          pron: cachedMockDict[q].pron || '',
          source: 'offline'
        };
        // Record in mock history
        recordMockHistory(item);
        return item;
      }
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=bn&dt=t&dt=bd&dt=rm&q=${encodeURIComponent(message.text)}`;
        const r = await fetch(url);
        const d = await r.json();
        const meaning = (d[0] || []).filter((p) => p && p[0]).map((p) => p[0]).join('').trim();
        let pron = '';
        if (d[0] && d[0].length > 1 && d[0][d[0].length - 1][3]) {
          pron = d[0][d[0].length - 1][3];
        }
        let pos = '';
        if (d[1] && d[1][0] && d[1][0][0]) pos = d[1][0][0];
        const item = {
          success: true,
          word: message.text,
          meaning: meaning || message.text,
          pos,
          pron,
          source: 'online'
        };
        recordMockHistory(item);
        return item;
      } catch (e) {
        return { success: false, error: 'Offline / Network error' };
      }
    }
    if (message.type === 'GET_SETTINGS') {
      const saved = localStorage.getItem('qt_settings');
      return { settings: saved ? JSON.parse(saved) : appSettings };
    }
    if (message.type === 'UPDATE_SETTINGS') {
      const saved = localStorage.getItem('qt_settings');
      const cur = saved ? JSON.parse(saved) : appSettings;
      const updated = { ...cur, ...message.settings };
      localStorage.setItem('qt_settings', JSON.stringify(updated));
      return { success: true, settings: updated };
    }
    if (message.type === 'GET_HISTORY') {
      const h = localStorage.getItem('qt_history');
      return { history: h ? JSON.parse(h) : [] };
    }
    if (message.type === 'CLEAR_HISTORY') {
      localStorage.removeItem('qt_history');
      return { success: true, history: [] };
    }
    if (message.type === 'DELETE_HISTORY_ITEM') {
      const h = localStorage.getItem('qt_history');
      let items = h ? JSON.parse(h) : [];
      items = items.filter((x) => x.word.toLowerCase() !== (message.word || '').toLowerCase());
      localStorage.setItem('qt_history', JSON.stringify(items));
      return { success: true, history: items };
    }
    if (message.type === 'CHECK_STATUS') {
      return { ready: true, offlineEntriesCount: 9501 };
    }
    return { success: false };
  }

  function recordMockHistory(record) {
    try {
      const h = localStorage.getItem('qt_history');
      let items = h ? JSON.parse(h) : [];
      items = items.filter((x) => x.word.toLowerCase() !== record.word.toLowerCase());
      items.unshift({
        word: record.word,
        meaning: record.meaning,
        pos: record.pos || '',
        pron: record.pron || '',
        timestamp: Date.now()
      });
      if (items.length > 50) items = items.slice(0, 50);
      localStorage.setItem('qt_history', JSON.stringify(items));
    } catch {}
  }

  function sendRuntimeMessage(message, callback) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError || !response) {
            mockBackgroundHandler(message).then(callback);
          } else {
            callback(response);
          }
        });
      } catch {
        mockBackgroundHandler(message).then(callback);
      }
    } else {
      mockBackgroundHandler(message).then(callback);
    }
  }

  /* -------------------------------------------------------------
     1. Tab Switching
  ------------------------------------------------------------- */
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  function switchTab(tabId) {
    tabButtons.forEach((b) => {
      const isActive = b.getAttribute('data-tab') === tabId;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    panels.forEach((p) => {
      const isActive = p.id === `panel${capitalize(tabId)}`;
      p.classList.toggle('active', isActive);
    });

    if (tabId === 'history') {
      loadHistory();
    } else if (tabId === 'search') {
      searchInput.focus();
    }
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* -------------------------------------------------------------
     2. Search Functionality
  ------------------------------------------------------------- */
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (query) {
      performSearch(query);
    }
  });

  searchInput.addEventListener('input', () => {
    clearSearchBtn.style.display = searchInput.value ? 'flex' : 'none';
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    searchResultArea.innerHTML = '';
    searchInput.focus();
  });

  chipButtons.forEach((chip) => {
    chip.addEventListener('click', () => {
      const word = chip.getAttribute('data-word');
      searchInput.value = word;
      clearSearchBtn.style.display = 'flex';
      performSearch(word);
    });
  });

  function performSearch(query) {
    searchResultArea.innerHTML = `
      <div class="result-card" style="padding: 24px; text-align: center; color: var(--text-muted);">
        <div style="margin-bottom: 8px;">Translating...</div>
      </div>
    `;

    sendRuntimeMessage(
      {
        type: 'TRANSLATE_QUERY',
        text: query
      },
      (response) => {
        if (!response) {
          renderError('Failed to communicate with translation service.');
          return;
        }

        if (!response.success) {
          renderError(response.error || 'No translation found.');
          return;
        }

        renderSearchResult(response);
        updateHistoryBadge();

        if (appSettings.autoSpeak) {
          speakEnglish(response.word);
        }
      }
    );
  }

  function renderSearchResult(data) {
    const posTag = data.pos ? `<span class="res-pos">${escapeHTML(data.pos)}</span>` : '';
    const pronBar = data.pron ? `<div class="res-pron">/${escapeHTML(data.pron)}/</div>` : '';
    const sourceClass = `source-${data.source || 'online'}`;
    const sourceLabel = data.source === 'offline' ? 'Offline' : data.source === 'cache' ? 'Cached' : 'Google';

    const synHtml = Array.isArray(data.synonyms) && data.synonyms.length > 0
      ? `<div class="res-synonyms">
          ${data.synonyms.map((s) => `<span class="res-syn-chip">${escapeHTML(s)}</span>`).join('')}
        </div>`
      : '';

    searchResultArea.innerHTML = `
      <div class="result-card">
        <div class="res-header">
          <div class="res-head-title">
            <span class="res-word">${escapeHTML(data.word)}</span>
            ${posTag}
          </div>
          <button class="btn-icon-subtle res-speak-btn" title="Listen pronunciation">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
            </svg>
            <span>Audio</span>
          </button>
        </div>
        ${pronBar}
        <div class="res-body">
          <div class="res-meaning">${escapeHTML(data.meaning)}</div>
          ${synHtml}
        </div>
        <div class="res-footer">
          <div class="res-source ${sourceClass}">
            <span class="source-dot"></span>
            <span>${sourceLabel}</span>
          </div>
          <div class="res-actions">
            <button class="btn-icon-subtle res-copy-btn" title="Copy Bangla text">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span class="copy-lbl">Copy</span>
            </button>
          </div>
        </div>
      </div>
    `;

    // Speak Button
    const speakBtn = searchResultArea.querySelector('.res-speak-btn');
    speakBtn.addEventListener('click', () => speakEnglish(data.word));

    // Copy Button
    const copyBtn = searchResultArea.querySelector('.res-copy-btn');
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(data.meaning).then(() => {
        copyBtn.classList.add('copied');
        const lbl = copyBtn.querySelector('.copy-lbl');
        if (lbl) lbl.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          if (lbl) lbl.textContent = 'Copy';
        }, 1800);
      });
    });
  }

  function renderError(message) {
    searchResultArea.innerHTML = `
      <div class="result-card" style="padding: 16px; border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.04);">
        <div style="font-weight: 600; color: #ef4444; margin-bottom: 4px;">Lookup failed</div>
        <div style="font-size: 12.5px; color: var(--text-secondary);">${escapeHTML(message)}</div>
      </div>
    `;
  }

  /* -------------------------------------------------------------
     3. History Functionality
  ------------------------------------------------------------- */
  function loadHistory() {
    sendRuntimeMessage({ type: 'GET_HISTORY' }, (response) => {
      const history = response?.history || [];
      renderHistoryList(history);
      updateHistoryBadge(history.length);
    });
  }

  function updateHistoryBadge(count) {
    if (typeof count === 'number') {
      historyBadge.textContent = count;
      historyBadge.style.display = count > 0 ? 'inline-block' : 'none';
      historyCountText.textContent = `${count} word${count === 1 ? '' : 's'} saved`;
    } else {
      sendRuntimeMessage({ type: 'GET_HISTORY' }, (resp) => {
        const c = resp?.history?.length || 0;
        historyBadge.textContent = c;
        historyBadge.style.display = c > 0 ? 'inline-block' : 'none';
        historyCountText.textContent = `${c} word${c === 1 ? '' : 's'} saved`;
      });
    }
  }

  function renderHistoryList(items) {
    if (!items || items.length === 0) {
      historyList.innerHTML = '';
      historyEmptyState.style.display = 'block';
      clearAllHistoryBtn.style.display = 'none';
      return;
    }

    historyEmptyState.style.display = 'none';
    clearAllHistoryBtn.style.display = 'inline-flex';
    historyList.innerHTML = '';

    items.forEach((item) => {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.innerHTML = `
        <div class="history-item-left" title="Click to view details">
          <div class="history-word-row">
            <span class="history-word">${escapeHTML(item.word)}</span>
            <span class="history-time">${formatTimeAgo(item.timestamp)}</span>
          </div>
          <div class="history-meaning">${escapeHTML(item.meaning)}</div>
        </div>
        <div class="history-actions">
          <button class="btn-icon-mini hist-speak-btn" title="Pronounce">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
          </button>
          <button class="btn-icon-mini del hist-del-btn" title="Remove word">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;

      // Click row to inspect in Search tab
      el.querySelector('.history-item-left').addEventListener('click', () => {
        searchInput.value = item.word;
        clearSearchBtn.style.display = 'flex';
        switchTab('search');
        performSearch(item.word);
      });

      // Pronounce
      el.querySelector('.hist-speak-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        speakEnglish(item.word);
      });

      // Delete individual
      el.querySelector('.hist-del-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        sendRuntimeMessage(
          {
            type: 'DELETE_HISTORY_ITEM',
            word: item.word
          },
          (res) => {
            if (res && res.history) {
              renderHistoryList(res.history);
              updateHistoryBadge(res.history.length);
            }
          }
        );
      });

      historyList.appendChild(el);
    });
  }

  clearAllHistoryBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear your vocabulary history?')) {
      sendRuntimeMessage({ type: 'CLEAR_HISTORY' }, () => {
        renderHistoryList([]);
        updateHistoryBadge(0);
      });
    }
  });

  function formatTimeAgo(ts) {
    if (!ts) return '';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /* -------------------------------------------------------------
     4. Settings & Website Status
  ------------------------------------------------------------- */
  function initSettings() {
    // 1. Get current active tab
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0] && tabs[0].url) {
            try {
              const url = new URL(tabs[0].url);
              if (url.protocol.startsWith('http')) {
                currentHost = url.hostname;
                currentDomainText.textContent = currentHost;
                updateSiteToggleState();
              } else {
                currentDomainText.textContent = 'Browser Internal Page';
                siteToggleCheckbox.disabled = true;
              }
            } catch {
              currentDomainText.textContent = 'Local Document';
              siteToggleCheckbox.disabled = true;
            }
          }
        });
      } catch {
        currentDomainText.textContent = window.location.hostname || 'localhost';
      }
    } else {
      currentDomainText.textContent = window.location.hostname || 'localhost';
    }

    // 2. Fetch settings
    sendRuntimeMessage({ type: 'GET_SETTINGS' }, (res) => {
      if (res && res.settings) {
        appSettings = res.settings;
        settingEnabled.checked = appSettings.enabled !== false;
        settingAltKey.checked = !!appSettings.requireAltKey;
        settingAutoSpeak.checked = !!appSettings.autoSpeak;
        applyTheme(appSettings.theme || 'system');
        updateSiteToggleState();
      }
    });

    // 3. Diagnostics
    sendRuntimeMessage({ type: 'CHECK_STATUS' }, (res) => {
      if (res && res.offlineEntriesCount) {
        dictStatsText.textContent = `${res.offlineEntriesCount.toLocaleString()} Offline Words`;
      }
    });

    updateHistoryBadge();
  }

  function updateSiteToggleState() {
    if (!currentHost) return;
    const isExcluded = Array.isArray(appSettings.disabledDomains) && appSettings.disabledDomains.includes(currentHost);
    siteToggleCheckbox.checked = !isExcluded;

    if (isExcluded) {
      siteStatusBadge.className = 'site-status-badge disabled';
      siteStatusBadge.querySelector('.status-text').textContent = 'Disabled on this site';
      siteToggleLabel.textContent = `Translation disabled on ${currentHost}`;
    } else {
      siteStatusBadge.className = 'site-status-badge';
      siteStatusBadge.querySelector('.status-text').textContent = 'Active on this site';
      siteToggleLabel.textContent = `Enable translation on ${currentHost}`;
    }
  }

  // Toggle Site Blacklist
  siteToggleCheckbox.addEventListener('change', () => {
    if (!currentHost) return;
    sendRuntimeMessage(
      {
        type: 'TOGGLE_DOMAIN',
        domain: currentHost
      },
      (res) => {
        if (res && res.disabledDomains) {
          appSettings.disabledDomains = res.disabledDomains;
          updateSiteToggleState();
        }
      }
    );
  });

  // Toggle Global Enable
  settingEnabled.addEventListener('change', () => {
    appSettings.enabled = settingEnabled.checked;
    saveSettings({ enabled: appSettings.enabled });
  });

  // Toggle Alt Key requirement
  settingAltKey.addEventListener('change', () => {
    appSettings.requireAltKey = settingAltKey.checked;
    saveSettings({ requireAltKey: appSettings.requireAltKey });
  });

  // Toggle Auto Pronunciation
  settingAutoSpeak.addEventListener('change', () => {
    appSettings.autoSpeak = settingAutoSpeak.checked;
    saveSettings({ autoSpeak: appSettings.autoSpeak });
  });

  // Theme segmented control
  themeSegmented.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const selected = btn.getAttribute('data-theme');
      applyTheme(selected);
      saveSettings({ theme: selected });
    });
  });

  function applyTheme(theme) {
    document.body.className = `theme-${theme}`;
    themeSegmented.querySelectorAll('.seg-btn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-theme') === theme);
    });
  }

  function saveSettings(partial) {
    sendRuntimeMessage({
      type: 'UPDATE_SETTINGS',
      settings: partial
    });
  }

  function speakEnglish(text) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('[QuickTranslate] Audio error:', e);
    }
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Initialize
  initSettings();
});
