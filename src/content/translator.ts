import type { TranslationResult, SourceMode, ApiConfig } from '../shared/types';

const TIMEOUT_MS = 5000;
const PROXY_TIMEOUT_MS = 7000;
const MYMEMORY_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours — MyMemory daily limit is per rolling window
const LINGVA_DEFAULT_URL = 'https://lingva.ml';

// Session cache: prevents redundant API calls for identical text + language pair
const cache = new Map<string, TranslationResult>();
let myMemoryRateLimitedUntil = 0;

// Restore persisted rate-limit across page navigations
chrome.storage.local.get('myMemoryRateLimit', (r) => {
  const stored = r['myMemoryRateLimit'] as number | undefined;
  if (stored && stored > Date.now()) myMemoryRateLimitedUntil = stored;
});

function makeCacheKey(text: string, src: string, tgt: string): string {
  return `${src}|${tgt}:${text.toLowerCase()}`;
}

function makeSignal(caller?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  return caller ? AbortSignal.any([caller, timeout]) : timeout;
}

function setMyMemoryCooldown(): void {
  myMemoryRateLimitedUntil = Date.now() + MYMEMORY_COOLDOWN_MS;
  chrome.storage.local.set({ myMemoryRateLimit: myMemoryRateLimitedUntil });
}

// ── Engine: Chrome Translator API (Gemini Nano, on-device, Chrome 138+) ──────

interface ChromeTranslatorInstance { translate(text: string): Promise<string>; destroy(): void; }
declare const Translator: {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>;
  create(opts: { sourceLanguage: string; targetLanguage: string }): Promise<ChromeTranslatorInstance>;
} | undefined;

// Cache translator instances by src|tgt key (creation is expensive)
const chromeTranslatorCache = new Map<string, Promise<ChromeTranslatorInstance>>();

async function tryChromeTranslator(
  text: string, _signal: AbortSignal, src: string, tgt: string,
): Promise<string> {
  if (typeof Translator === 'undefined' || src === 'auto') throw new Error('unavailable');
  const avail = await Translator.availability({ sourceLanguage: src, targetLanguage: tgt });
  if (avail === 'unavailable') throw new Error('unavailable');

  const cacheKey = `${src}|${tgt}`;
  let promise = chromeTranslatorCache.get(cacheKey);
  if (!promise) {
    promise = Translator.create({ sourceLanguage: src, targetLanguage: tgt });
    chromeTranslatorCache.set(cacheKey, promise);
  }
  const translator = await promise;

  const translated = (await translator.translate(text))?.trim();
  if (!translated) throw new Error('empty response');
  return translated;
}

// ── Engine: MyMemory ──────────────────────────────────────────────────────────

async function tryMyMemory(
  text: string, signal: AbortSignal, src: string, tgt: string, email?: string,
): Promise<string> {
  const langpair = src === 'auto' ? `autodetect|${tgt}` : `${src}|${tgt}`;
  let url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;
  // Adding a valid email bumps the free daily limit from ~5 k → 50 k chars/day
  if (email) url += `&de=${encodeURIComponent(email)}`;

  const res = await fetch(url, { signal });
  if (res.status === 429) {
    setMyMemoryCooldown();
    throw new Error('rate limit');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json() as {
    responseStatus: number;
    responseDetails: string;
    responseData?: { translatedText?: string };
  };

  if (data.responseStatus === 429) {
    setMyMemoryCooldown();
    throw new Error('rate limit');
  }
  if (data.responseStatus !== 200) throw new Error(data.responseDetails);

  const translated = data.responseData?.translatedText?.trim();
  if (!translated) throw new Error('empty response');
  return translated;
}

// ── Engine: Lingva Translate (Google Translate proxy, no key needed) ──────────

async function tryLingva(
  text: string, signal: AbortSignal, src: string, tgt: string, baseUrl?: string,
): Promise<string> {
  const base = (baseUrl?.trim() || LINGVA_DEFAULT_URL).replace(/\/$/, '');
  const srcCode = src === 'auto' ? 'auto' : src;
  const url = `${base}/api/v1/${encodeURIComponent(srcCode)}/${encodeURIComponent(tgt)}/${encodeURIComponent(text)}`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json() as { translation?: string; error?: string };
  if (data.error) throw new Error(data.error);

  const translated = data.translation?.trim();
  if (!translated) throw new Error('empty response');
  return translated;
}

// ── Background-proxied fetch (bypasses CORS for user-configured / external APIs) ─

interface ProxyResponse { ok: boolean; status: number; text: string; error?: string; }

function proxyFetch(url: string, options: RequestInit): Promise<ProxyResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('proxy timeout')), PROXY_TIMEOUT_MS);
    chrome.runtime.sendMessage(
      { type: 'PROXY_FETCH', url, options },
      (resp: ProxyResponse | undefined) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!resp) {
          reject(new Error('no response from service worker'));
        } else {
          resolve(resp);
        }
      },
    );
  });
}

// ── Engine: LibreTranslate ────────────────────────────────────────────────────

async function tryLibreTranslate(
  text: string, _signal: AbortSignal, src: string, tgt: string, baseUrl: string,
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/translate`;

  const res = await proxyFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: src, target: tgt, format: 'text' }),
  });
  if (res.error) throw new Error(res.error);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = JSON.parse(res.text) as { translatedText?: string; error?: string };
  if (data.error) throw new Error(data.error);

  const translated = data.translatedText?.trim();
  if (!translated) throw new Error('empty response');
  return translated;
}

// ── Engine: DeepL Free ────────────────────────────────────────────────────────

// DeepL source langs: no regional variants (EN, not EN-US)
const DEEPL_SRC: Record<string, string> = {
  'zh': 'ZH', 'zh-TW': 'ZH', 'pt': 'PT',
};
// DeepL target langs: regional variants accepted and preferred
const DEEPL_TGT: Record<string, string> = {
  'zh': 'ZH', 'zh-TW': 'ZH', 'pt': 'PT-BR', 'en': 'EN-US',
};
function toDeepLSrc(code: string): string { return DEEPL_SRC[code] ?? code.toUpperCase(); }
function toDeepLTgt(code: string): string { return DEEPL_TGT[code] ?? code.toUpperCase(); }

async function tryDeepL(
  text: string, _signal: AbortSignal, src: string, tgt: string, apiKey: string,
): Promise<string> {
  const body: Record<string, unknown> = { text: [text], target_lang: toDeepLTgt(tgt) };
  if (src !== 'auto') body['source_lang'] = toDeepLSrc(src);

  const res = await proxyFetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (res.error) throw new Error(res.error);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = JSON.parse(res.text) as {
    translations?: { text: string }[];
    message?: string;
  };

  const translated = data.translations?.[0]?.text?.trim();
  if (!translated) throw new Error(data.message ?? 'empty response');
  return translated;
}

// ── Public API ────────────────────────────────────────────────────────────────

async function runEngine(
  name: string,
  fn: () => Promise<string>,
  text: string,
  errors: string[],
): Promise<TranslationResult | null> {
  try {
    const translated = await fn();
    return { translated, engine: name };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    errors.push(`${name}: ${err instanceof Error ? err.message : 'failed'}`);
    return null;
  }
}

export async function translate(
  text: string,
  signal?: AbortSignal,
  sourceMode: SourceMode = 'fixed',
  sourceLanguage = 'en',
  targetLanguage = 'de',
  apiConfig?: ApiConfig,
): Promise<TranslationResult> {
  const src = sourceMode === 'auto' ? 'auto' : sourceLanguage;
  const key = makeCacheKey(text, src, targetLanguage);

  const cached = cache.get(key);
  if (cached) return cached;

  const combined = makeSignal(signal);
  const errors: string[] = [];
  const preferred = apiConfig?.preferredEngine ?? 'auto';

  // ── Single-engine mode ────────────────────────────────────────────────────
  if (preferred === 'chrome') {
    const r = await runEngine('Chrome', () => tryChromeTranslator(text, combined, src, targetLanguage), text, errors);
    if (r) { cache.set(key, r); return r; }
    throw new Error(errors.join(' · '));
  }

  if (preferred === 'mymemory') {
    if (Date.now() < myMemoryRateLimitedUntil) throw new Error('MyMemory: rate limited');
    const r = await runEngine('MyMemory', () => tryMyMemory(text, combined, src, targetLanguage, apiConfig?.myMemoryEmail), text, errors);
    if (r) { cache.set(key, r); return r; }
    throw new Error(errors.join(' · '));
  }

  if (preferred === 'lingva') {
    const r = await runEngine('Lingva', () => tryLingva(text, combined, src, targetLanguage, apiConfig?.lingvaUrl), text, errors);
    if (r) { cache.set(key, r); return r; }
    throw new Error(errors.join(' · '));
  }

  if (preferred === 'libretranslate') {
    if (!apiConfig?.libreTranslateUrl) throw new Error('LibreTranslate: no URL configured');
    const r = await runEngine('LibreTranslate', () => tryLibreTranslate(text, combined, src, targetLanguage, apiConfig.libreTranslateUrl), text, errors);
    if (r) { cache.set(key, r); return r; }
    throw new Error(errors.join(' · '));
  }

  if (preferred === 'deepl') {
    if (!apiConfig?.deeplApiKey) throw new Error('DeepL: no API key configured');
    const r = await runEngine('DeepL', () => tryDeepL(text, combined, src, targetLanguage, apiConfig.deeplApiKey), text, errors);
    if (r) { cache.set(key, r); return r; }
    throw new Error(errors.join(' · '));
  }

  // ── Auto: fallback chain (Chrome → MyMemory → Lingva → LibreTranslate → DeepL) ─
  {
    const r = await runEngine('Chrome', () => tryChromeTranslator(text, combined, src, targetLanguage), text, errors);
    if (r) { cache.set(key, r); return r; }
  }

  if (Date.now() >= myMemoryRateLimitedUntil) {
    const r = await runEngine('MyMemory', () => tryMyMemory(text, combined, src, targetLanguage, apiConfig?.myMemoryEmail), text, errors);
    if (r) { cache.set(key, r); return r; }
  } else {
    errors.push('MyMemory: rate limited');
  }

  {
    const r = await runEngine('Lingva', () => tryLingva(text, combined, src, targetLanguage, apiConfig?.lingvaUrl), text, errors);
    if (r) { cache.set(key, r); return r; }
  }

  if (apiConfig?.libreTranslateUrl) {
    const r = await runEngine('LibreTranslate', () => tryLibreTranslate(text, combined, src, targetLanguage, apiConfig.libreTranslateUrl), text, errors);
    if (r) { cache.set(key, r); return r; }
  }

  if (apiConfig?.deeplApiKey) {
    const r = await runEngine('DeepL', () => tryDeepL(text, combined, src, targetLanguage, apiConfig.deeplApiKey), text, errors);
    if (r) { cache.set(key, r); return r; }
  }

  throw new Error(errors.join(' · '));
}
