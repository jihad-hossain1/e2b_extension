/**
 * QuickTranslate: English to Bangla
 * Content Script (content.js)
 * Manages text selection, floating badge, Shadow DOM isolation, and in-page translation card.
 */

(() => {
  // Prevent duplicate injection
  if (window.__quickTranslateInjected) return;
  window.__quickTranslateInjected = true;

  // Cached configuration
  let config = {
    enabled: true,
    requireAltKey: false,
    theme: 'system',
    autoSpeak: false,
    disabledDomains: []
  };

  // Shadow DOM container references
  let hostEl = null;
  let shadowRoot = null;
  let activeElement = null; // Currently rendered element inside shadow
  let activeRange = null; // Text range for positioning
  let activeSelectedText = '';

  /**
   * Fetch current settings from background service worker.
   */
  function syncSettings() {
    try {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.settings) {
          config = response.settings;
        }
      });
    } catch {
      // Background worker might be sleeping
    }
  }

  syncSettings();

  // Listen to storage changes to keep settings live
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.settings) {
        config = { ...config, ...changes.settings.newValue };
        applyTheme();
      }
    });
  }

  /**
   * Creates or returns the isolated Shadow DOM host.
   */
  function getShadowRoot() {
    if (shadowRoot) return shadowRoot;

    hostEl = document.createElement('div');
    hostEl.id = 'quicktranslate-host';
    hostEl.style.all = 'initial';

    shadowRoot = hostEl.attachShadow({ mode: 'open' });

    // Link the scoped stylesheet
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
      ? chrome.runtime.getURL('content.css')
      : (window.__quickTranslateCssUrl || '../content.css');
    shadowRoot.appendChild(link);

    // Mount to documentElement to avoid body transform/overflow constraints
    (document.fullscreenElement || document.body || document.documentElement).appendChild(hostEl);

    return shadowRoot;
  }

  /**
   * Apply light/dark/system theme to the shadow root container.
   */
  function applyTheme() {
    if (!shadowRoot) return;
    const wrapper = shadowRoot.querySelector('.qt-wrapper');
    if (!wrapper) return;

    wrapper.classList.remove('qt-theme-light', 'qt-theme-dark');
    if (config.theme === 'dark') {
      wrapper.classList.add('qt-theme-dark');
    } else if (config.theme === 'light') {
      wrapper.classList.add('qt-theme-light');
    }
  }

  /**
   * Determines if target element is an interactive or editable field.
   */
  function isEditableElement(target) {
    if (!target) return false;
    const tag = target.tagName ? target.tagName.toLowerCase() : '';
    return (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      target.isContentEditable ||
      (target.closest && (target.closest('[contenteditable="true"]') || target.closest('.monaco-editor')))
    );
  }

  /**
   * Checks if current hostname is in the user's disabled list.
   */
  function isCurrentDomainDisabled() {
    const host = window.location.hostname;
    return Array.isArray(config.disabledDomains) && config.disabledDomains.includes(host);
  }

  /**
   * Sanitizes selected text into cleaned word/phrase.
   */
  function cleanSelectionText(raw) {
    if (!raw) return '';
    return raw
      .trim()
      .replace(/^["'“”‘’.,;:!?()\[\]{}]+|["'“”‘’.,;:!?()\[\]{}]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Clears any active badge or tooltip card from DOM.
   */
  function dismissTooltip() {
    if (shadowRoot) {
      const existing = shadowRoot.querySelector('.qt-wrapper');
      if (existing) {
        existing.remove();
      }
    }
    activeElement = null;
    activeRange = null;
    activeSelectedText = '';
  }

  /**
   * Computes fixed viewport coordinates with boundary collision detection.
   */
  function computePosition(rect, elementWidth = 320, elementHeight = 160) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Center horizontally relative to selection rect
    let left = rect.left + rect.width / 2 - elementWidth / 2;
    // Boundary clamp horizontally with 12px margin
    left = Math.max(12, Math.min(left, viewportWidth - elementWidth - 12));

    // Determine vertical position: preferred above selection, flip below if tight
    let top = rect.top - elementHeight - 10;
    if (top < 12) {
      // Flip below selection
      top = rect.bottom + 10;
      // If below also overflows viewport, clamp
      if (top + elementHeight > viewportHeight - 12) {
        top = Math.max(12, viewportHeight - elementHeight - 12);
      }
    }

    return { top: Math.round(top), left: Math.round(left) };
  }

  /**
   * Native Web Speech API audio pronunciation.
   */
  function speakEnglish(text) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('[QuickTranslate] Speech synthesis error:', e);
    }
  }

  /**
   * Renders the Floating Action Badge for multi-word selection.
   */
  function showFloatingBadge(text, rect) {
    dismissTooltip();
    const root = getShadowRoot();

    const wrapper = document.createElement('div');
    wrapper.className = 'qt-wrapper';
    applyTheme();

    const badge = document.createElement('div');
    badge.className = 'qt-badge';
    badge.title = 'Translate with QuickTranslate';
    badge.innerHTML = `
      <span class="qt-badge-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m5 8 6 6"/>
          <path d="m4 14 6-6 2-3"/>
          <path d="M2 5h12"/>
          <path d="M7 2h1"/>
          <path d="m22 22-5-10-5 10"/>
          <path d="M14 18h6"/>
        </svg>
      </span>
      <span class="qt-badge-text">বাং Translate</span>
    `;

    // Position near the end of selection
    const badgeWidth = 110;
    const badgeHeight = 32;
    let left = rect.right - 20;
    left = Math.max(12, Math.min(left, window.innerWidth - badgeWidth - 12));
    let top = rect.top - badgeHeight - 8;
    if (top < 12) {
      top = rect.bottom + 8;
    }

    wrapper.style.top = `${top}px`;
    wrapper.style.left = `${left}px`;
    wrapper.appendChild(badge);
    root.appendChild(wrapper);
    activeElement = wrapper;

    // Click handler to open full card
    badge.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      executeTranslation(text, rect);
    });
  }

  /**
   * Renders the Rich Translation Card with meanings, pronunciation, and actions.
   */
  function showTranslationCard(queryText, rect, initialLoading = true) {
    dismissTooltip();
    const root = getShadowRoot();

    const wrapper = document.createElement('div');
    wrapper.className = 'qt-wrapper';
    applyTheme();

    const card = document.createElement('div');
    card.className = 'qt-card';

    // Initial Loading State or placeholder
    card.innerHTML = `
      <div class="qt-header">
        <div class="qt-header-left">
          <span class="qt-word-title">${escapeHTML(queryText)}</span>
        </div>
        <div class="qt-header-actions">
          <button class="qt-btn-icon qt-close-btn" title="Close (Esc)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="qt-loading">
        <div class="qt-spinner"></div>
        <span>Translating to Bangla...</span>
      </div>
    `;

    // Estimate position and attach
    const initialPos = computePosition(rect, 320, 140);
    wrapper.style.top = `${initialPos.top}px`;
    wrapper.style.left = `${initialPos.left}px`;
    wrapper.appendChild(card);
    root.appendChild(wrapper);
    activeElement = wrapper;

    // Prevent outside dismiss on clicks inside
    wrapper.addEventListener('mousedown', (e) => e.stopPropagation());

    // Close button
    card.querySelector('.qt-close-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      dismissTooltip();
    });

    return {
      update: (data) => {
        renderCardContent(card, queryText, rect, data, wrapper);
      }
    };
  }

  /**
   * Updates translation card with finalized result data.
   */
  function renderCardContent(card, queryText, rect, data, wrapper) {
    if (!card || !wrapper) return;

    if (!data || !data.success) {
      card.innerHTML = `
        <div class="qt-header">
          <div class="qt-header-left">
            <span class="qt-word-title">${escapeHTML(queryText)}</span>
          </div>
          <div class="qt-header-actions">
            <button class="qt-btn-icon qt-close-btn" title="Close">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        <div class="qt-body" style="color: #ef4444; font-size: 13px;">
          ${escapeHTML(data?.error || 'Unable to find translation.')}
        </div>
      `;
      card.querySelector('.qt-close-btn').addEventListener('click', dismissTooltip);
      return;
    }

    const posTag = data.pos ? `<span class="qt-pos-badge">${escapeHTML(data.pos)}</span>` : '';
    const pronBar = data.pron
      ? `<div class="qt-pron-bar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          </svg>
          <span>/${escapeHTML(data.pron)}/</span>
        </div>`
      : '';

    const sourceClass = `qt-source-${data.source || 'online'}`;
    const sourceLabel = data.source === 'offline' ? 'Offline' : data.source === 'cache' ? 'Cached' : 'Google';

    const synHtml = Array.isArray(data.synonyms) && data.synonyms.length > 0
      ? `<div class="qt-synonyms">
          ${data.synonyms.map((s) => `<span class="qt-syn-tag">${escapeHTML(s)}</span>`).join('')}
        </div>`
      : '';

    card.innerHTML = `
      <div class="qt-header">
        <div class="qt-header-left">
          <span class="qt-word-title" title="${escapeHTML(data.word)}">${escapeHTML(data.word)}</span>
          ${posTag}
        </div>
        <div class="qt-header-actions">
          <button class="qt-btn-icon qt-speak-btn" title="Listen English Pronunciation">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
            </svg>
          </button>
          <button class="qt-btn-icon qt-close-btn" title="Close (Esc)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      ${pronBar}
      <div class="qt-body">
        <div class="qt-meaning">${escapeHTML(data.meaning)}</div>
        ${synHtml}
      </div>
      <div class="qt-footer">
        <div class="qt-source-indicator ${sourceClass}">
          <span class="qt-source-dot"></span>
          <span>${sourceLabel}</span>
        </div>
        <button class="qt-copy-btn" title="Copy Bangla translation">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span class="qt-copy-label">Copy</span>
        </button>
      </div>
    `;

    // Recalculate position based on updated rendered height
    const cardRect = card.getBoundingClientRect();
    const updatedPos = computePosition(rect, 320, cardRect.height || 160);
    wrapper.style.top = `${updatedPos.top}px`;
    wrapper.style.left = `${updatedPos.left}px`;

    // Wire action buttons
    const speakBtn = card.querySelector('.qt-speak-btn');
    if (speakBtn) {
      speakBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        speakEnglish(data.word);
      });
    }

    const closeBtn = card.querySelector('.qt-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissTooltip();
      });
    }

    const copyBtn = card.querySelector('.qt-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(data.meaning).then(() => {
          copyBtn.classList.add('qt-copied');
          const label = copyBtn.querySelector('.qt-copy-label');
          if (label) label.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.classList.remove('qt-copied');
            if (label) label.textContent = 'Copy';
          }, 1800);
        });
      });
    }

    // Auto speak if user enabled
    if (config.autoSpeak) {
      speakEnglish(data.word);
    }
  }

  /**
   * Triggers background translation and renders UI card.
   */
  function executeTranslation(text, rect) {
    const cardController = showTranslationCard(text, rect, true);

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage(
          {
            type: 'TRANSLATE_QUERY',
            text: text
          },
          (response) => {
            if (chrome.runtime.lastError) {
              if (window.__quickTranslateMockTranslate) {
                window.__quickTranslateMockTranslate(text).then(cardController.update);
                return;
              }
              cardController.update({
                success: false,
                error: 'Connection error to translation service.'
              });
              return;
            }
            if (response && response.disabledOnDomain) {
              dismissTooltip();
              return;
            }
            cardController.update(response);
          }
        );
      } catch (err) {
        if (window.__quickTranslateMockTranslate) {
          window.__quickTranslateMockTranslate(text).then(cardController.update);
          return;
        }
        cardController.update({
          success: false,
          error: 'Unable to contact background worker.'
        });
      }
    } else if (window.__quickTranslateMockTranslate) {
      window.__quickTranslateMockTranslate(text).then(cardController.update);
    } else {
      cardController.update({
        success: false,
        error: 'Please load QuickTranslate extension in chrome://extensions to translate.'
      });
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

  /**
   * Event Listener: Double Click (Immediate word lookup).
   */
  document.addEventListener('dblclick', (e) => {
    if (!config.enabled) return;
    if (isCurrentDomainDisabled()) return;
    if (isEditableElement(e.target)) return;
    if (config.requireAltKey && !e.altKey) return;

    // Small delay to let browser finalize selection range
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const raw = selection.toString();
      const cleaned = cleanSelectionText(raw);
      if (!cleaned || !/[a-zA-Z]/.test(cleaned)) return;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;

      activeSelectedText = cleaned;
      activeRange = range;

      executeTranslation(cleaned, rect);
    }, 10);
  });

  /**
   * Event Listener: Mouse Up (Multi-word drag selection).
   */
  document.addEventListener('mouseup', (e) => {
    // If clicking inside active element, do not dismiss
    if (hostEl && e.composedPath().includes(hostEl)) return;

    // Small delay to inspect selection
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        // Selection cleared -> dismiss
        dismissTooltip();
        return;
      }

      if (!config.enabled || isCurrentDomainDisabled()) {
        dismissTooltip();
        return;
      }

      if (isEditableElement(e.target)) {
        dismissTooltip();
        return;
      }

      if (config.requireAltKey && !e.altKey) {
        dismissTooltip();
        return;
      }

      const raw = selection.toString();
      const cleaned = cleanSelectionText(raw);
      if (!cleaned || !/[a-zA-Z]/.test(cleaned)) {
        dismissTooltip();
        return;
      }

      const words = cleaned.split(/\s+/).filter(Boolean);
      // FR-1 requirement: Up to 4 words
      if (words.length > 4) {
        dismissTooltip();
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;

      activeSelectedText = cleaned;
      activeRange = range;

      if (words.length > 1) {
        // Multi-word phrase: show subtle floating action badge to not interrupt selection
        showFloatingBadge(cleaned, rect);
      }
    }, 20);
  });

  /**
   * Global dismissal listeners.
   */
  document.addEventListener('mousedown', (e) => {
    if (hostEl && e.composedPath().includes(hostEl)) return;
    dismissTooltip();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dismissTooltip();
    }
  });

  // Reposition on window resize
  window.addEventListener('resize', () => {
    if (activeElement && activeRange) {
      const rect = activeRange.getBoundingClientRect();
      const pos = computePosition(rect, 320, activeElement.offsetHeight || 160);
      activeElement.style.top = `${pos.top}px`;
      activeElement.style.left = `${pos.left}px`;
    }
  });
})();
