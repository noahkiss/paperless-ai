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

module.exports = { normalizeName, findMatchingCorrespondent };
