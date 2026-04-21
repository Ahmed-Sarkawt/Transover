import type { Theme, TooltipStyle, GrammarPosition } from '../shared/types';
import { DEFAULT_TOOLTIP_STYLE } from '../shared/types';
import { type TaggedToken, POS_COLORS } from './posAnalyzer';

const TOOLTIP_ID = 'de-en-translator-tooltip';

let isPinned        = false;
let isHovered       = false;
let currentTheme: Theme = 'light';
let currentStyle: TooltipStyle = { ...DEFAULT_TOOLTIP_STYLE };
let hideTimer: ReturnType<typeof setTimeout> | null = null;

// ── Theme tokens ──────────────────────────────────────────────────────────────

const THEMES: Record<Theme, {
  bg: string;
  divider: string;
  textMain: string;
  textHint: string;
  shadow: string;
  shadowPinned: string;
  copyHover: string;
  errorColor: string;
}> = {
  dark: {
    bg:           'rgba(6, 39, 46, 0.82)',
    divider:      'rgba(18, 127, 148, 0.15)',
    textMain:     '#d4eef2',
    textHint:     'rgba(139, 191, 201, 0.50)',
    // Border ring expressed as box-shadow so it adapts to any page background
    shadow:       '0 0 0 1px rgba(18, 127, 148, 0.22), 0 8px 32px rgba(0,0,0,0.50)',
    shadowPinned: '0 0 0 1.5px rgba(18, 127, 148, 0.85), 0 0 0 5px rgba(18, 127, 148, 0.10), 0 8px 32px rgba(0,0,0,0.55)',
    copyHover:    'rgba(18, 127, 148, 0.18)',
    errorColor:   '#f87171',
  },
  light: {
    bg:           'rgba(240, 249, 251, 0.92)',
    divider:      'rgba(18, 127, 148, 0.12)',
    textMain:     '#06272e',
    textHint:     'rgba(6, 39, 46, 0.42)',
    shadow:       '0 0 0 1px rgba(18, 127, 148, 0.16), 0 8px 24px rgba(6, 39, 46, 0.10)',
    shadowPinned: '0 0 0 1.5px rgba(18, 127, 148, 0.75), 0 0 0 5px rgba(18, 127, 148, 0.08), 0 8px 24px rgba(6, 39, 46, 0.12)',
    copyHover:    'rgba(18, 127, 148, 0.10)',
    errorColor:   '#dc2626',
  },
};

// ── Animations ────────────────────────────────────────────────────────────────

if (!document.getElementById('tt-animations-style')) {
  const style = document.createElement('style');
  style.id = 'tt-animations-style';
  style.textContent = `
    /*
     * Transition-based show/hide — interruptible.
     * Keyframe animations restart from scratch when re-applied mid-flight,
     * causing the scale(0.4) snap visible on rapid hover. CSS transitions
     * retarget smoothly toward the latest state instead.
     */
    #de-en-translator-tooltip {
      opacity: 0;
      transform: scale(0.94) translateY(5px);
      transition-property: opacity, transform, box-shadow;
      transition-duration: 200ms, 200ms, 180ms;
      transition-timing-function: cubic-bezier(0.2, 0, 0, 1), cubic-bezier(0.2, 0, 0, 1), ease-out;
      will-change: transform, opacity;
    }
    #de-en-translator-tooltip.tt-visible {
      opacity: 1;
      transform: none;
    }
    /* Exit: shorter, eases in, retreats upward slightly */
    #de-en-translator-tooltip.tt-hiding {
      opacity: 0;
      transform: scale(0.97) translateY(-4px);
      transition-duration: 140ms;
      transition-timing-function: cubic-bezier(0.4, 0, 1, 1);
    }

    @keyframes tt-dot-bounce {
      0%, 80%, 100% { transform: scale(0.55); opacity: 0.35; }
      40%           { transform: scale(1);    opacity: 1; }
    }
    .tt-loading-dots { display:flex; align-items:center; gap:3px; padding:1px 0; }
    .tt-loading-dots > span {
      display:block; width:4px; height:4px; border-radius:50%; background:currentColor;
      animation: tt-dot-bounce 1.4s ease-in-out infinite;
      will-change: transform, opacity;
    }
    .tt-loading-dots > span:nth-child(2) { animation-delay:0.16s; }
    .tt-loading-dots > span:nth-child(3) { animation-delay:0.32s; }

    @keyframes tt-pin-pulse {
      0%, 100% { box-shadow: 0 0 0 2px rgba(18,127,148,0.30); }
      50%      { box-shadow: 0 0 0 5px rgba(18,127,148,0.10); }
    }
    #de-en-translator-tooltip[data-pinned="true"]::after {
      content: '';
      position: absolute;
      top: -4px; right: -4px;
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #127f94;
      animation: tt-pin-pulse 2s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
}

// ── Skip indicator ────────────────────────────────────────────────────────────

const SKIP_ID = 'de-en-translator-skip-indicator';
let skipTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Briefly shows a ghost badge near the cursor when smart skip suppresses a
 * translation, confirming that the detected language was already the target.
 */
export function showSkipIndicator(langCode: string, x: number, y: number): void {
  if (skipTimer) { clearTimeout(skipTimer); skipTimer = null; }

  let el = document.getElementById(SKIP_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = SKIP_ID;
    Object.assign(el.style, {
      position:      'fixed',
      zIndex:        '2147483647',
      pointerEvents: 'none',
      userSelect:    'none',
      display:       'none',
      fontFamily:    'system-ui, -apple-system, sans-serif',
      fontSize:      '10px',
      fontWeight:    '600',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      borderRadius:  '4px',
      padding:       '2px 5px',
      lineHeight:    '1.4',
      transition:    'opacity 200ms ease',
    });
    document.body.appendChild(el);
  }

  const t = THEMES[currentTheme];
  el.style.background = t.bg;
  el.style.color      = t.textHint;
  el.style.boxShadow  = t.shadow;
  el.textContent      = langCode.toUpperCase();

  // Position near cursor
  el.style.display = 'block';
  el.style.opacity = '0';
  requestAnimationFrame(() => {
    const rect = el!.getBoundingClientRect();
    el!.style.left    = `${Math.min(x + 10, window.innerWidth - rect.width - 8)}px`;
    el!.style.top     = `${Math.min(y - rect.height - 6, window.innerHeight - rect.height - 8)}px`;
    el!.style.opacity = '1';
  });

  skipTimer = setTimeout(() => {
    if (el) {
      el.style.opacity = '0';
      setTimeout(() => { if (el) el.style.display = 'none'; }, 200);
    }
    skipTimer = null;
  }, 900);
}

// ── Style helpers ─────────────────────────────────────────────────────────────

export function setTheme(theme: Theme): void {
  currentTheme = theme;
  const el = document.getElementById(TOOLTIP_ID) as HTMLDivElement | null;
  if (el) applyBaseStyles(el);
}

export function setTooltipStyle(style: TooltipStyle): void {
  currentStyle = style;
  const el = document.getElementById(TOOLTIP_ID) as HTMLDivElement | null;
  if (el) applyBaseStyles(el);
}

function applyBaseStyles(el: HTMLDivElement): void {
  const t = THEMES[currentTheme];
  const blur   = currentStyle.blur         ?? 14;
  const radius = currentStyle.borderRadius ?? 10;
  el.style.background     = t.bg;
  el.style.boxShadow      = isPinned ? t.shadowPinned : t.shadow;
  el.style.fontSize       = `${currentStyle.fontSize}px`;
  el.style.maxWidth       = `${currentStyle.maxWidth}px`;
  el.style.fontFamily     = currentStyle.fontFamily;
  el.style.borderRadius   = `${radius}px`;
  el.style.padding        = (currentStyle.compact ?? false) ? '6px 9px' : '9px 12px';
  el.dataset['pinned']    = isPinned ? 'true' : 'false';
  const blurStr = `blur(${blur}px) saturate(1.4)`;
  el.style.backdropFilter = blurStr;
  (el.style as CSSStyleDeclaration & { webkitBackdropFilter: string }).webkitBackdropFilter = blurStr;
}

// ── Tooltip DOM ───────────────────────────────────────────────────────────────

function ensureTooltip(): HTMLDivElement {
  let el = document.getElementById(TOOLTIP_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = TOOLTIP_ID;
    Object.assign(el.style, {
      position:     'fixed',
      zIndex:       '2147483647',
      padding:      '9px 12px',
      borderRadius: '10px',
      lineHeight:   '1.5',
      pointerEvents:'none',
      display:      'none',
      userSelect:   'none',
    });
    applyBaseStyles(el);

    el.addEventListener('mouseenter', () => {
      isHovered = true;
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = null;
    });
    el.addEventListener('mouseleave', () => {
      isHovered = false;
      scheduleTooltipHide();
    });
    el.addEventListener('click', (e) => {
      if ((e.target as Element).closest('.tt-copy-btn')) return;
      e.stopPropagation();
      isPinned = !isPinned;
      applyBaseStyles(el!);
    });

    document.body.appendChild(el);
  }
  return el;
}

export function isInsideTooltip(node: EventTarget | null): boolean {
  const el = document.getElementById(TOOLTIP_ID);
  return !!(el && node instanceof Node && el.contains(node));
}

// ── Copy button ───────────────────────────────────────────────────────────────

const COPY_ICON  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const CHECK_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

function makeCopyBtn(text: string, label: string): string {
  const t = THEMES[currentTheme];
  return `<button class="tt-copy-btn" data-copy="${escapeAttr(text)}" title="Copy ${label}"
    style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;margin-left:4px;border:none;border-radius:4px;cursor:pointer;background:transparent;color:${t.textHint};transition:background 0.15s,color 0.15s;flex-shrink:0;vertical-align:middle;"
    onmouseenter="this.style.background='${t.copyHover}';this.style.color='${t.textMain}'"
    onmouseleave="this.style.background='transparent';this.style.color='${t.textHint}'"
  >${COPY_ICON}</button>`;
}

async function copyText(text: string): Promise<void> {
  // Try the modern async API first
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch { /* fall through to execCommand */ }

  // Fallback: synchronous execCommand — always works within a click handler
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    if (!document.execCommand('copy')) throw new Error('execCommand failed');
  } finally {
    document.body.removeChild(ta);
  }
}

function wireCopyBtns(el: HTMLDivElement): void {
  const t = THEMES[currentTheme];
  el.querySelectorAll<HTMLButtonElement>('.tt-copy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await copyText(btn.dataset['copy'] ?? '');
        btn.innerHTML = CHECK_ICON;
        btn.style.color = '#4ade80';
        setTimeout(() => { btn.innerHTML = COPY_ICON; btn.style.color = t.textHint; }, 1200);
      } catch {
        btn.style.color = '#f87171';
        setTimeout(() => { btn.style.color = t.textHint; }, 1200);
      }
    });
  });
}

function wireExplainBtn(el: HTMLDivElement, onExplain: () => Promise<string>): void {
  const t = THEMES[currentTheme];
  const btn = el.querySelector<HTMLButtonElement>('.tt-explain-btn');
  const resultEl = el.querySelector<HTMLDivElement>('.tt-explain-result');
  if (!btn || !resultEl) return;

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    btn.disabled = true;
    btn.textContent = '…';
    resultEl.style.display = 'block';
    resultEl.style.color = t.textHint;
    resultEl.textContent = 'Thinking…';
    try {
      const explanation = await onExplain();
      resultEl.style.color = t.textMain;
      resultEl.textContent = explanation;
      btn.style.display = 'none';
    } catch {
      resultEl.style.color = t.textHint;
      resultEl.textContent = 'Chrome AI unavailable on this device.';
      btn.textContent = '✦ Explain';
      btn.disabled = false;
    }
  });
}

// ── Grammar rendering ─────────────────────────────────────────────────────────

// Renders the original tagged tokens directly with grammar underlines.
// Exact — colors come straight from the token's own POS, no positional mapping needed.
function renderOriginalWithGrammar(tokens: TaggedToken[], textColor: string): string {
  return tokens.map(token => {
    if (!token.isWord) return `<span style="color:${textColor};">${escapeHtml(token.text)}</span>`;
    const { color } = POS_COLORS[token.pos];
    if (color === POS_COLORS['Other'].color) return `<span style="color:${textColor};">${escapeHtml(token.text)}</span>`;
    return `<span style="color:${textColor};display:inline;border-bottom:2.5px solid ${color};padding-bottom:1px;">${escapeHtml(token.text)}</span>`;
  }).join('');
}

// Applies grammar underlines from the source analysis onto the translated text.
// Approximate — matches by word position since word count may differ across languages.
function renderTranslationWithGrammar(translated: string, tokens: TaggedToken[], textColor: string): string {
  const wordColors = tokens.filter(t => t.isWord).map(t => POS_COLORS[t.pos].color);
  const parts = translated.match(/(\w+)|([^\w]+)/g) ?? [translated];
  let wordIndex = 0;
  return parts.map(part => {
    if (/\w/.test(part)) {
      const color = wordColors[wordIndex++];
      return color
        ? `<span style="color:${textColor};display:inline;border-bottom:2.5px solid ${color};padding-bottom:1px;">${escapeHtml(part)}</span>`
        : `<span style="color:${textColor};">${escapeHtml(part)}</span>`;
    }
    return `<span style="color:${textColor};">${escapeHtml(part)}</span>`;
  }).join('');
}

function renderLegend(tokens: TaggedToken[], t: typeof THEMES[Theme], position: GrammarPosition): string {
  const seen = new Set(tokens.filter(tk => tk.isWord).map(tk => tk.pos));
  const items = [...seen].map(pos => {
    const { color, label } = POS_COLORS[pos];
    return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9.5px;color:${t.textHint};">` +
      `<span style="width:8px;height:8px;border-radius:2px;background:${color};flex-shrink:0;display:inline-block;"></span>` +
      `${label}</span>`;
  }).join('');

  const flex = position === 'side' ? 'flex-direction:column;' : 'flex-wrap:wrap;';
  return `<div style="display:flex;${flex}gap:6px;">${items}</div>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface TooltipOptions {
  pos?: string;
  grammarTokens?: TaggedToken[];
  grammarPosition?: GrammarPosition;
  originalText?: string;
  engine?: string;
  onExplain?: () => Promise<string>;
  showBothTexts?: boolean;
}

export function showLoading(x: number, y: number): void {
  const el = ensureTooltip();
  if (isPinned || isHovered) return;
  const t = THEMES[currentTheme];
  el.innerHTML = `<div class="tt-loading-dots" style="color:${t.textHint};"><span></span><span></span><span></span></div>`;
  positionAndShow(el, x, y);
}

export function showTooltip(
  translated: string,
  sourceLang: string,
  targetLang: string,
  x: number,
  y: number,
  options: TooltipOptions = {},
): void {
  const el = ensureTooltip();
  if (isPinned || isHovered) return;
  const t = THEMES[currentTheme];
  const fs = currentStyle.fontSize;

  const srcUp = sourceLang.toUpperCase();
  const tgtUp = targetLang.toUpperCase();

  // Copy buttons copy the actual text (original → source, translated → target)
  const srcCopyText = options.originalText ?? srcUp;
  const tgtCopyText = translated;

  const engineBadge = options.engine
    ? `<span style="margin-left:auto;font-size:9px;letter-spacing:0.07em;text-transform:uppercase;opacity:0.38;font-family:monospace;">${escapeHtml(options.engine)}</span>`
    : '';

  const header = `
    <div style="color:${t.textHint};font-size:${Math.max(10, fs - 2)}px;margin-bottom:5px;display:flex;align-items:center;gap:4px;">
      ${makeCopyBtn(srcCopyText, 'original text')}<span>${srcUp}</span>
      <span style="opacity:0.4;">→</span>
      ${makeCopyBtn(tgtCopyText, 'translation')}<span>${tgtUp}</span>
      ${engineBadge}
    </div>`;

  // ── PoS badge (word mode) ─────────────────────────────
  const posBadge = options.pos
    ? `<span style="font-size:9px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;opacity:0.55;margin-left:6px;vertical-align:middle;">${options.pos}</span>`
    : '';

  // ── Explain button (word mode, Chrome Prompt API) ─────
  const explainSection = options.onExplain
    ? `<div style="margin-top:6px;">
        <button class="tt-explain-btn" style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border:1px solid rgba(99,179,237,0.4);border-radius:4px;background:transparent;color:${t.textHint};font-size:10px;cursor:pointer;line-height:1.5;" onmouseenter="this.style.opacity='0.8'" onmouseleave="this.style.opacity='1'">✦ Explain</button>
        <div class="tt-explain-result" style="display:none;margin-top:5px;font-size:11px;line-height:1.5;"></div>
      </div>`
    : '';

  // ── Grammar overlay (sentence mode) ──────────────────
  const grammar = !!options.grammarTokens;
  const gramPos = options.grammarPosition ?? 'bottom';

  const translatedContent = grammar
    ? renderTranslationWithGrammar(translated, options.grammarTokens!, t.textMain)
    : `${escapeHtml(translated)}`;
  const legend = grammar
    ? renderLegend(options.grammarTokens!, t, gramPos)
    : '';

  // ── Assemble layout ───────────────────────────────────
  let body: string;

  // ── "Show both texts" original text strip ────────────
  // When grammar tokens are available, colour the original directly from its own
  // token POS tags (exact match). Otherwise fall back to plain hint-coloured text.
  const bothStrip = options.showBothTexts && options.originalText
    ? `<div style="font-size:${Math.max(10, fs - 2)}px;margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid ${t.divider};line-height:${grammar ? '1.8' : '1.4'};">
        ${grammar
          ? renderOriginalWithGrammar(options.grammarTokens!, t.textHint)
          : `<span style="color:${t.textHint};font-style:italic;">${escapeHtml(options.originalText)}</span>`
        }
      </div>`
    : '';

  if (grammar && gramPos === 'side') {
    body = `
      ${bothStrip}
      <div style="display:flex;gap:10px;align-items:flex-start;">
        <div style="flex:1;">
          <div style="color:${t.textMain};font-weight:600;line-height:1.8;">${translatedContent}${posBadge}</div>
        </div>
        <div style="padding-top:2px;flex-shrink:0;">${legend}</div>
      </div>
      ${explainSection}`;
  } else {
    body = `
      ${bothStrip}
      ${grammar && gramPos === 'top' ? `<div style="margin-bottom:6px;">${legend}</div>` : ''}
      <div style="color:${t.textMain};font-weight:600;line-height:${grammar ? '1.8' : '1.5'};">
        ${translatedContent}${posBadge}
      </div>
      ${grammar && gramPos === 'bottom' ? `<div style="margin-top:6px;">${legend}</div>` : ''}
      ${explainSection}`;
  }

  el.innerHTML = header + body;
  wireCopyBtns(el);
  if (options.onExplain) wireExplainBtn(el, options.onExplain);
  positionAndShow(el, x, y);
}

export function showError(message: string, x: number, y: number): void {
  const el = ensureTooltip();
  if (isPinned) return;
  const t = THEMES[currentTheme];
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;">
      <span style="color:${t.errorColor};font-size:13px;">⚠</span>
      <span style="color:${t.textHint};font-size:11.5px;">${escapeHtml(message)}</span>
    </div>`;
  positionAndShow(el, x, y);
}

export function scheduleTooltipHide(): void {
  if (isPinned || isHovered) return;
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { hideTooltip(true); hideTimer = null; }, currentStyle.hideDelay);
}

export function hideTooltip(force = false): void {
  if ((isPinned || isHovered) && !force) return;
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  isPinned  = false;
  isHovered = false;
  const el = document.getElementById(TOOLTIP_ID) as HTMLDivElement | null;
  if (!el) return;
  el.classList.remove('tt-visible');
  el.classList.add('tt-hiding');
  setTimeout(() => { el.style.display = 'none'; el.classList.remove('tt-hiding'); }, 160);
}

export function togglePin(): void {
  isPinned = !isPinned;
  const el = document.getElementById(TOOLTIP_ID) as HTMLDivElement | null;
  if (!el) return;
  if (!isPinned) hideTooltip(true);
  else applyBaseStyles(el);
}

// ── Positioning ───────────────────────────────────────────────────────────────

function positionAndShow(el: HTMLDivElement, x: number, y: number): void {
  const GAP = 14;
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

  el.style.display    = 'block';
  el.style.visibility = 'hidden';
  el.style.pointerEvents = 'none';
  applyBaseStyles(el);

  requestAnimationFrame(() => {
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x + GAP;
    let top  = y + GAP;
    if (left + rect.width  > vw - 8) left = x - rect.width  - GAP;
    if (top  + rect.height > vh - 8) top  = y - rect.height - GAP;
    el.style.left       = `${Math.max(8, left)}px`;
    el.style.top        = `${Math.max(8, top)}px`;
    el.style.visibility = 'visible';
    el.style.pointerEvents = 'auto';
    el.classList.remove('tt-hiding');
    void el.offsetWidth; // force reflow so CSS sees the initial state before transitioning
    el.classList.add('tt-visible');
  });
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
