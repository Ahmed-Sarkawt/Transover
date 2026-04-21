import { extractWordAtPoint, extractElementAtPoint } from './extractor';
import { translate } from './translator';
import { showLoading, showTooltip, showError, hideTooltip, togglePin, setTheme, setTooltipStyle, isInsideTooltip, scheduleTooltipHide, showSkipIndicator } from './tooltip';
import { detectLang, isDetectedMatch } from './langdetect';
import { analyzeGrammar, tagWord } from './posAnalyzer';
import type { StorageSchema, ShortcutConfig, TranslationMode, TooltipStyle, DefaultBehavior, SourceMode, GrammarPosition, ApiConfig } from '../shared/types';
import { DEFAULT_SHORTCUTS, DEFAULT_TOOLTIP_STYLE, DEFAULT_API_CONFIG } from '../shared/types';

// ── Chrome 138+ Language Detector API (Gemini Nano, fully on-device) ──────────
interface ChromeLangDetectorResult { detectedLanguage: string; confidence: number }
interface ChromeLangDetector { detect(text: string): Promise<ChromeLangDetectorResult[]> }
declare const LanguageDetector: {
  availability(): Promise<'available' | 'downloadable' | 'unavailable'>;
  create(opts?: { expectedInputLanguages?: string[] }): Promise<ChromeLangDetector>;
} | undefined;

// ── Chrome Prompt API (Gemini Nano, on-device, Chrome 127+) ───────────────────
declare const window: Window & {
  ai?: {
    languageModel?: {
      availability(): Promise<string>;
      create(opts?: { systemPrompt?: string }): Promise<{
        prompt(text: string): Promise<string>;
        destroy(): void;
      }>;
    };
  };
};

async function explainWord(word: string, translated: string, srcLang: string, tgtLang: string): Promise<string> {
  const lm = window.ai?.languageModel;
  if (!lm) throw new Error('unavailable');
  const avail = await lm.availability();
  if (avail === 'no') throw new Error('unavailable');

  const session = await lm.create({
    systemPrompt: 'You are a concise linguistics assistant. Answer in 1–2 sentences only.',
  });
  try {
    return (await session.prompt(
      `"${word}" (${srcLang.toUpperCase()}) translates to "${translated}" (${tgtLang.toUpperCase()}). ` +
      `Briefly explain its grammatical role or any notable nuance.`,
    )).trim();
  } finally {
    session.destroy();
  }
}

// Cached detector instance. Recreated when targetLanguage changes so the
// expectedInputLanguages hint stays accurate.
let chromeDetector: ChromeLangDetector | null = null;
let chromeDetectorPromise: Promise<void> | null = null;
let chromeDetectorLang: string | null = null;

function initChromeDetector(targetLang: string): void {
  if (chromeDetectorLang === targetLang && chromeDetectorPromise !== null) return;
  chromeDetectorLang = targetLang;
  chromeDetector = null;
  chromeDetectorPromise = (async () => {
    try {
      if (typeof LanguageDetector === 'undefined') return;
      const avail = await LanguageDetector.availability();
      if (avail === 'unavailable') return;
      chromeDetector = await LanguageDetector.create({ expectedInputLanguages: [targetLang] });
    } catch {
      // Chrome AI unavailable; heuristics will be used as fallback
    }
  })();
}

async function detectLangWithFallback(text: string): Promise<string | null> {
  if (chromeDetector) {
    try {
      const results = await chromeDetector.detect(text);
      if (results.length > 0 && results[0].confidence >= 0.80) {
        return results[0].detectedLanguage.split('-')[0];
      }
    } catch {
      // fall through to heuristics
    }
  }
  return detectLang(text);
}

const DEBOUNCE_MS = 350;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let currentAbortController: AbortController | null = null;
let tooltipVisible = false;
let lastElementKey: string | null = null;
let modifierHeld = false;
let pendingElementResult: { el: Element; text: string } | null = null;
let storageReady = false;

const state: StorageSchema = {
  theme:            'light',
  shortcuts:        { ...DEFAULT_SHORTCUTS },
  translationMode:  'sentence',
  tooltipStyle:     { ...DEFAULT_TOOLTIP_STYLE },
  defaultBehavior:  'off',
  siteOverrides:    {},
  selectionEnabled: true,
  smartSkip:        true,
  knownLanguages:   [],
  twoWay:           false,
  showBothTexts:    false,
  skipFormFields:   true,
  sourceMode:       'fixed',
  sourceLanguage:   'en',
  targetLanguage:   'de',
  grammarMode:      false,
  grammarPosition:  'bottom',
  apiConfig:        { ...DEFAULT_API_CONFIG },
};

const STORAGE_KEYS = [
  'theme', 'shortcuts', 'translationMode', 'tooltipStyle',
  'defaultBehavior', 'siteOverrides',
  'selectionEnabled', 'smartSkip', 'knownLanguages', 'twoWay', 'showBothTexts', 'skipFormFields',
  'sourceMode', 'sourceLanguage', 'targetLanguage',
  'grammarMode', 'grammarPosition', 'apiConfig',
];

chrome.storage.sync.get(STORAGE_KEYS, (result) => {
  state.theme           = (result['theme']           as string)               ?? 'light';
  state.shortcuts       = { ...DEFAULT_SHORTCUTS, ...(result['shortcuts']    as Partial<ShortcutConfig> ?? {}) };
  state.translationMode = (result['translationMode'] as TranslationMode)     ?? 'sentence';
  state.tooltipStyle    = { ...DEFAULT_TOOLTIP_STYLE, ...(result['tooltipStyle'] as Partial<TooltipStyle> ?? {}) };
  state.defaultBehavior = (result['defaultBehavior'] as DefaultBehavior)     ?? 'off';
  state.siteOverrides   = (result['siteOverrides']   as Record<string, boolean>) ?? {};
  state.selectionEnabled = result['selectionEnabled'] !== false;
  state.smartSkip       = result['smartSkip']        !== false;
  state.knownLanguages  = (result['knownLanguages']  as string[])            ?? [];
  state.twoWay          = (result['twoWay']          as boolean)             ?? false;
  state.showBothTexts   = (result['showBothTexts']   as boolean)             ?? false;
  state.skipFormFields  = result['skipFormFields']   !== false;
  state.sourceMode      = (result['sourceMode']      as SourceMode)          ?? 'fixed';
  state.sourceLanguage  = (result['sourceLanguage']  as string)              ?? 'en';
  state.targetLanguage  = (result['targetLanguage']  as string)              ?? 'de';
  state.grammarMode     = (result['grammarMode']     as boolean)             ?? false;
  state.grammarPosition = (result['grammarPosition'] as GrammarPosition)     ?? 'bottom';
  state.apiConfig       = { ...DEFAULT_API_CONFIG, ...(result['apiConfig']  as Partial<ApiConfig> ?? {}) };
  setTheme(state.theme);
  setTooltipStyle(state.tooltipStyle);
  storageReady = true;
  initChromeDetector(state.targetLanguage);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes['shortcuts'])        state.shortcuts        = { ...DEFAULT_SHORTCUTS, ...changes['shortcuts'].newValue };
  if (changes['translationMode'])  state.translationMode  = changes['translationMode'].newValue;
  if (changes['defaultBehavior'])  state.defaultBehavior  = changes['defaultBehavior'].newValue;
  if (changes['siteOverrides'])    state.siteOverrides    = changes['siteOverrides'].newValue ?? {};
  if (changes['selectionEnabled']) state.selectionEnabled = changes['selectionEnabled'].newValue;
  if (changes['smartSkip'])        state.smartSkip        = changes['smartSkip'].newValue;
  if (changes['knownLanguages'])   state.knownLanguages   = changes['knownLanguages'].newValue ?? [];
  if (changes['twoWay'])           state.twoWay           = changes['twoWay'].newValue;
  if (changes['showBothTexts'])    state.showBothTexts    = changes['showBothTexts'].newValue;
  if (changes['skipFormFields'])   state.skipFormFields   = changes['skipFormFields'].newValue;
  if (changes['sourceMode'])       state.sourceMode       = changes['sourceMode'].newValue;
  if (changes['sourceLanguage'])   state.sourceLanguage   = changes['sourceLanguage'].newValue;
  if (changes['targetLanguage']) {
    state.targetLanguage = changes['targetLanguage'].newValue;
    initChromeDetector(state.targetLanguage);
  }
  if (changes['grammarMode'])      state.grammarMode      = changes['grammarMode'].newValue;
  if (changes['grammarPosition'])  state.grammarPosition  = changes['grammarPosition'].newValue;
  if (changes['apiConfig'])        state.apiConfig        = { ...DEFAULT_API_CONFIG, ...changes['apiConfig'].newValue };
  if (changes['theme']) {
    state.theme = changes['theme'].newValue;
    setTheme(state.theme);
  }
  if (changes['tooltipStyle']) {
    state.tooltipStyle = { ...DEFAULT_TOOLTIP_STYLE, ...changes['tooltipStyle'].newValue };
    setTooltipStyle(state.tooltipStyle);
  }
});

// ── Activation ────────────────────────────────────────────────────────────────

function computeEnabled(): boolean {
  const hostname = location.hostname;
  if (hostname in state.siteOverrides) return state.siteOverrides[hostname];
  switch (state.defaultBehavior) {
    case 'on':  return true;
    case 'off': return false;
    case 'language': {
      const pageLang = (document.documentElement.lang ?? '').split('-')[0].toLowerCase();
      if (state.sourceMode === 'auto') {
        // Auto mode: activate on non-target pages (or pages with no lang attribute)
        return pageLang === '' || pageLang !== state.targetLanguage;
      }
      // Fixed mode: activate only on source-language pages
      return pageLang !== '' && pageLang === state.sourceLanguage;
    }
  }
}

// ── Core translate-and-show ───────────────────────────────────────────────────

async function translateAndShow(text: string, x: number, y: number): Promise<void> {
  // ── Determine translation direction ───────────────────────────────────────
  let effectiveSrc = state.sourceLanguage;
  let effectiveTgt = state.targetLanguage;

  // Always run detection: resolves source in auto mode, drives smart-skip/two-way in both modes
  if (chromeDetectorPromise) await chromeDetectorPromise;
  const detected = await detectLangWithFallback(text);

  if (state.sourceMode === 'auto') {
    // Use detected language as source so Chrome AI and grammar both work; fall back to 'auto'
    effectiveSrc = detected ?? 'auto';
  }

  if (state.twoWay && detected) {
    // Two-way: flip direction when text is in the target language
    if (isDetectedMatch(detected, state.targetLanguage)) {
      effectiveSrc = state.targetLanguage;
      effectiveTgt = state.sourceLanguage;
    }
    // If detected matches source (or is ambiguous) → keep normal direction
  } else if (state.smartSkip && detected) {
    // One-way smart skip: don't translate target-language text (or any known language).
    // Holding the trigger modifier overrides the skip — useful when detection is wrong.
    const isTarget = isDetectedMatch(detected, state.targetLanguage);
    const isKnown  = state.knownLanguages.some(k => isDetectedMatch(detected, k));
    if (isTarget || isKnown) {
      if (modifierHeld) {
        // Force-translate: honour the override but keep normal direction
      } else {
        showSkipIndicator(detected, x, y);
        return;
      }
    }
  }

  // ── Translate ─────────────────────────────────────────────────────────────
  showLoading(x, y);
  const controller = new AbortController();
  currentAbortController = controller;

  try {
    const result = await translate(
      text, controller.signal,
      effectiveSrc === 'auto' ? 'auto' : 'fixed',
      effectiveSrc, effectiveTgt,
      state.apiConfig,
    );

    if (currentAbortController !== controller) return;
    tooltipVisible = true;

    const displaySrc = effectiveSrc !== 'auto' ? effectiveSrc : 'auto';

    const grammarLangs = new Set(['en', 'de', 'es', 'fr', 'ja']);
    const supportsGrammar = grammarLangs.has(effectiveSrc);

    const grammarTokens =
      state.grammarMode && state.translationMode === 'sentence' && supportsGrammar
        ? analyzeGrammar(text, effectiveSrc)
        : undefined;

    const pos =
      state.grammarMode && state.translationMode === 'word' && supportsGrammar
        ? tagWord(text, effectiveSrc)
        : undefined;

    const onExplain = state.translationMode === 'word'
      ? () => explainWord(text, result.translated, effectiveSrc, effectiveTgt)
      : undefined;

    showTooltip(result.translated, displaySrc, effectiveTgt, x, y, {
      pos,
      grammarTokens,
      grammarPosition: state.grammarPosition,
      originalText: text,
      engine: result.engine,
      onExplain,
      showBothTexts: state.showBothTexts,
    });

  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
    if (currentAbortController === controller) {
      showError(err instanceof Error ? err.message : 'Translation failed', x, y);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isModifierHeld(event: KeyboardEvent): boolean {
  switch (state.shortcuts.triggerModifier) {
    case 'Alt':     return event.altKey;
    case 'Control': return event.ctrlKey;
    case 'Shift':   return event.shiftKey;
    case 'Meta':    return event.metaKey;
    default:        return false;
  }
}

// Matches a stored key string like "Shift+K" or "Escape" against a KeyboardEvent.
function keyMatches(event: KeyboardEvent, stored: string): boolean {
  const parts   = stored.split('+');
  const mainKey = parts[parts.length - 1];
  if (event.key.toLowerCase() !== mainKey.toLowerCase() && event.key !== mainKey) return false;
  if ((parts.includes('Control')) !== event.ctrlKey)  return false;
  if ((parts.includes('Alt'))     !== event.altKey)   return false;
  if ((parts.includes('Shift'))   !== event.shiftKey) return false;
  if ((parts.includes('Meta'))    !== event.metaKey)  return false;
  return true;
}

function cancelPending(): void {
  if (debounceTimer !== null) { clearTimeout(debounceTimer); debounceTimer = null; }
  if (currentAbortController) { currentAbortController.abort(); currentAbortController = null; }
}

// ── Hover handler ─────────────────────────────────────────────────────────────

function isFormInputField(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const tag = (target as Element).tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function onMouseMove(event: MouseEvent): void {
  if (!storageReady) return;
  if (isInsideTooltip(event.target)) { cancelPending(); return; }
  if (state.skipFormFields && isFormInputField(event.target)) { cancelPending(); return; }
  if (!computeEnabled() && !modifierHeld) { cancelPending(); return; }

  const x = event.clientX;
  const y = event.clientY;
  const target = event.target;

  if (state.translationMode === 'sentence') {
    pendingElementResult = extractElementAtPoint(x, y);
    if (pendingElementResult) {
      const key = pendingElementResult.text.slice(0, 40);
      if (key !== lastElementKey) lastElementKey = key;
    }
  }

  cancelPending();

  debounceTimer = setTimeout(async () => {
    const text = state.translationMode === 'sentence'
      ? pendingElementResult?.text ?? null
      : extractWordAtPoint(x, y, target);

    if (!text) {
      if (tooltipVisible) { scheduleTooltipHide(); tooltipVisible = false; }
      return;
    }

    await translateAndShow(text, x, y);
  }, DEBOUNCE_MS);
}

// ── Selection handler ─────────────────────────────────────────────────────────

function onMouseUp(event: MouseEvent): void {
  if (!storageReady) return;
  if (!state.selectionEnabled) return;   // selection toggle is the sole gate
  if (isInsideTooltip(event.target)) return;
  if (event.target instanceof HTMLImageElement ||
      event.target instanceof HTMLVideoElement ||
      event.target instanceof HTMLCanvasElement) return;

  const x = event.clientX;
  const y = event.clientY;
  setTimeout(() => {
    if (!state.selectionEnabled) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (text.length < 2) return;
    cancelPending();
    translateAndShow(text, x, y);
  }, 50);
}

function onMouseLeave(): void {
  cancelPending();
  lastElementKey = null;
  pendingElementResult = null;
  tooltipVisible = false;
  scheduleTooltipHide();
}

// ── Keyboard ──────────────────────────────────────────────────────────────────

function onKeyDown(event: KeyboardEvent): void {
  if (!storageReady) return;
  const { triggerModifier, pinKey, dismissKey } = state.shortcuts;
  if (event.key === triggerModifier) modifierHeld = true;
  if (isModifierHeld(event) && keyMatches(event, pinKey)) {
    event.preventDefault();
    togglePin();
  }
  if (keyMatches(event, dismissKey)) hideTooltip(true);
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.key === state.shortcuts.triggerModifier) modifierHeld = false;
}

document.addEventListener('mousemove',  onMouseMove,  { passive: true });
document.addEventListener('mouseup',    onMouseUp);
document.addEventListener('mouseleave', onMouseLeave);
document.addEventListener('scroll',     onMouseLeave, { passive: true });
document.addEventListener('keydown',    onKeyDown);
document.addEventListener('keyup',      onKeyUp);
