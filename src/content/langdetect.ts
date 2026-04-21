/**
 * Multi-language text detector.
 * Returns an ISO 639-1 code or null (unknown / ambiguous).
 *
 * Priority (fastest first):
 *  1. Unicode script ranges   — non-Latin scripts, zero false-positives
 *  2. Distinctive characters  — ß→de, ñ→es, ã→pt, å→sv, ł/ą→pl
 *  3. Stop-word scoring       — Latin scripts: en/de/fr/es/it/pt/nl/sv/pl/fi
 *  4. Trigram fallback        — refines ambiguous en vs de for short text
 */

// ── 1. Unicode script detection ───────────────────────────────────────────────
// Each entry is checked in order; the first match wins.
// Hiragana/Katakana must precede CJK because Japanese text often mixes both.

const SCRIPT_MAP: Array<{ re: RegExp; lang: string }> = [
  { re: /[\u3040-\u309F\u30A0-\u30FF]/,         lang: 'ja'  }, // Hiragana / Katakana
  { re: /[\uAC00-\uD7AF\u1100-\u11FF]/,          lang: 'ko'  }, // Hangul
  { re: /[\u4E00-\u9FFF\u3400-\u4DBF]/,          lang: 'zh'  }, // CJK Ideographs
  { re: /[\u0600-\u06FF]/,                        lang: 'ar'  }, // Arabic
  { re: /[\u0400-\u04FF]/,                        lang: 'ru'  }, // Cyrillic (representative)
  { re: /[\u0370-\u03FF]/,                        lang: 'el'  }, // Greek
  { re: /[\u05D0-\u05EA]/,                        lang: 'he'  }, // Hebrew
  { re: /[\u0E00-\u0E7F]/,                        lang: 'th'  }, // Thai
  { re: /[\u0900-\u097F]/,                        lang: 'hi'  }, // Devanagari
  { re: /[\u0980-\u09FF]/,                        lang: 'bn'  }, // Bengali
  { re: /[\u0B80-\u0BFF]/,                        lang: 'ta'  }, // Tamil
  { re: /[\u0C00-\u0C7F]/,                        lang: 'te'  }, // Telugu
  { re: /[\u0C80-\u0CFF]/,                        lang: 'kn'  }, // Kannada
  { re: /[\u0A80-\u0AFF]/,                        lang: 'gu'  }, // Gujarati
];

// ── Script families ───────────────────────────────────────────────────────────
// Languages sharing a script system — detecting the representative covers all.

export const SCRIPT_FAMILY: Record<string, string[]> = {
  ru: ['ru', 'uk', 'bg', 'sr', 'mk', 'be', 'kk', 'tg', 'ky'],  // Cyrillic
  zh: ['zh', 'zh-TW'],                                            // CJK
  ar: ['ar', 'fa', 'ur', 'ps'],                                   // Arabic script
};

// ── 2. Distinctive single characters ─────────────────────────────────────────
// These chars appear almost exclusively in one language; one match is enough.

const CHAR_SIGNALS: Array<{ re: RegExp; lang: string }> = [
  { re: /[ß]/,                    lang: 'de' }, // German only
  { re: /[ñÑ]/,                   lang: 'es' }, // Spanish only
  { re: /[ãõÃÕ]/,                 lang: 'pt' }, // Portuguese only (ã/ão/õ)
  { re: /[åÅ]/,                   lang: 'sv' }, // Scandinavian (Swedish as representative)
  { re: /[łŁąęćśźżńĄĘĆŚŹŻŃ]/,    lang: 'pl' }, // Polish
  { re: /[œŒ]/,                   lang: 'fr' }, // French ligature (near-exclusive)
  { re: /[őŐűŰ]/,                 lang: 'hu' }, // Hungarian double-acute (unique to Hungarian)
  { re: /[ðÐþÞ]/,                 lang: 'is' }, // Icelandic eth/thorn
  { re: /[řŘ]/,                   lang: 'cs' }, // Czech ř (unique to Czech)
  { re: /[șțȘȚ]/,                 lang: 'ro' }, // Romanian comma-below s/t
  { re: /[ğĞışİ]/,                lang: 'tr' }, // Turkish dotless-i and ğ
];

// ── 3. Stop-word lists ────────────────────────────────────────────────────────
// Words chosen to be as exclusive to their language as possible.
// Ties are broken by score margin; ambiguous results return null.

const STOPWORDS: Record<string, string[]> = {
  en: [
    'the', 'this', 'that', 'these', 'those',
    'is', 'are', 'was', 'were', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'shall',
    'it', 'its', 'itself', 'he', 'she', 'they',
    'of', 'with', 'from', 'by', 'about', 'into',
    'and', 'but', 'or', 'not',
    'my', 'your', 'his', 'her', 'our', 'their',
    'you', 'we',
  ],
  de: [
    'der', 'den', 'dem', 'des', 'das',
    'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
    'und', 'oder', 'aber', 'nicht', 'kein', 'keine',
    'auch', 'noch', 'dann', 'wenn', 'dass', 'als', 'schon',
    'ist', 'sind', 'war', 'waren', 'wird', 'werden', 'wurde', 'wurden',
    'haben', 'hat', 'hatte', 'sein',
    'ich', 'wir', 'ihr',
    'auf', 'bei', 'mit', 'von', 'zum', 'zur', 'im', 'am',
  ],
  fr: [
    'les', 'des', 'avec', 'dans', 'sur', 'par', 'mais',
    'qui', 'dont', 'cette', 'ces', 'leur', 'leurs',
    'nous', 'vous', 'ils', 'elles', 'ont',
    'très', 'aussi', 'encore', 'toujours', 'jamais', 'bien', 'plus',
    'faire', 'être', 'avoir',
  ],
  es: [
    'los', 'las', 'del', 'pero', 'cuando', 'desde', 'hasta',
    'también', 'aunque', 'donde', 'muy', 'siempre', 'nunca',
    'hay', 'están', 'tiene', 'tienen',
    'ellos', 'ellas', 'nosotros', 'vosotros',
  ],
  it: [
    'gli', 'dello', 'della', 'degli', 'delle',
    'nel', 'nella', 'nei', 'nelle',
    'sono', 'tutto', 'tutti', 'però', 'anche', 'già',
    'poi', 'molto', 'poco', 'solo',
    'questo', 'questa', 'questi', 'queste',
  ],
  pt: [
    'do', 'da', 'dos', 'das', 'não', 'mas',
    'muito', 'também', 'isso', 'ter',
    'este', 'esta', 'estes', 'estas',
    'pelo', 'pela', 'pelos', 'pelas',
  ],
  nl: [
    'het', 'zijn', 'wordt', 'worden', 'hebben', 'heeft',
    'ook', 'maar', 'naar', 'voor', 'nog', 'toch',
    'geen', 'meer', 'door', 'bij', 'over',
    'was', 'waren', 'zich', 'uit', 'dan', 'heel',
  ],
  sv: [
    'och', 'att', 'det', 'som', 'för', 'med', 'sig',
    'när', 'ska', 'vara', 'hade', 'han', 'hon',
    'alla', 'inte', 'också', 'från',
  ],
  pl: [
    'jest', 'nie', 'się', 'jak', 'ale',
    'przez', 'przed', 'między', 'więc', 'czy',
    'też', 'już', 'tak', 'tego', 'tej',
    'które', 'który', 'która',
  ],
  fi: [
    'on', 'ei', 'se', 'ne', 'ovat', 'hän',
    'ole', 'kun', 'että', 'jos', 'niin',
    'myös', 'kuin', 'siis', 'sekä', 'vain',
    'tämä', 'kaikki',
  ],
};

// Pre-build sets once for O(1) lookup
const STOPWORD_SETS: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(STOPWORDS).map(([lang, words]) => [lang, new Set(words)]),
);

// ── 4. Trigrams (Latin-script disambiguation fallback) ────────────────────────
// Covers the most commonly confused pairs: EN/DE, FR/IT, ES/PT.

const LANG_TRIGRAMS: Record<string, string[]> = {
  de:  ['sch', 'ein', 'ich', 'die', 'der', 'und', 'cht', 'ung', 'ier', 'auf', 'ver', 'ent', 'ste', 'aus', 'nde', 'nen'],
  en:  ['the', 'ing', 'ion', 'tha', 'his', 'ith', 'whi', 'hou', 'ght', 'ould', 'tio'],
  fr:  ['les', 'des', 'que', 'ais', 'ons', 'ant', 'ent', 'eur', 'ous', 'tion', 'eau'],
  it:  ['che', 'del', 'nel', 'con', 'per', 'ell', 'are', 'ato', 'tta', 'gli', 'zione'],
};

function countTrigrams(text: string, grams: string[]): number {
  const lower = text.toLowerCase();
  return grams.reduce((n, g) => {
    let i = 0, count = 0;
    while ((i = lower.indexOf(g, i)) !== -1) { count++; i++; }
    return n + count;
  }, 0);
}

// ── Core detector ─────────────────────────────────────────────────────────────

/**
 * Detect the language of `text`.
 * Returns an ISO 639-1 code (e.g. 'en', 'de', 'fr', 'zh', 'ru' …) or null.
 *
 * Note: Cyrillic languages (uk, bg, sr …) all return 'ru' as representative.
 * Use `isDetectedMatch(detected, targetLang)` to check for script families.
 */
export function detectLang(text: string): string | null {
  if (!text || text.length < 2) return null;

  // 1. Unicode script
  for (const { re, lang } of SCRIPT_MAP) {
    if (re.test(text)) return lang;
  }

  // 2. Distinctive single characters
  for (const { re, lang } of CHAR_SIGNALS) {
    if (re.test(text)) return lang;
  }

  // 3. Stop-word scoring
  const words = text.toLowerCase().match(/\b[a-záàâäãåæçéèêëíìîïñóòôöõøúùûüýÿœłąęćśźżń]{2,}\b/g) ?? [];
  if (words.length > 0) {
    const scores: Record<string, number> = {};
    for (const word of words) {
      for (const lang of Object.keys(STOPWORD_SETS)) {
        if (STOPWORD_SETS[lang].has(word)) {
          scores[lang] = (scores[lang] ?? 0) + 1;
        }
      }
    }

    const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (entries.length > 0) {
      const [first, second] = entries;
      const hasSecond = second !== undefined;
      // Require a clear lead: 2+ matches and either alone OR ahead by 2+
      if (first[1] >= 2 && (!hasSecond || first[1] >= second[1] + 2)) {
        return first[0];
      }
      // Single unambiguous match — only trust it when there's enough context (3+ words)
      if (first[1] >= 1 && !hasSecond && words.length >= 3) return first[0];
    }
  }

  // 4. Trigram fallback — disambiguates ambiguous Latin-script text
  if (text.length >= 15) {
    const scores: Record<string, number> = {};
    for (const [lang, grams] of Object.entries(LANG_TRIGRAMS)) {
      const s = countTrigrams(text, grams);
      if (s > 0) scores[lang] = s;
    }
    const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (entries.length > 0) {
      const [best, second] = entries;
      if (!second || best[1] > second[1] * 1.25) return best[0];
    }
  }

  return null;
}

// ── Skip helper ───────────────────────────────────────────────────────────────

/**
 * Returns true if `detected` covers `targetLang`, accounting for script families.
 * e.g. detected='ru' covers targetLang='uk' (both Cyrillic).
 */
export function isDetectedMatch(detected: string, targetLang: string): boolean {
  if (detected === targetLang) return true;
  const family = SCRIPT_FAMILY[detected];
  return family !== undefined && family.includes(targetLang);
}
