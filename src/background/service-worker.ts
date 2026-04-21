import { DEFAULT_SHORTCUTS, DEFAULT_TOOLTIP_STYLE, DEFAULT_API_CONFIG } from '../shared/types';

// ── Proxy fetch for engines blocked by CORS in content scripts ─────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'PROXY_FETCH') return false;

  const { url, options } = msg as { type: string; url: string; options: RequestInit };

  fetch(url, options)
    .then(async res => {
      const text = await res.text();
      sendResponse({ ok: res.ok, status: res.status, text });
    })
    .catch(err => {
      sendResponse({ ok: false, status: 0, text: '', error: (err as Error).message });
    });

  return true; // keep channel open for async response
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.sync.set({
      theme:            'light',
      shortcuts:        { ...DEFAULT_SHORTCUTS },
      translationMode:  'sentence',
      tooltipStyle:     { ...DEFAULT_TOOLTIP_STYLE },
      defaultBehavior:  'on',
      siteOverrides:    {},
      selectionEnabled: true,
      smartSkip:        true,
      twoWay:           false,
      showBothTexts:    false,
      sourceMode:       'fixed',
      sourceLanguage:   'en',
      targetLanguage:   'de',
      grammarMode:      false,
      grammarPosition:  'bottom',
      apiConfig:        { ...DEFAULT_API_CONFIG },
    });
  }
});
