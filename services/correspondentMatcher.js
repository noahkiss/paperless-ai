// services/correspondentMatcher.js
//
// Matches an AI-suggested correspondent name against the names that already
// exist in Paperless, so a spelling variant reuses the existing correspondent
// instead of creating a duplicate. Pure functions only; no I/O.

// Trailing words that name a legal form, not the organization. Matched as whole
// tokens after punctuation is removed, so "N.A." arrives here as "n a".
const LEGAL_SUFFIXES = [
  ['n', 'a'],
  ['na'],
  ['l', 'l', 'c'],
  ['llc'],
  ['pllc'],
  ['llp'],
  ['lp'],
  ['inc'],
  ['incorporated'],
  ['corp'],
  ['corporation'],
  ['co'],
  ['company'],
  ['ltd'],
  ['limited'],
  ['plc'],
  ['pc'],
  ['gmbh'],
];

function tokenize(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // diacritics
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function endsWith(tokens, suffix) {
  if (suffix.length >= tokens.length) return false; // never strip the whole name
  return suffix.every((t, i) => tokens[tokens.length - suffix.length + i] === t);
}

// Canonical key for a name: lowercase, no punctuation or diacritics, no leading
// "the", no trailing legal-form suffixes.
function normalizeName(name) {
  let tokens = tokenize(name);
  if (tokens.length > 1 && tokens[0] === 'the') tokens = tokens.slice(1);
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const suffix of LEGAL_SUFFIXES) {
      if (endsWith(tokens, suffix)) {
        tokens = tokens.slice(0, tokens.length - suffix.length);
        stripped = true;
        break;
      }
    }
  }
  return tokens.join(' ');
}

/**
 * Find an existing correspondent that the suggested name refers to.
 *
 * Rules, in order:
 *  1. normalized names are equal (case, punctuation, "the", legal suffixes);
 *  2. only with options.prefix: the shorter name's tokens are the leading tokens
 *     of the longer one, the shorter has at least options.minPrefixTokens tokens,
 *     and exactly one existing correspondent qualifies. Off by default: it maps
 *     "Lake State Health" onto "Lake State", which is a different sender.
 *
 * When several existing correspondents share a key (earlier duplicates), the
 * lowest id wins so the result is stable.
 *
 * @param {string} suggested - the name the model returned
 * @param {{id:number,name:string}[]} existing - all correspondents
 * @param {{prefix?:boolean,minPrefixTokens?:number}} options
 * @returns {{id:number,name:string,rule:string}|null}
 */
function findMatchingCorrespondent(suggested, existing, options = {}) {
  const key = normalizeName(suggested);
  if (!key) return null;

  const byId = (a, b) => a.id - b.id;
  const equal = existing.filter(c => normalizeName(c.name) === key).sort(byId);
  if (equal.length > 0) {
    return { id: equal[0].id, name: equal[0].name, rule: 'normalized' };
  }

  if (!options.prefix) return null;

  const minTokens = options.minPrefixTokens || 2;
  const keyTokens = key.split(' ');
  const isPrefix = (shorter, longer) =>
    shorter.length >= minTokens &&
    shorter.length < longer.length &&
    shorter.every((t, i) => longer[i] === t);

  const candidates = existing.filter(c => {
    const tokens = normalizeName(c.name).split(' ');
    return isPrefix(tokens, keyTokens) || isPrefix(keyTokens, tokens);
  });
  if (candidates.length === 1) {
    return { id: candidates[0].id, name: candidates[0].name, rule: 'prefix' };
  }
  return null;
}

function trigrams(key) {
  const padded = `  ${key} `;
  const grams = new Set();
  for (let i = 0; i < padded.length - 2; i++) grams.add(padded.slice(i, i + 3));
  return grams;
}

// Similarity of two names in 0..1: the mean of token Jaccard and character
// trigram Dice over the normalized names. Tokens catch reordering and dropped
// words ("Society" vs "Example Society"); trigrams catch spelling.
function nameSimilarity(a, b) {
  const ka = normalizeName(a);
  const kb = normalizeName(b);
  if (!ka || !kb) return 0;
  const ta = new Set(ka.split(' '));
  const tb = new Set(kb.split(' '));
  const sharedTokens = [...ta].filter(t => tb.has(t)).length;
  const jaccard = sharedTokens / (ta.size + tb.size - sharedTokens);
  const ga = trigrams(ka);
  const gb = trigrams(kb);
  const sharedGrams = [...ga].filter(g => gb.has(g)).length;
  const dice = (2 * sharedGrams) / (ga.size + gb.size);
  return (jaccard + dice) / 2;
}

/**
 * The existing correspondents most similar to a suggested name, best first.
 * @returns {{id:number,name:string,score:number}[]}
 */
function rankCandidates(suggested, existing, limit = 10) {
  return existing
    .map(c => ({ id: c.id, name: c.name, score: nameSimilarity(suggested, c.name) }))
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .slice(0, limit);
}

module.exports = { normalizeName, findMatchingCorrespondent, nameSimilarity, rankCandidates };
