import type { StorageSchema, Theme, ShortcutConfig, TranslationMode, TooltipStyle, DefaultBehavior, SourceMode, GrammarPosition, ApiConfig, PreferredEngine } from '../shared/types';
import { DEFAULT_SHORTCUTS, DEFAULT_TOOLTIP_STYLE, DEFAULT_API_CONFIG, LANGUAGES } from '../shared/types';

// ── Language picker component ──────────────────────────────────────────────────

class LangPicker {
  private el: HTMLElement;
  private btn: HTMLButtonElement;
  private valueEl: HTMLSpanElement;
  private dropdown: HTMLDivElement;
  private searchInput: HTMLInputElement;
  private list: HTMLDivElement;
  private _value = '';
  private isOpen = false;
  private focusedIndex = -1;
  private onChangeCb: (code: string) => void;

  constructor(container: HTMLElement, onChange: (code: string) => void) {
    this.el = container;
    this.el.classList.add('lang-picker');
    this.onChangeCb = onChange;

    // Button
    this.btn = document.createElement('button');
    this.btn.type = 'button';
    this.btn.className = 'lang-picker-btn';

    this.valueEl = document.createElement('span');
    this.valueEl.className = 'lang-picker-value';
    this.valueEl.textContent = 'Select…';

    const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chevron.setAttribute('width', '8');
    chevron.setAttribute('height', '5');
    chevron.setAttribute('viewBox', '0 0 8 5');
    chevron.setAttribute('fill', 'currentColor');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M0 0l4 5 4-5z');
    chevron.appendChild(path);

    this.btn.appendChild(this.valueEl);
    this.btn.appendChild(chevron);

    // Dropdown
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'lang-picker-dropdown';
    this.dropdown.style.display = 'none';

    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.className = 'lang-picker-search';
    this.searchInput.placeholder = 'Search language…';
    this.searchInput.autocomplete = 'off';
    this.searchInput.spellcheck = false;

    this.list = document.createElement('div');
    this.list.className = 'lang-picker-list';

    this.dropdown.appendChild(this.searchInput);
    this.dropdown.appendChild(this.list);
    this.el.appendChild(this.btn);
    this.el.appendChild(this.dropdown);

    // Events
    this.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isOpen ? this.close() : this.open();
    });

    this.searchInput.addEventListener('input', () => {
      this.renderList(this.searchInput.value);
      this.focusedIndex = -1;
    });

    this.searchInput.addEventListener('keydown', (e) => this.handleKeydown(e));

    document.addEventListener('click', (e) => {
      if (!this.el.contains(e.target as Node)) this.close();
    });

    this.renderList('');
  }

  get value(): string { return this._value; }

  set value(code: string) {
    this._value = code;
    const lang = LANGUAGES.find(([c]) => c === code);
    this.valueEl.textContent = lang ? lang[1] : (code || 'Select…');
  }

  private renderList(query: string): void {
    const q = query.toLowerCase();
    const filtered = q
      ? LANGUAGES.filter(([code, name]) => name.toLowerCase().includes(q) || code.toLowerCase().startsWith(q))
      : LANGUAGES;

    this.list.innerHTML = '';

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'lang-picker-empty';
      empty.textContent = 'No results';
      this.list.appendChild(empty);
      return;
    }

    for (const [code, name] of filtered) {
      const item = document.createElement('div');
      item.className = 'lang-picker-item' + (code === this._value ? ' is-selected' : '');
      item.dataset['code'] = code;
      item.textContent = name;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.select(code);
      });
      this.list.appendChild(item);
    }
  }

  private open(): void {
    this.isOpen = true;
    this.btn.classList.add('is-open');
    this.dropdown.style.display = 'block';
    this.searchInput.value = '';
    this.focusedIndex = -1;
    this.renderList('');
    void this.dropdown.offsetWidth; // force reflow so browser paints initial state before transitioning
    this.dropdown.classList.add('is-open');
    requestAnimationFrame(() => {
      const sel = this.list.querySelector<HTMLElement>('.is-selected');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
      this.searchInput.focus();
    });
  }

  private close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.btn.classList.remove('is-open');
    this.dropdown.classList.remove('is-open');
    setTimeout(() => {
      if (!this.isOpen) this.dropdown.style.display = 'none';
    }, 160);
  }

  private select(code: string): void {
    this.value = code;
    this.close();
    this.onChangeCb(code);
  }

  private handleKeydown(e: KeyboardEvent): void {
    const items = this.list.querySelectorAll<HTMLElement>('.lang-picker-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.focusedIndex = Math.min(this.focusedIndex + 1, items.length - 1);
      this.updateFocus(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.focusedIndex = Math.max(this.focusedIndex - 1, 0);
      this.updateFocus(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[this.focusedIndex];
      if (item?.dataset['code']) this.select(item.dataset['code']);
    } else if (e.key === 'Escape') {
      this.close();
      this.btn.focus();
    }
  }

  private updateFocus(items: NodeListOf<HTMLElement>): void {
    items.forEach((item, i) => item.classList.toggle('is-focused', i === this.focusedIndex));
    items[this.focusedIndex]?.scrollIntoView({ block: 'nearest' });
  }
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const panels        = document.getElementById('panels')!;
const settingsBtn   = document.getElementById('settings-btn')!;
const backBtn       = document.getElementById('back-btn')!;
const themeBtn      = document.getElementById('theme-btn')!;
// Source mode seg control
const sourceFixedBtn   = document.getElementById('source-fixed') as HTMLButtonElement;
const sourceAutoBtn    = document.getElementById('source-auto') as HTMLButtonElement;
const rowFixedLangs    = document.getElementById('row-fixed-langs')!;
const rowTargetLang    = document.getElementById('row-target-lang')!;
const rowAutoTarget    = document.getElementById('row-auto-target')!;
// Translation mode seg control
const modeWordBtn      = document.getElementById('mode-word') as HTMLButtonElement;
const modeSentenceBtn  = document.getElementById('mode-sentence') as HTMLButtonElement;
const selectionBox     = document.getElementById('selection-enabled') as HTMLInputElement;
const smartSkipBox     = document.getElementById('smart-skip') as HTMLInputElement;
const rowKnownLangs    = document.getElementById('row-known-langs') as HTMLElement;
const knownLangsWrap   = document.getElementById('known-langs-wrap') as HTMLElement;
const twoWayBox        = document.getElementById('two-way') as HTMLInputElement;
const rowTwoWay        = document.getElementById('row-two-way') as HTMLElement;
const showBothTextsBox  = document.getElementById('show-both-texts') as HTMLInputElement;
const skipFormFieldsBox = document.getElementById('skip-form-fields') as HTMLInputElement;

// Site toggle
const siteDomainEl  = document.getElementById('site-domain')!;
const siteEnabledBox = document.getElementById('site-enabled') as HTMLInputElement;

const captureBtns   = document.querySelectorAll<HTMLButtonElement>('.shortcut-capture-btn');

// Default behavior
const behaviorBtns         = document.querySelectorAll<HTMLButtonElement>('[data-behavior]');
const behaviorLanguageRow  = document.getElementById('behavior-language-row')!;
const targetLangBehaviorEl = document.getElementById('target-language')!;

// Grammar
const grammarModeBox  = document.getElementById('grammar-mode') as HTMLInputElement;
const grammarPosSel   = document.getElementById('grammar-position') as HTMLSelectElement;
const rowGrammarPos   = document.getElementById('row-grammar-position') as HTMLElement;

// API config
const preferredEngineSel  = document.getElementById('preferred-engine') as HTMLSelectElement;
const engineHint          = document.getElementById('engine-hint')!;
const rowMyMemoryEmail    = document.getElementById('row-mymemory-email')!;
const rowLingvaUrl        = document.getElementById('row-lingva-url')!;
const rowLibreUrl         = document.getElementById('row-libre-url')!;
const rowDeeplKey         = document.getElementById('row-deepl-key')!;
const myMemoryEmailInput  = document.getElementById('mymemory-email') as HTMLInputElement;
const lingvaUrlInput      = document.getElementById('lingva-url') as HTMLInputElement;
const libreUrlInput       = document.getElementById('libretranslate-url') as HTMLInputElement;
const deeplKeyInput       = document.getElementById('deepl-key') as HTMLInputElement;

const fontSizeRange    = document.getElementById('font-size') as HTMLInputElement;
const fontSizeVal      = document.getElementById('font-size-val')!;
const maxWidthRange    = document.getElementById('max-width') as HTMLInputElement;
const maxWidthVal      = document.getElementById('max-width-val')!;
const fontFamilySel    = document.getElementById('font-family') as HTMLSelectElement;
const hideDelayRange   = document.getElementById('hide-delay') as HTMLInputElement;
const hideDelayVal     = document.getElementById('hide-delay-val')!;
const borderRadiusRange = document.getElementById('border-radius') as HTMLInputElement;
const borderRadiusVal   = document.getElementById('border-radius-val')!;
const blurRange        = document.getElementById('blur-level') as HTMLInputElement;
const blurVal          = document.getElementById('blur-level-val')!;
const compactBox       = document.getElementById('compact-mode') as HTMLInputElement;

// ── Language pickers ──────────────────────────────────────────────────────────

const sourcePicker = new LangPicker(
  document.getElementById('source-lang')!,
  (code) => { chrome.storage.sync.set({ sourceLanguage: code }); },
);

const targetPicker = new LangPicker(
  document.getElementById('target-lang')!,
  (code) => {
    chrome.storage.sync.set({ targetLanguage: code });
    autoTargetPicker.value = code;
    targetLangBehaviorPicker.value = code;
  },
);

const autoTargetPicker = new LangPicker(
  document.getElementById('auto-target-lang')!,
  (code) => {
    chrome.storage.sync.set({ targetLanguage: code });
    targetPicker.value = code;
    targetLangBehaviorPicker.value = code;
  },
);

const targetLangBehaviorPicker = new LangPicker(
  targetLangBehaviorEl,
  (code) => { chrome.storage.sync.set({ targetLanguage: code }); },
);

// ── Known languages chip UI ───────────────────────────────────────────────────

let knownLanguages: string[] = [];

function renderKnownChips(): void {
  // Remove old chips (keep the picker div at the end)
  const picker = document.getElementById('known-langs-picker')!;
  knownLangsWrap.querySelectorAll('.known-chip').forEach(c => c.remove());

  for (const code of knownLanguages) {
    const lang = LANGUAGES.find(([c]) => c === code);
    const chip = document.createElement('span');
    chip.className = 'known-chip';
    chip.style.cssText = 'display:inline-flex;align-items:center;gap:3px;padding:1px 7px 1px 8px;border-radius:999px;font-size:10.5px;background:rgba(18,127,148,0.12);color:var(--text-muted);border:1px solid var(--border);cursor:default;';
    chip.textContent = lang?.[1] ?? code.toUpperCase();

    const x = document.createElement('button');
    x.type = 'button';
    x.style.cssText = 'border:none;background:none;padding:0;margin:0;cursor:pointer;font-size:11px;line-height:1;color:inherit;opacity:0.6;';
    x.textContent = '×';
    x.addEventListener('click', () => {
      knownLanguages = knownLanguages.filter(k => k !== code);
      chrome.storage.sync.set({ knownLanguages: [...knownLanguages] });
      renderKnownChips();
    });
    chip.appendChild(x);
    knownLangsWrap.insertBefore(chip, picker);
  }
}

const knownLangPicker = new LangPicker(
  document.getElementById('known-langs-picker')!,
  (code) => {
    if (!knownLanguages.includes(code)) {
      knownLanguages = [...knownLanguages, code];
      chrome.storage.sync.set({ knownLanguages: [...knownLanguages] });
      renderKnownChips();
    }
    // Reset picker display back to placeholder after selection
    knownLangPicker.value = '';
  },
);

function applySmartSkip(enabled: boolean): void {
  rowKnownLangs.style.display = enabled ? '' : 'none';
}

// ── Runtime state ─────────────────────────────────────────────────────────────
let shortcuts: ShortcutConfig = { ...DEFAULT_SHORTCUTS };
let capturingBtn: HTMLButtonElement | null = null;
let capturingKey: keyof ShortcutConfig | null = null;

let currentHostname: string | null = null;
let siteOverrides: Record<string, boolean> = {};
let currentDefaultBehavior: DefaultBehavior = 'on';

// ── Load stored settings ──────────────────────────────────────────────────────
chrome.storage.sync.get(
  ['theme', 'shortcuts', 'translationMode', 'tooltipStyle',
   'defaultBehavior', 'siteOverrides', 'selectionEnabled', 'smartSkip', 'knownLanguages', 'twoWay', 'showBothTexts', 'skipFormFields',
   'sourceMode', 'sourceLanguage', 'targetLanguage',
   'grammarMode', 'grammarPosition', 'apiConfig'],
  (result: Partial<StorageSchema>) => {
    const theme: Theme          = result.theme ?? 'light';
    const mode: TranslationMode = result.translationMode ?? 'sentence';
    const style: TooltipStyle   = { ...DEFAULT_TOOLTIP_STYLE, ...(result.tooltipStyle ?? {}) };
    shortcuts                   = { ...DEFAULT_SHORTCUTS, ...(result.shortcuts ?? {}) };
    currentDefaultBehavior      = result.defaultBehavior ?? 'off';
    siteOverrides               = result.siteOverrides ?? {};
    const sourceMode            = (result.sourceMode ?? 'fixed') as SourceMode;
    const sourceLang            = result.sourceLanguage ?? 'en';
    const targetLang            = result.targetLanguage ?? 'de';

    updateModeBtn(mode);
    applyTheme(theme);
    updateCaptureBtnLabels();
    applyTooltipStyle(style);
    applyDefaultBehavior(currentDefaultBehavior, targetLang);
    updateSiteToggle();
    selectionBox.checked      = result.selectionEnabled !== false;
    smartSkipBox.checked      = result.smartSkip !== false;
    knownLanguages            = result.knownLanguages ?? [];
    applySmartSkip(smartSkipBox.checked);
    renderKnownChips();
    twoWayBox.checked         = result.twoWay === true;
    showBothTextsBox.checked  = result.showBothTexts === true;
    skipFormFieldsBox.checked = result.skipFormFields !== false;
    applySourceMode(sourceMode, sourceLang, targetLang);
    applyGrammarMode(result.grammarMode ?? false, (result.grammarPosition ?? 'bottom') as GrammarPosition);
    applyApiConfig({ ...DEFAULT_API_CONFIG, ...(result.apiConfig ?? {}) } as ApiConfig);
  }
);

// ── Current tab hostname ──────────────────────────────────────────────────────
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  try {
    const url = tab?.url ?? '';
    currentHostname = url ? new URL(url).hostname : null;
  } catch {
    currentHostname = null;
  }
  siteDomainEl.textContent = currentHostname
    ? (currentHostname.length > 30 ? currentHostname.slice(0, 27) + '…' : currentHostname)
    : 'unknown site';
  updateSiteToggle();
});

// ── Per-site toggle ───────────────────────────────────────────────────────────
function computeSiteEnabled(): boolean {
  if (!currentHostname) return true;
  if (currentHostname in siteOverrides) return siteOverrides[currentHostname];
  return currentDefaultBehavior !== 'off';
}

function updateSiteToggle(): void {
  siteEnabledBox.checked = computeSiteEnabled();
}

siteEnabledBox.addEventListener('change', () => {
  if (!currentHostname) return;
  siteOverrides[currentHostname] = siteEnabledBox.checked;
  chrome.storage.sync.set({ siteOverrides: { ...siteOverrides } });
});

// ── Default behavior ──────────────────────────────────────────────────────────
function applyDefaultBehavior(behavior: DefaultBehavior, targetLang?: string): void {
  currentDefaultBehavior = behavior;
  behaviorBtns.forEach(btn => {
    btn.classList.toggle('seg-active', btn.dataset['behavior'] === behavior);
  });
  behaviorLanguageRow.style.display = behavior === 'language' ? 'flex' : 'none';
  if (targetLang) targetLangBehaviorPicker.value = targetLang;
}

behaviorBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    currentDefaultBehavior = btn.dataset['behavior'] as DefaultBehavior;
    applyDefaultBehavior(currentDefaultBehavior);
    chrome.storage.sync.set({ defaultBehavior: currentDefaultBehavior });
    updateSiteToggle();
  });
});

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(theme: Theme): void {
  document.body.classList.toggle('light', theme === 'light');
  themeBtn.textContent = theme === 'light' ? '🌙' : '☀️';
}

themeBtn.addEventListener('click', () => {
  const next: Theme = document.body.classList.contains('light') ? 'dark' : 'light';
  applyTheme(next);
  chrome.storage.sync.set({ theme: next });
});

// ── Settings panel ────────────────────────────────────────────────────────────
settingsBtn.addEventListener('click', () => {
  panels.classList.add('show-settings');
  settingsBtn.classList.add('active');
});

backBtn.addEventListener('click', () => {
  stopCapturing();
  panels.classList.remove('show-settings');
  settingsBtn.classList.remove('active');
});

// ── Source mode ───────────────────────────────────────────────────────────────
function applySourceMode(mode: SourceMode, sourceLang: string, targetLang: string): void {
  sourceFixedBtn.classList.toggle('seg-active', mode === 'fixed');
  sourceAutoBtn.classList.toggle('seg-active',  mode === 'auto');
  rowFixedLangs.style.display   = mode === 'fixed' ? '' : 'none';
  rowTargetLang.style.display   = 'none'; // always hidden (pickers are in lang-pair)
  rowAutoTarget.style.display   = mode === 'auto'  ? '' : 'none';
  rowTwoWay.style.display       = mode === 'fixed' ? '' : 'none';
  sourcePicker.value    = sourceLang;
  targetPicker.value    = targetLang;
  autoTargetPicker.value = targetLang;
}

function setSourceMode(next: SourceMode): void {
  chrome.storage.sync.get(['sourceLanguage', 'targetLanguage'], (r) => {
    const sourceLang = (r['sourceLanguage'] as string) ?? 'en';
    const targetLang = (r['targetLanguage'] as string) ?? 'de';
    chrome.storage.sync.set({ sourceMode: next }, () => applySourceMode(next, sourceLang, targetLang));
  });
}

sourceFixedBtn.addEventListener('click', () => setSourceMode('fixed'));
sourceAutoBtn.addEventListener('click',  () => setSourceMode('auto'));

// ── Translation Mode ──────────────────────────────────────────────────────────
function updateModeBtn(mode: TranslationMode): void {
  modeWordBtn.classList.toggle('seg-active',     mode === 'word');
  modeSentenceBtn.classList.toggle('seg-active', mode === 'sentence');
}

modeWordBtn.addEventListener('click', () => {
  chrome.storage.sync.set({ translationMode: 'word' }, () => updateModeBtn('word'));
});
modeSentenceBtn.addEventListener('click', () => {
  chrome.storage.sync.set({ translationMode: 'sentence' }, () => updateModeBtn('sentence'));
});

selectionBox.addEventListener('change', () => {
  chrome.storage.sync.set({ selectionEnabled: selectionBox.checked });
});

smartSkipBox.addEventListener('change', () => {
  applySmartSkip(smartSkipBox.checked);
  chrome.storage.sync.set({ smartSkip: smartSkipBox.checked });
});

twoWayBox.addEventListener('change', () => {
  chrome.storage.sync.set({ twoWay: twoWayBox.checked });
});

showBothTextsBox.addEventListener('change', () => {
  chrome.storage.sync.set({ showBothTexts: showBothTextsBox.checked });
});

skipFormFieldsBox.addEventListener('change', () => {
  chrome.storage.sync.set({ skipFormFields: skipFormFieldsBox.checked });
});

// ── Shortcut hints & capture ──────────────────────────────────────────────────
const isMac = /Mac|iPhone|iPod|iPad/i.test(navigator.platform);

const MAC_SYMBOLS: Record<string, string> = {
  Alt:     '⌥',
  Meta:    '⌘',
  Control: '⌃',
  Shift:   '⇧',
  Escape:  '⎋',
};

const WIN_LABELS: Record<string, string> = {
  Control: 'Ctrl',
  Meta:    'Win',
};

// Formats a stored key string (e.g. "Control+Shift+K" or "Escape") for display.
function formatKey(key: string): string {
  const parts = key.split('+');
  const formatted = parts.map(p => {
    if (isMac) return MAC_SYMBOLS[p] ?? (p.length === 1 ? p.toUpperCase() : p);
    return WIN_LABELS[p] ?? (p === 'Escape' ? 'Esc' : p.length === 1 ? p.toUpperCase() : p);
  });
  return formatted.join(isMac ? '' : '+');
}

function updateCaptureBtnLabels(): void {
  captureBtns.forEach(btn => {
    const key = btn.dataset['key'] as keyof ShortcutConfig;
    btn.textContent = formatKey(shortcuts[key]);
  });
}

function startCapturing(btn: HTMLButtonElement, key: keyof ShortcutConfig): void {
  stopCapturing();
  capturingBtn = btn; capturingKey = key;
  btn.classList.add('capturing');
  btn.textContent = 'Press key…';
}

function stopCapturing(): void {
  capturingBtn?.classList.remove('capturing');
  capturingBtn = null; capturingKey = null;
  updateCaptureBtnLabels();
}

captureBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    capturingBtn === btn ? stopCapturing() : startCapturing(btn, btn.dataset['key'] as keyof ShortcutConfig);
  });
});

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (!capturingKey) return;
  e.preventDefault(); e.stopPropagation();
  const MODS = ['Alt', 'Control', 'Shift', 'Meta'];
  if (capturingKey === 'triggerModifier') {
    if (!MODS.includes(e.key)) return;
    shortcuts.triggerModifier = e.key;
  } else {
    if (MODS.includes(e.key)) return; // wait for the actual key
    // Build combination: collect held modifiers + the pressed key
    const parts: string[] = [];
    if (e.ctrlKey  && e.key !== 'Control') parts.push('Control');
    if (e.altKey   && e.key !== 'Alt')     parts.push('Alt');
    if (e.shiftKey && e.key !== 'Shift')   parts.push('Shift');
    if (e.metaKey  && e.key !== 'Meta')    parts.push('Meta');
    parts.push(e.key);
    const combo = parts.join('+');
    if (capturingKey === 'pinKey')     shortcuts.pinKey     = combo;
    if (capturingKey === 'dismissKey') shortcuts.dismissKey = combo;
  }
  chrome.storage.sync.set({ shortcuts: { ...shortcuts } });
  stopCapturing();
}, true);

// ── Tooltip appearance ────────────────────────────────────────────────────────
function applyTooltipStyle(style: TooltipStyle): void {
  fontSizeRange.value        = String(style.fontSize);
  fontSizeVal.textContent    = `${style.fontSize}px`;
  maxWidthRange.value        = String(style.maxWidth);
  maxWidthVal.textContent    = `${style.maxWidth}px`;
  fontFamilySel.value        = style.fontFamily;
  hideDelayRange.value       = String(style.hideDelay);
  hideDelayVal.textContent   = `${(style.hideDelay / 1000).toFixed(1)}s`;
  borderRadiusRange.value    = String(style.borderRadius ?? 10);
  borderRadiusVal.textContent = `${style.borderRadius ?? 10}px`;
  blurRange.value            = String(style.blur ?? 14);
  blurVal.textContent        = `${style.blur ?? 14}px`;
  compactBox.checked         = style.compact ?? false;
}

function saveTooltipStyle(): void {
  chrome.storage.sync.set({
    tooltipStyle: {
      fontSize:     Number(fontSizeRange.value),
      maxWidth:     Number(maxWidthRange.value),
      fontFamily:   fontFamilySel.value,
      hideDelay:    Number(hideDelayRange.value),
      borderRadius: Number(borderRadiusRange.value),
      blur:         Number(blurRange.value),
      compact:      compactBox.checked,
    },
  });
}

fontSizeRange.addEventListener('input', () => { fontSizeVal.textContent = `${fontSizeRange.value}px`; saveTooltipStyle(); });
maxWidthRange.addEventListener('input', () => { maxWidthVal.textContent = `${maxWidthRange.value}px`; saveTooltipStyle(); });
fontFamilySel.addEventListener('change', saveTooltipStyle);
hideDelayRange.addEventListener('input', () => { hideDelayVal.textContent = `${(parseInt(hideDelayRange.value) / 1000).toFixed(1)}s`; saveTooltipStyle(); });
borderRadiusRange.addEventListener('input', () => { borderRadiusVal.textContent = `${borderRadiusRange.value}px`; saveTooltipStyle(); });
blurRange.addEventListener('input', () => { blurVal.textContent = `${blurRange.value}px`; saveTooltipStyle(); });
compactBox.addEventListener('change', saveTooltipStyle);

// ── Grammar view ──────────────────────────────────────────────────────────────

function applyGrammarMode(enabled: boolean, position: GrammarPosition): void {
  grammarModeBox.checked = enabled;
  grammarPosSel.value = position;
  rowGrammarPos.style.display = enabled ? '' : 'none';
}

grammarModeBox.addEventListener('change', () => {
  rowGrammarPos.style.display = grammarModeBox.checked ? '' : 'none';
  chrome.storage.sync.set({ grammarMode: grammarModeBox.checked });
});

grammarPosSel.addEventListener('change', () => {
  chrome.storage.sync.set({ grammarPosition: grammarPosSel.value as GrammarPosition });
});

// ── API config ────────────────────────────────────────────────────────────────

const ENGINE_HINTS: Record<PreferredEngine, string> = {
  auto:           'Tries Chrome AI → MyMemory → Lingva → configured fallbacks.',
  chrome:         'Chrome AI only — on-device Gemini Nano, no limits, Chrome 138+ required.',
  mymemory:       'MyMemory only — free, no setup needed. Add email below for 10× limit.',
  lingva:         'Lingva only — Google Translate quality, no API key needed.',
  libretranslate: 'LibreTranslate only — requires a URL below.',
  deepl:          'DeepL only — requires an API key below.',
};

function applyApiConfig(cfg: ApiConfig): void {
  preferredEngineSel.value    = cfg.preferredEngine ?? 'auto';
  myMemoryEmailInput.value    = cfg.myMemoryEmail ?? '';
  lingvaUrlInput.value        = cfg.lingvaUrl ?? '';
  libreUrlInput.value         = cfg.libreTranslateUrl ?? '';
  deeplKeyInput.value         = cfg.deeplApiKey ?? '';
  updateEngineUI(cfg.preferredEngine ?? 'auto');
}

function updateEngineUI(engine: PreferredEngine): void {
  engineHint.textContent = ENGINE_HINTS[engine];
  const showMyMemory = engine === 'auto' || engine === 'mymemory';
  const showLingva   = engine === 'auto' || engine === 'lingva';
  const showLibre    = engine === 'auto' || engine === 'libretranslate';
  const showDeepl    = engine === 'auto' || engine === 'deepl';
  rowMyMemoryEmail.style.display = showMyMemory ? '' : 'none';
  rowLingvaUrl.style.display     = showLingva   ? '' : 'none';
  rowLibreUrl.style.display      = showLibre    ? '' : 'none';
  rowDeeplKey.style.display      = showDeepl    ? '' : 'none';
}

function saveApiConfig(): void {
  chrome.storage.sync.set({
    apiConfig: {
      preferredEngine:   preferredEngineSel.value as PreferredEngine,
      myMemoryEmail:     myMemoryEmailInput.value.trim(),
      lingvaUrl:         lingvaUrlInput.value.trim(),
      libreTranslateUrl: libreUrlInput.value.trim(),
      deeplApiKey:       deeplKeyInput.value.trim(),
    },
  });
}

preferredEngineSel.addEventListener('change', () => {
  updateEngineUI(preferredEngineSel.value as PreferredEngine);
  saveApiConfig();
});
myMemoryEmailInput.addEventListener('change', saveApiConfig);
lingvaUrlInput.addEventListener('change', saveApiConfig);
libreUrlInput.addEventListener('change', saveApiConfig);
deeplKeyInput.addEventListener('change', saveApiConfig);
