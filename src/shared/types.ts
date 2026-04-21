export type Theme = 'dark' | 'light';
export type TranslationMode = 'word' | 'sentence';
export type DefaultBehavior = 'on' | 'language' | 'off';
export type SourceMode = 'auto' | 'fixed';

export interface ShortcutConfig {
  triggerModifier: string;
  pinKey: string;
  dismissKey: string;
}

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  triggerModifier: 'Alt',
  pinKey: 'p',
  dismissKey: 'Escape',
};

export interface TooltipStyle {
  fontSize: number;
  maxWidth: number;
  fontFamily: string;
  hideDelay: number;    // ms before hiding tooltip after mouse leaves
  borderRadius: number; // corner radius in px (4–20)
  blur: number;         // backdrop-filter blur in px (0–24)
  compact: boolean;     // reduced padding
}

export const DEFAULT_TOOLTIP_STYLE: TooltipStyle = {
  fontSize: 13,
  maxWidth: 300,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  hideDelay: 300,
  borderRadius: 10,
  blur: 14,
  compact: false,
};

export interface TranslationResult {
  translated: string;
  engine?: string;
}

export type GrammarPosition = 'top' | 'bottom' | 'side';

export type PreferredEngine = 'auto' | 'chrome' | 'mymemory' | 'lingva' | 'libretranslate' | 'deepl';

export interface ApiConfig {
  preferredEngine: PreferredEngine;
  myMemoryEmail: string;   // bumps free limit from 5 k → 50 k chars/day
  lingvaUrl: string;       // custom Lingva instance (default: https://lingva.ml)
  libreTranslateUrl: string;
  deeplApiKey: string;
}

export const DEFAULT_API_CONFIG: ApiConfig = {
  preferredEngine: 'auto',
  myMemoryEmail: '',
  lingvaUrl: '',
  libreTranslateUrl: '',
  deeplApiKey: '',
};

// MyMemory supported languages (70+)
export const LANGUAGES: [string, string][] = [
  ['af', 'Afrikaans'], ['sq', 'Albanian'], ['ar', 'Arabic'], ['hy', 'Armenian'],
  ['az', 'Azerbaijani'], ['eu', 'Basque'], ['be', 'Belarusian'], ['bn', 'Bengali'],
  ['bs', 'Bosnian'], ['bg', 'Bulgarian'], ['ca', 'Catalan'], ['zh', 'Chinese (Simplified)'],
  ['zh-TW', 'Chinese (Traditional)'], ['hr', 'Croatian'], ['cs', 'Czech'],
  ['da', 'Danish'], ['nl', 'Dutch'], ['en', 'English'], ['eo', 'Esperanto'],
  ['et', 'Estonian'], ['tl', 'Filipino'], ['fi', 'Finnish'], ['fr', 'French'],
  ['gl', 'Galician'], ['ka', 'Georgian'], ['de', 'German'], ['el', 'Greek'],
  ['gu', 'Gujarati'], ['ht', 'Haitian Creole'], ['he', 'Hebrew'], ['hi', 'Hindi'],
  ['hu', 'Hungarian'], ['is', 'Icelandic'], ['id', 'Indonesian'], ['ga', 'Irish'],
  ['it', 'Italian'], ['ja', 'Japanese'], ['kn', 'Kannada'], ['kk', 'Kazakh'],
  ['ko', 'Korean'], ['lv', 'Latvian'], ['lt', 'Lithuanian'], ['mk', 'Macedonian'],
  ['ms', 'Malay'], ['mt', 'Maltese'], ['no', 'Norwegian'], ['fa', 'Persian'],
  ['pl', 'Polish'], ['pt', 'Portuguese'], ['ro', 'Romanian'], ['ru', 'Russian'],
  ['sr', 'Serbian'], ['sk', 'Slovak'], ['sl', 'Slovenian'], ['es', 'Spanish'],
  ['sw', 'Swahili'], ['sv', 'Swedish'], ['ta', 'Tamil'], ['te', 'Telugu'],
  ['th', 'Thai'], ['tr', 'Turkish'], ['uk', 'Ukrainian'], ['ur', 'Urdu'],
  ['uz', 'Uzbek'], ['vi', 'Vietnamese'], ['cy', 'Welsh'], ['yi', 'Yiddish'],
];

export interface StorageSchema {
  theme: Theme;
  shortcuts: ShortcutConfig;
  translationMode: TranslationMode;
  tooltipStyle: TooltipStyle;
  // Activation rules
  defaultBehavior: DefaultBehavior;
  siteOverrides: Record<string, boolean>;
  // Translation languages
  sourceMode: SourceMode;      // 'auto' = autodetect, 'fixed' = use sourceLanguage
  sourceLanguage: string;      // language code for fixed mode (e.g., 'de', 'fr', 'es')
  targetLanguage: string;      // always fixed (e.g., 'en')
  // Feature flags
  selectionEnabled: boolean;   // translate selected text on mouseup
  smartSkip: boolean;          // skip text already in the target language
  knownLanguages: string[];    // additional languages to skip (beyond target)
  twoWay: boolean;             // auto-flip direction based on detected language
  showBothTexts: boolean;      // show original text alongside translation in tooltip
  skipFormFields: boolean;     // skip translation inside <input>, <textarea>, <select>
  // Grammar view
  grammarMode: boolean;        // show grammar overlay on sentence hover
  grammarPosition: GrammarPosition;
  // API config
  apiConfig: ApiConfig;
}
