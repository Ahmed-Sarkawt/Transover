// Lightweight rule-based PoS tagger supporting English, German, Spanish, and French.
// Closed-class word lookup + suffix heuristics + language-specific morphological rules.

// ── German: separable verb prefixes ──────────────────────────────────────────
// Always-separable: stress falls on prefix, prefix detaches in main clauses.
const DE_SEPARABLE_PREFIXES = new Set([
  'ab', 'an', 'auf', 'aus', 'bei', 'ein', 'fort', 'her', 'hin',
  'los', 'mit', 'nach', 'vor', 'weg', 'zu', 'zurück',
]);

// ── Spanish: pronominal clitics that attach to infinitives and gerunds ────────
// Ordered longest-first so that compound clitics (melo) are checked before singles.
const ES_CLITICS = [
  'melo', 'telo', 'sela', 'noslo', 'oslo',
  'me', 'te', 'se', 'lo', 'la', 'le', 'los', 'las', 'les', 'nos', 'os',
];

export type PosTag =
  | 'Verb' | 'Noun' | 'Adjective' | 'Adverb'
  | 'Preposition' | 'Pronoun' | 'Conjunction' | 'Determiner'
  | 'Other';

export interface TaggedToken {
  text: string;
  pos: PosTag;
  isWord: boolean;
}

export const POS_COLORS: Record<PosTag, { color: string; label: string }> = {
  Verb:        { color: '#3b82f6', label: 'Verb' },
  Noun:        { color: '#22c55e', label: 'Noun' },
  Adjective:   { color: '#f59e0b', label: 'Adj' },
  Adverb:      { color: '#a855f7', label: 'Adv' },
  Preposition: { color: '#94a3b8', label: 'Prep' },
  Pronoun:     { color: '#ec4899', label: 'Pron' },
  Conjunction: { color: '#64748b', label: 'Conj' },
  Determiner:  { color: '#6b7280', label: 'Det' },
  Other:       { color: '#475569', label: 'Other' },
};

// ── Rule set type ─────────────────────────────────────────────────────────────

interface LangRules {
  det:  Set<string>;
  pron: Set<string>;
  prep: Set<string>;
  conj: Set<string>;
  aux:  Set<string>;
  advSfx:  string[];
  adjSfx:  string[];
  nounSfx: string[];
  verbSfx: string[];
}

// ── English ───────────────────────────────────────────────────────────────────

const EN: LangRules = {
  det: new Set([
    'the', 'a', 'an', 'this', 'that', 'these', 'those',
    'my', 'your', 'his', 'her', 'its', 'our', 'their',
    'each', 'every', 'some', 'any', 'no', 'all', 'both',
    'few', 'many', 'much', 'more', 'most', 'other', 'another',
    'what', 'which', 'whose', 'enough', 'either', 'neither',
  ]),
  pron: new Set([
    'i', 'me', 'my', 'myself', 'mine',
    'we', 'us', 'our', 'ourselves', 'ours',
    'you', 'your', 'yourself', 'yourselves', 'yours',
    'he', 'him', 'his', 'himself',
    'she', 'her', 'hers', 'herself',
    'it', 'its', 'itself',
    'they', 'them', 'their', 'theirs', 'themselves',
    'who', 'whom', 'whoever', 'whomever',
    'one', 'ones', 'oneself', 'someone', 'anyone', 'everyone',
    'nobody', 'somebody', 'anybody', 'everybody',
    'nothing', 'something', 'anything', 'everything',
    'this', 'that', 'these', 'those',
  ]),
  prep: new Set([
    'in', 'on', 'at', 'by', 'for', 'with', 'about', 'against',
    'between', 'through', 'during', 'before', 'after', 'above',
    'below', 'to', 'from', 'up', 'down', 'into', 'out', 'off',
    'over', 'under', 'of', 'as', 'per', 'past', 'near', 'behind',
    'beside', 'beyond', 'within', 'without', 'along', 'around',
    'across', 'among', 'upon', 'onto', 'inside', 'outside', 'via',
    'towards', 'toward', 'until', 'till', 'since', 'despite',
    'except', 'instead', 'alongside', 'throughout',
  ]),
  conj: new Set([
    'and', 'but', 'or', 'nor', 'yet', 'so', 'for',
    'although', 'because', 'since', 'unless', 'until',
    'while', 'when', 'where', 'whether', 'that', 'than',
    'if', 'though', 'even', 'however', 'whereas', 'after',
    'before', 'once', 'whenever', 'wherever', 'as', 'both',
    'either', 'neither', 'not', 'also', 'furthermore', 'moreover',
    'therefore', 'thus', 'hence', 'consequently',
  ]),
  aux: new Set([
    'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'having',
    'do', 'does', 'did',
    'will', 'would', 'shall', 'should',
    'may', 'might', 'must', 'can', 'could',
    'need', 'dare', 'ought', 'used',
    'get', 'got', 'gotten',
  ]),
  advSfx:  ['ly'],
  adjSfx:  ['ous', 'ful', 'ive', 'able', 'ible', 'ical', 'ish', 'less', 'ary', 'ory', 'ic', 'al', 'ent', 'ant'],
  nounSfx: ['tion', 'sion', 'ness', 'ment', 'ity', 'ism', 'ist', 'ure', 'age', 'ance', 'ence', 'hood', 'ship', 'dom', 'er', 'or', 'ar'],
  verbSfx: ['ize', 'ise', 'ify', 'ate', 'ing', 'ed', 'en'],
};

// ── German ────────────────────────────────────────────────────────────────────
// Key heuristic: mid-sentence capitalised words are nouns (handled in analyzeGrammar).

const DE: LangRules = {
  det: new Set([
    'der', 'die', 'das', 'dem', 'den', 'des',
    'ein', 'eine', 'einem', 'einer', 'einen', 'eines',
    'kein', 'keine', 'keinem', 'keiner', 'keinen', 'keines',
    'mein', 'meine', 'meinem', 'meiner', 'meinen', 'meines',
    'dein', 'deine', 'deinem', 'deiner', 'deinen', 'deines',
    'sein', 'seine', 'seinem', 'seiner', 'seinen', 'seines',
    'ihr', 'ihre', 'ihrem', 'ihrer', 'ihren', 'ihres',
    'unser', 'unsere', 'unserem', 'unserer', 'unseren', 'unseres',
    'euer', 'eure', 'eurem', 'eurer', 'euren', 'eures',
    'dieser', 'diese', 'dieses', 'diesem', 'diesen',
    'jeder', 'jede', 'jedes', 'jedem', 'jeden',
    'aller', 'alle', 'alles', 'allem', 'allen',
    'welcher', 'welche', 'welches', 'welchem', 'welchen',
    'mancher', 'manche', 'manches', 'manchem', 'manchen',
    'solcher', 'solche', 'solches', 'solchem', 'solchen',
    'beide', 'beiden', 'jener', 'jene', 'jenes', 'jenem', 'jenen',
  ]),
  pron: new Set([
    'ich', 'mich', 'mir', 'du', 'dich', 'dir',
    'er', 'ihn', 'ihm', 'sie', 'es', 'wir', 'uns',
    'euch', 'ihnen', 'man', 'sich',
    'wer', 'wen', 'wem', 'wessen', 'was',
    'jemand', 'jemanden', 'jemandem', 'niemand', 'niemanden', 'niemandem',
    'etwas', 'nichts',
  ]),
  prep: new Set([
    'in', 'an', 'auf', 'über', 'unter', 'vor', 'hinter', 'neben',
    'zwischen', 'durch', 'für', 'ohne', 'gegen', 'mit', 'nach',
    'von', 'bei', 'zu', 'aus', 'um', 'ab', 'bis', 'seit',
    'während', 'wegen', 'trotz', 'statt', 'anstatt', 'außer',
    'entlang', 'gegenüber', 'dank', 'laut', 'gemäß', 'infolge',
  ]),
  conj: new Set([
    'und', 'oder', 'aber', 'denn', 'sondern', 'doch',
    'weil', 'da', 'obwohl', 'obgleich', 'dass', 'wenn',
    'als', 'ob', 'während', 'bevor', 'nachdem', 'damit',
    'sodass', 'indem', 'seitdem', 'sobald', 'sofern',
    'falls', 'solange', 'jedoch', 'allerdings', 'dennoch',
    'trotzdem', 'daher', 'deshalb', 'deswegen', 'folglich',
    'außerdem', 'zudem', 'sowohl', 'entweder', 'weder', 'zwar',
    'nicht', 'noch', 'also', 'nämlich',
  ]),
  aux: new Set([
    'sein', 'ist', 'war', 'bin', 'bist', 'sind', 'seid', 'waren',
    'wäre', 'wären', 'gewesen',
    'haben', 'hat', 'hatte', 'habe', 'hast', 'hatten', 'hätte', 'hätten', 'gehabt',
    'werden', 'wird', 'wurde', 'worden', 'werde', 'wirst', 'würde', 'würden',
    'können', 'kann', 'konnte', 'konnten', 'könnte', 'könnten',
    'müssen', 'muss', 'musste', 'mussten', 'müsste', 'müssten',
    'sollen', 'soll', 'sollte', 'sollten',
    'wollen', 'will', 'wollte', 'wollten',
    'dürfen', 'darf', 'durfte', 'durften', 'dürfte', 'dürften',
    'mögen', 'mag', 'mochte', 'möchte', 'möchten',
  ]),
  advSfx:  ['weise', 'erweise', 'wärts', 'mals'],
  adjSfx:  ['lich', 'isch', 'ig', 'haft', 'sam', 'bar', 'los', 'voll', 'reich', 'frei', 'würdig', 'fähig', 'wert', 'arm'],
  nounSfx: ['ung', 'heit', 'keit', 'schaft', 'tum', 'nis', 'ling', 'chen', 'lein', 'ismus', 'ist'],
  // Base infinitive/gerund suffixes + -ieren conjugations (iert/ierte/ierten/ierst)
  // Longer suffixes first so they shadow shorter ones
  verbSfx: ['ieren', 'isieren', 'ifizieren', 'eln', 'ern', 'ierten', 'ierte', 'ierst', 'iert', 'end'],
};

// ── Spanish ───────────────────────────────────────────────────────────────────

const ES: LangRules = {
  det: new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
    'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas',
    'aquel', 'aquella', 'aquellos', 'aquellas',
    'mi', 'mis', 'tu', 'tus', 'su', 'sus',
    'nuestro', 'nuestra', 'nuestros', 'nuestras',
    'vuestro', 'vuestra', 'vuestros', 'vuestras',
    'algún', 'alguna', 'algunos', 'algunas',
    'ningún', 'ninguna', 'todo', 'toda', 'todos', 'todas',
    'otro', 'otra', 'otros', 'otras',
    'mucho', 'mucha', 'muchos', 'muchas',
    'poco', 'poca', 'pocos', 'pocas',
    'varios', 'varias', 'cierto', 'cierta', 'ciertos', 'ciertas',
    'tanto', 'tanta', 'tantos', 'tantas',
  ]),
  pron: new Set([
    'yo', 'tú', 'él', 'ella', 'nosotros', 'nosotras',
    'vosotros', 'vosotras', 'ellos', 'ellas', 'usted', 'ustedes',
    'me', 'te', 'se', 'le', 'lo', 'la', 'nos', 'os', 'les',
    'mí', 'ti', 'sí', 'consigo',
    'quién', 'quiénes', 'qué', 'cuál', 'cuáles', 'cuyo', 'cuya', 'cuyos', 'cuyas',
    'alguien', 'nadie', 'algo', 'nada', 'uno', 'una',
  ]),
  prep: new Set([
    'en', 'de', 'a', 'con', 'por', 'para', 'sin', 'sobre',
    'bajo', 'entre', 'desde', 'hasta', 'según', 'hacia',
    'ante', 'tras', 'durante', 'mediante', 'contra',
    'excepto', 'salvo', 'incluso', 'junto', 'acerca', 'dentro',
    'fuera', 'encima', 'debajo', 'delante', 'detrás',
  ]),
  conj: new Set([
    'y', 'e', 'o', 'u', 'ni', 'pero', 'sino', 'mas', 'que',
    'porque', 'aunque', 'como', 'cuando', 'si', 'mientras',
    'donde', 'pues', 'luego', 'ya', 'además', 'también',
    'puesto', 'dado', 'jamás', 'nunca', 'tampoco',
    'no', 'ni', 'sí',
  ]),
  aux: new Set([
    'ser', 'estar', 'haber', 'tener', 'ir',
    'es', 'está', 'son', 'están', 'era', 'eran', 'estaba', 'estaban',
    'fue', 'fueron', 'sea', 'sean', 'esté', 'estén', 'fuera', 'fuese',
    'ha', 'han', 'había', 'habían', 'haya', 'hayan', 'hubiera', 'hubiese',
    'he', 'has', 'hemos', 'habéis',
    'tengo', 'tiene', 'tienen', 'tenemos', 'tenía', 'tenían',
    'siendo', 'estado', 'sido', 'hay', 'hubo', 'voy', 'va', 'van',
  ]),
  advSfx:  ['mente'],                                                 // super reliable
  adjSfx:  ['oso', 'osa', 'ible', 'able', 'orio', 'oria', 'ivo', 'iva', 'ico', 'ica', 'esco', 'esca',
             'ante', 'iente'],                                        // present-participle adjectives
  nounSfx: ['ción', 'sión', 'dad', 'tad', 'eza', 'ura', 'ismo', 'ista', 'miento', 'aje', 'anza',
             'encia', 'ancia', 'ería',
             'illo', 'illa', 'ito', 'ita'],                          // diminutives
  // Longer/more specific first; includes preterite, imperfect, nosotros, subjunctive forms
  verbSfx: ['ando', 'iendo', 'aron', 'ieron', 'aban', 'amos', 'ase', 'ado', 'ido'],
};

// ── French ───────────────────────────────────────────────────────────────────

const FR: LangRules = {
  det: new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'au', 'aux',
    'ce', 'cet', 'cette', 'ces',
    'mon', 'ton', 'son', 'ma', 'ta', 'sa',
    'mes', 'tes', 'ses', 'notre', 'votre', 'leur', 'nos', 'vos', 'leurs',
    'quel', 'quelle', 'quels', 'quelles',
    'tout', 'toute', 'tous', 'toutes',
    'chaque', 'autre', 'autres', 'même', 'mêmes',
  ]),
  pron: new Set([
    'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles',
    'me', 'te', 'se', 'lui', 'leur', 'y', 'en', 'on',
    'moi', 'toi', 'soi',
    'qui', 'que', 'quoi', 'dont', 'où',
    'celui', 'celle', 'ceux', 'celles', 'ceci', 'cela', 'ça',
    'personne', 'rien', 'quelqu', 'quelque',
  ]),
  prep: new Set([
    'à', 'de', 'en', 'dans', 'par', 'pour', 'sur', 'sous',
    'avec', 'sans', 'entre', 'vers', 'chez', 'après', 'avant',
    'contre', 'depuis', 'pendant', 'parmi', 'selon', 'sauf',
    'malgré', 'envers', 'hors', 'lors', 'jusqu', 'autour',
  ]),
  conj: new Set([
    'et', 'ou', 'mais', 'donc', 'or', 'ni', 'car',
    'que', 'si', 'quand', 'lorsque', 'comme', 'parce',
    'puisque', 'quoique', 'tandis', 'alors', 'cependant',
    'néanmoins', 'pourtant', 'toutefois', 'ainsi', 'puis',
    'pas', 'ne', 'non',
  ]),
  aux: new Set([
    'suis', 'es', 'est', 'sommes', 'êtes', 'sont',
    'étais', 'était', 'étions', 'étiez', 'étaient',
    'ai', 'as', 'a', 'avons', 'avez', 'ont',
    'avais', 'avait', 'avions', 'aviez', 'avaient',
    'sera', 'serai', 'seras', 'serons', 'serez', 'seront',
    'aurai', 'auras', 'aura', 'aurons', 'aurez', 'auront',
    'serait', 'serais', 'aurais', 'aurait',
    'fus', 'fut', 'furent', 'eu', 'été', 'ayant', 'étant',
    'fais', 'fait', 'faisons', 'faites', 'font',
    'vais', 'vas', 'allons', 'allez', 'vont',
    'peux', 'peut', 'pouvons', 'pouvez', 'peuvent',
    'veux', 'veut', 'voulons', 'voulez', 'veulent',
    'dois', 'doit', 'devons', 'devez', 'doivent',
    'sais', 'sait', 'savons', 'savez', 'savent',
  ]),
  advSfx:  ['ment'],
  adjSfx:  ['eux', 'euse', 'elle', 'ien', 'enne', 'ique', 'aire', 'oire', 'ible', 'able', 'if', 'ive', 'ant', 'ante'],
  nounSfx: ['tion', 'sion', 'eur', 'euse', 'age', 'iste', 'isme', 'ance', 'ence', 'ité', 'oir', 'oire'],
  verbSfx: ['er', 'ir', 'ant', 'ons', 'ent', 'ais', 'ait', 'aient'],
};

// ── Japanese ──────────────────────────────────────────────────────────────────
// Japanese POS is encoded in script type + hiragana suffix patterns.
// We tokenize at script-boundary transitions rather than whitespace.

// Hiragana particles — mark grammatical role of the preceding noun/phrase
const JA_PARTICLES = new Set([
  'は', 'が', 'を', 'に', 'へ', 'で', 'と', 'も', 'か', 'ね', 'よ', 'わ',
  'の', 'より', 'から', 'まで', 'だけ', 'しか', 'さえ', 'でも', 'ばかり',
  'など', 'ほど', 'くらい', 'ごろ', 'きり', 'こそ', 'って', 'ては', 'ても',
]);

// Hiragana verb endings (okurigana / conjugation suffixes)
const JA_VERB_SUFFIXES = [
  'ています', 'ていた', 'ている', 'ました', 'ません', 'ましょ', 'ます',
  'られる', 'させる', 'できる', 'てい', 'れる', 'れた', 'した', 'して',
  'する', 'ない', 'なかっ', 'たい', 'たら', 'たり', 'ながら', 'べき',
  'える', 'いる', 'おる', 'くる', 'みる', 'おく', 'いく',
  // plain present/past for u-verbs + ru-verbs
  'く', 'ぐ', 'す', 'つ', 'ぬ', 'ぶ', 'む', 'る', 'う',
  'いた', 'いで', 'んだ', 'って', 'けば',
];

// Hiragana adjective endings (i-adjective inflections)
const JA_ADJ_SUFFIXES = ['かった', 'くない', 'くなっ', 'くて', 'かく', 'い'];

// Copulas
const JA_COPULAS = new Set(['だ', 'です', 'でした', 'である', 'だっ', 'でしょ', 'だろ', 'じゃ']);

// Hiragana conjunctions / discourse connectors
const JA_CONJUNCTIONS = new Set([
  'そして', 'しかし', 'でも', 'また', 'さらに', 'ただし', 'なぜなら',
  'だから', 'なので', 'けれど', 'けれども', 'だが', 'ところが', 'ところで',
  'それで', 'それから', 'あるいは', 'もしくは', 'または',
]);

function getJaScriptType(char: string): 'kanji' | 'hiragana' | 'katakana' | 'other' {
  const cp = char.codePointAt(0) ?? 0;
  if ((cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) || (cp >= 0xF900 && cp <= 0xFAFF)) return 'kanji';
  if (cp >= 0x3040 && cp <= 0x309F) return 'hiragana';
  if (cp >= 0x30A0 && cp <= 0x30FF) return 'katakana';
  return 'other';
}

function tagJapaneseHiragana(text: string): PosTag {
  if (JA_PARTICLES.has(text)) return 'Preposition';
  if (JA_COPULAS.has(text))   return 'Verb';
  if (JA_CONJUNCTIONS.has(text)) return 'Conjunction';
  for (const sfx of JA_VERB_SUFFIXES) {
    if (text.endsWith(sfx) && text.length >= sfx.length) return 'Verb';
  }
  for (const sfx of JA_ADJ_SUFFIXES) {
    if (text.endsWith(sfx) && text.length >= sfx.length) return 'Adjective';
  }
  // Short unrecognised hiragana (1–2 chars) are likely particles not in our list
  if (text.length <= 2) return 'Preposition';
  return 'Other';
}

function analyzeGrammarJapanese(text: string): TaggedToken[] {
  // Split at script-type boundaries so "食べます" → ["食べ","ます"]
  const segments: { text: string; type: ReturnType<typeof getJaScriptType> }[] = [];
  let seg = '';
  let segType = getJaScriptType(text[0] ?? '');

  for (const ch of text) {
    const t = getJaScriptType(ch);
    if (t === segType) {
      seg += ch;
    } else {
      if (seg) segments.push({ text: seg, type: segType });
      seg = ch; segType = t;
    }
  }
  if (seg) segments.push({ text: seg, type: segType });

  return segments.map(({ text: s, type }) => {
    if (type === 'other') return { text: s, pos: 'Other' as PosTag, isWord: false };
    let pos: PosTag;
    switch (type) {
      case 'kanji':    pos = 'Noun';   break;   // content word default
      case 'katakana': pos = 'Noun';   break;   // loanword
      case 'hiragana': pos = tagJapaneseHiragana(s); break;
    }
    return { text: s, pos, isWord: true };
  });
}

// ── Suffix helper ─────────────────────────────────────────────────────────────

function sfx(word: string, suffixes: string[]): boolean {
  return suffixes.some(s => word.endsWith(s) && word.length > s.length + 2);
}

// ── Core tagger ───────────────────────────────────────────────────────────────

const RULES: Record<string, LangRules> = { en: EN, de: DE, es: ES, fr: FR };

export function tagWord(word: string, lang = 'en'): PosTag {
  // Japanese single-word: identify by dominant script type
  if (lang === 'ja') {
    const type = getJaScriptType(word[0] ?? '');
    if (type === 'kanji' || type === 'katakana') return 'Noun';
    if (type === 'hiragana') return tagJapaneseHiragana(word);
    return 'Other';
  }

  const r = RULES[lang] ?? EN;
  const w = word.toLowerCase();

  if (r.det.has(w))  return 'Determiner';
  if (r.pron.has(w)) return 'Pronoun';
  if (r.prep.has(w)) return 'Preposition';
  if (r.conj.has(w)) return 'Conjunction';
  if (r.aux.has(w))  return 'Verb';

  if (sfx(w, r.advSfx))  return 'Adverb';
  if (sfx(w, r.adjSfx))  return 'Adjective';
  if (sfx(w, r.nounSfx)) return 'Noun';
  if (sfx(w, r.verbSfx)) return 'Verb';

  // ── German morphological patterns ─────────────────────────────────────────
  if (lang === 'de') {
    // Past participles with ge- prefix: gemacht, gegangen, geschrieben
    if (/^ge[\wäöüß]{3,}(t|en)$/.test(w)) return 'Verb';
    // Inseparable-prefix past participles: beendet, erkannt, verstanden, zerbrochen
    if (/^(be|ent|er|ver|zer)[\wäöüß]{3,}(t|en)$/.test(w)) return 'Verb';
  }

  // ── Spanish: clitics attached to infinitives / gerunds ───────────────────
  // e.g. darlo (dar+lo), haciéndolo (haciendo+lo), lavarse (lavar+se)
  if (lang === 'es') {
    for (const clitic of ES_CLITICS) {
      if (w.endsWith(clitic) && w.length > clitic.length + 3) {
        const base = w.slice(0, -clitic.length);
        if (/([aei]r|ando|iendo|ado|ido)$/.test(base)) return 'Verb';
      }
    }
  }

  return 'Noun';
}

// ── Sentence tokenizer + tagger ───────────────────────────────────────────────

// Unicode-aware: matches accented letters (ä ö ü ß á é í ó ú ñ …)
const WORD_RE = /(\p{L}+)|([^\p{L}])/gu;

export function analyzeGrammar(text: string, lang = 'en'): TaggedToken[] {
  // Japanese uses script-boundary tokenisation instead of whitespace
  if (lang === 'ja') return analyzeGrammarJapanese(text);

  const tokens: TaggedToken[] = [];
  let wordIndex = 0;
  let match: RegExpExecArray | null;
  WORD_RE.lastIndex = 0;

  while ((match = WORD_RE.exec(text)) !== null) {
    if (match[1]) {
      const word = match[1];
      let pos: PosTag;

      // German capitalisation rule: mid-sentence uppercase initial = Noun
      if (lang === 'de' && wordIndex > 0 && /^\p{Lu}/u.test(word)) {
        const wl = word.toLowerCase();
        const r  = DE;
        // Only override to Noun if it's not a known function word
        if (!r.det.has(wl) && !r.pron.has(wl) && !r.prep.has(wl) && !r.conj.has(wl) && !r.aux.has(wl)) {
          pos = 'Noun';
        } else {
          pos = tagWord(word, lang);
        }
      } else {
        pos = tagWord(word, lang);
      }

      tokens.push({ text: word, pos, isWord: true });
      wordIndex++;
    } else if (match[2]) {
      tokens.push({ text: match[2], pos: 'Other', isWord: false });
    }
  }

  // ── German separable verb particle detection (post-processing) ────────────
  // Heuristic: a word tagged as Preposition/Conjunction that is a known
  // separable prefix, is NOT followed by a noun phrase, and has a verb
  // somewhere in the preceding 6 word tokens → retag it as Verb (particle).
  //
  // "Er macht die Tür auf"  → auf retagged: Verb ✓
  // "Er geht auf die Straße" → auf kept as Preposition (next word is Det) ✓
  if (lang === 'de') {
    const wordTokens = tokens.filter(t => t.isWord);
    for (let i = 0; i < wordTokens.length; i++) {
      const tok = wordTokens[i];
      if (tok.pos !== 'Preposition' && tok.pos !== 'Conjunction') continue;
      if (!DE_SEPARABLE_PREFIXES.has(tok.text.toLowerCase())) continue;

      // If the next word opens a noun phrase, this is a genuine preposition
      const next = wordTokens[i + 1];
      if (next && (next.pos === 'Noun' || next.pos === 'Determiner' || next.pos === 'Pronoun')) continue;

      // Retag if a verb appears within the previous 6 word tokens
      const lookback = wordTokens.slice(Math.max(0, i - 6), i);
      if (lookback.some(t => t.pos === 'Verb')) tok.pos = 'Verb';
    }
  }

  return tokens;
}
