import type { TranslationMode } from '../shared/types';

// ── Word extraction ───────────────────────────────────────────────────────────

const WORD_CHAR = /[\w\u00C0-\u024F\u1E00-\u1EFF-]/;
// CJK Unified Ideographs + Extension A/B + Hiragana + Katakana + CJK Compatibility
const CJK_CHAR  = /[\u3040-\u30FF\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/;
// Max characters to extract from a CJK run (Japanese has no spaces; cap to a phrase-sized chunk)
const CJK_MAX   = 20;

function expandToWordBoundaries(text: string, offset: number): string {
  if (!text || offset < 0 || offset > text.length) return '';

  // CJK / Japanese: expand through adjacent CJK+kana characters, then cap
  const charAtCaret = text[offset] ?? text[offset - 1] ?? '';
  if (CJK_CHAR.test(charAtCaret)) {
    let start = offset;
    let end   = offset;
    while (start > 0 && CJK_CHAR.test(text[start - 1])) start--;
    while (end < text.length && CJK_CHAR.test(text[end])) end++;
    const run = text.slice(start, end);
    if (run.length <= CJK_MAX) return run;
    // Centre the window on the caret position
    const rel  = offset - start;
    const from = Math.max(0, rel - Math.floor(CJK_MAX / 2));
    return run.slice(from, from + CJK_MAX);
  }

  let start = offset;
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--;
  let end = offset;
  while (end < text.length && WORD_CHAR.test(text[end])) end++;
  return text.slice(start, end).replace(/-+$/, '');
}

export function extractWordAtPoint(
  x: number,
  y: number,
  target: EventTarget | null,
): string | null {
  // Active selection always wins
  const sel = window.getSelection();
  if (sel && sel.toString().trim().length > 1) return sel.toString().trim();

  // Skip SVG / icon contexts — no translatable words there
  if (target instanceof Element) {
    if (isSvgContext(target))      return null;
    if (isAriaHidden(target))      return null;
    if (isIconFont(target))        return null;
    if (isHiddenElement(target))   return null;
    if (isContentEditable(target)) return null;
  }

  const range = document.caretRangeFromPoint(x, y);
  if (range) {
    const node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE && node.textContent) {
      const word = expandToWordBoundaries(node.textContent, range.startOffset);
      if (word.length >= 2 && !/^[\d\s\W]+$/.test(word)) return word;
    }
  }

  // Fallback for shadow DOM / canvas etc.
  if (target instanceof Element) {
    const text = target.textContent ?? '';
    // CJK fallback: take the first CJK run, capped to CJK_MAX
    const cjk = text.match(/[\u3040-\u30FF\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]+/);
    if (cjk) return cjk[0].slice(0, CJK_MAX);
    const words = text.match(/[\w\u00C0-\u024F\u1E00-\u1EFF-]{2,}/g);
    return words?.[0] ?? null;
  }

  return null;
}

// ── Icon / image detection ────────────────────────────────────────────────────

/**
 * Returns true if the element is inside an SVG subtree (graphical, not text).
 */
function isSvgContext(el: Element): boolean {
  return el.namespaceURI === 'http://www.w3.org/2000/svg' || el.closest('svg') !== null;
}

/**
 * Returns true if the element is hidden from the accessibility tree — typical
 * for decorative icons (<i aria-hidden>, icon wrappers, etc.).
 */
function isAriaHidden(el: Element): boolean {
  return el.closest('[aria-hidden="true"]') !== null;
}

/**
 * Returns true if the computed font-family looks like an icon font.
 * Covers Font Awesome, Material Icons, Glyphicons, IcoMoon, Dashicons, etc.
 */
function isIconFont(el: Element): boolean {
  try {
    const font = window.getComputedStyle(el).fontFamily.toLowerCase();
    return /icon|awesome|glyphicon|linearicon|icomoon|themify|dashicons|fontello|material|remixicon|phosphor|bootstrap-icon|tabler|feather|heroicon|lucide/i.test(font);
  } catch {
    return false;
  }
}

/**
 * Returns true if the element is not visible to the user — covers HTML
 * attributes (hidden, inert), computed CSS, and zero-size elements that
 * caretRangeFromPoint can return in edge cases (off-screen containers, etc.).
 */
function isHiddenElement(el: Element): boolean {
  if (el.closest('[hidden]') !== null) return true;
  if (el.closest('[inert]')  !== null) return true;
  try {
    const style = window.getComputedStyle(el);
    if (style.display === 'none') return true;
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return true;
  } catch { return true; }
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return true;
  return false;
}

/**
 * Returns true if the element is inside a contenteditable region.
 * The user is typing — translation should not trigger.
 */
function isContentEditable(el: Element): boolean {
  return el.closest('[contenteditable="true"], [contenteditable=""]') !== null;
}

/**
 * Returns true if `text` has enough real letter characters to be worth
 * translating. Rejects strings that are mostly symbols, emoji, or icon glyphs.
 */
function hasTranslatableText(text: string): boolean {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  return letters >= 3 && letters / text.length >= 0.4;
}

// ── Element extraction (sentence mode) ───────────────────────────────────────

// Tags treated as inline — walk up past these to find a block container
const INLINE_TAGS = new Set([
  'A', 'ABBR', 'B', 'BDI', 'BDO', 'CITE', 'CODE', 'DATA', 'DFN', 'EM',
  'I', 'KBD', 'MARK', 'Q', 'RP', 'RT', 'RUBY', 'S', 'SAMP', 'SMALL',
  'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U', 'VAR', 'WBR',
]);

// Preferred semantic block tags — stop walking up as soon as we find one
const PREFER_TAGS = new Set([
  'P', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'FIGCAPTION', 'DT', 'DD', 'CAPTION',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
]);

// Never translate these — too broad or not text content
const SKIP_TAGS = new Set([
  'BODY', 'HTML', 'MAIN', 'ARTICLE', 'SECTION', 'ASIDE', 'NAV', 'HEADER', 'FOOTER',
  'FORM', 'UL', 'OL', 'TABLE', 'THEAD', 'TBODY', 'TR',
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE',
]);

const MAX_TEXT = 500;

/** True if el has any non-whitespace direct Text node children. */
function hasDirectTextChildren(el: Element): boolean {
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim().length > 0) return true;
  }
  return false;
}

/**
 * True if el's siblings include text nodes or inline elements with text.
 * Signals that el is an inline fragment inside a larger text run — walk up.
 */
function hasTextNodeSiblings(el: Element): boolean {
  const parent = el.parentElement;
  if (!parent) return false;
  for (const child of parent.childNodes) {
    if (child === el) continue;
    if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim().length > 0) return true;
    if (child.nodeType === Node.ELEMENT_NODE && INLINE_TAGS.has((child as Element).tagName) &&
        (child.textContent ?? '').trim().length > 0) return true;
  }
  return false;
}

/** True if el's computed display is block-level (not inline*, not none). */
function isBlockLevel(el: Element): boolean {
  try {
    const d = window.getComputedStyle(el).display;
    return d !== '' && d !== 'none' && !d.startsWith('inline') && d !== 'contents';
  } catch {
    return false;
  }
}

function selectBestElement(start: Element): Element | null {
  let node: Element | null = start;

  // Phase 1: walk up past inline fragments and sibling-embedded elements.
  // Covers: inline tag wrappers (A, SPAN, STRONG, …) and the case where the
  // hit element is one of several text-bearing siblings — user's sibling-awareness heuristic.
  while (node && !SKIP_TAGS.has(node.tagName)) {
    if (INLINE_TAGS.has(node.tagName)) { node = node.parentElement; continue; }
    if (hasTextNodeSiblings(node))      { node = node.parentElement; continue; }
    break;
  }

  if (!node || SKIP_TAGS.has(node.tagName)) return null;

  // Phase 2: walk up to find the best sentence container.
  let candidate: Element | null = null;
  let cur: Element | null = node;

  while (cur && !SKIP_TAGS.has(cur.tagName)) {
    const text = (cur.textContent ?? '').trim();
    if (text.length >= 3 && !isHiddenElement(cur)) {
      candidate = cur;
      // Preferred semantic tag: always stop here.
      if (PREFER_TAGS.has(cur.tagName)) break;
      // Block-level element that directly owns text: this is the content node, not a wrapper.
      if (isBlockLevel(cur) && hasDirectTextChildren(cur)) break;
      // Text fits in one natural unit: stop.
      if (text.length <= MAX_TEXT) break;
    }
    cur = cur.parentElement;
  }

  return candidate;
}

/**
 * Collects visible text from el's subtree, skipping any descendants that are
 * hidden (hidden/inert attributes, aria-hidden, display:none, visibility:hidden).
 * Stops at MAX_TEXT chars to avoid scanning large hidden subtrees such as
 * mobile drawers or collapsed accordion panels.
 */
function getVisibleText(el: Element): string {
  const parts: string[] = [];
  let total = 0;

  function walk(node: Node): void {
    if (total >= MAX_TEXT) return;
    if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as Element;
      const tag = elem.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') return;
      if (elem.hasAttribute('hidden') || elem.hasAttribute('inert')) return;
      if (elem.getAttribute('aria-hidden') === 'true') return;
      try {
        const style = window.getComputedStyle(elem);
        if (style.display === 'none') return;
        if (style.visibility === 'hidden' || style.visibility === 'collapse') return;
      } catch { return; }
      for (const child of elem.childNodes) walk(child);
    } else if (node.nodeType === Node.TEXT_NODE) {
      const chunk = node.textContent ?? '';
      if (chunk.trim().length === 0) return;
      const remaining = MAX_TEXT - total;
      parts.push(chunk.slice(0, remaining));
      total += Math.min(chunk.length, remaining);
    }
  }

  walk(el);
  return parts.join('').trim();
}

export function extractElementAtPoint(x: number, y: number): { el: Element; text: string } | null {
  // Active selection wins regardless of mode
  const sel = window.getSelection();
  if (sel && sel.toString().trim().length > 1) {
    const range = sel.getRangeAt(0);
    const el = range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    if (el) return { el, text: sel.toString().trim() };
  }

  // Prefer caretRangeFromPoint: it locates the exact text node under the cursor,
  // so we start from the deepest meaningful element instead of a potential wrapper.
  let hit: Element | null = null;
  const caret = document.caretRangeFromPoint(x, y);
  if (caret?.startContainer.nodeType === Node.TEXT_NODE) {
    hit = caret.startContainer.parentElement;
  }
  hit ??= document.elementFromPoint(x, y);
  if (!hit) return null;

  // Bail out early on non-text hit targets
  if (isSvgContext(hit))      return null;
  if (isAriaHidden(hit))      return null;
  if (isIconFont(hit))        return null;
  if (isHiddenElement(hit))   return null;
  if (isContentEditable(hit)) return null;

  const best = selectBestElement(hit);
  if (!best) return null;

  const text = getVisibleText(best);
  if (!hasTranslatableText(text)) return null;

  return { el: best, text };
}

// ── Unified entry point ───────────────────────────────────────────────────────

export function extractAtPoint(
  x: number,
  y: number,
  target: EventTarget | null,
  mode: TranslationMode,
): string | null {
  if (mode === 'sentence') return extractElementAtPoint(x, y)?.text ?? null;
  return extractWordAtPoint(x, y, target);
}
