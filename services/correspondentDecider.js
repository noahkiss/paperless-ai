// services/correspondentDecider.js
//
// Third correspondent-matching tier: when neither the exact nor the normalized
// match finds an existing correspondent, ask a decisions model which of the
// closest existing correspondents (if any) sent the document.
//
// OpenRouter's decisions endpoint answers typed questions about one block of
// text without generating any. A `choice` question takes `criteria`, a map of
// option key -> description, and answers
//   {type: 'choice', choice: '<key>', probabilities: {<key>: 0.98, ...}, confidence}
// The URL comes from the OpenAI-compatible base by replacing a trailing `/v1`
// with `/alpha/decisions`.

const NONE = 'none';

function decisionsUrl(baseUrl) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  return base.replace(/\/v1$/, '') + '/alpha/decisions';
}

/**
 * @param {object} opts
 * @param {string} opts.baseUrl    OpenAI-compatible base URL (…/v1)
 * @param {string} opts.apiKey
 * @param {string} opts.model      decisions model id
 * @param {number} [opts.minProbability] accept a pick at or above this
 * @param {number} [opts.timeoutMs]
 * @param {Function} [opts.fetch]  defaults to global fetch
 */
function createCorrespondentDecider(opts) {
  const url = decisionsUrl(opts.baseUrl);
  const doFetch = opts.fetch || globalThis.fetch;
  const minProbability = opts.minProbability ?? 0.8;
  const timeoutMs = opts.timeoutMs ?? 15000;
  const enabled = Boolean(url && opts.apiKey && opts.model);

  /**
   * @param {object} args
   * @param {string} args.proposed   the name the classification model returned
   * @param {string} [args.title]    the document title
   * @param {string} [args.excerpt]  the start of the document text
   * @param {{id:number,name:string}[]} args.candidates
   * @returns {Promise<{id:number,name:string,probability:number}|null>} null means "create new"
   */
  async function pick({ proposed, title, excerpt, candidates }) {
    if (!enabled || !candidates || candidates.length === 0) return null;

    const criteria = {};
    for (const c of candidates) criteria[`c${c.id}`] = c.name;
    criteria[NONE] = 'None of these: the sender is a different organization or person';

    const state = [
      `Proposed correspondent: "${proposed}"`,
      title ? `Document title: ${title}` : null,
      excerpt ? `Document excerpt:\n${excerpt}` : null,
    ].filter(Boolean).join('\n');

    const body = {
      model: opts.model,
      state,
      questions: {
        sender: {
          type: 'choice',
          instructions: 'Which existing correspondent sent this document, or wrote it? The proposed name may be a shortened, expanded or misspelled form of one of them. Choose "none" if it is a different organization or person.',
          criteria,
        },
      },
    };

    const res = await doFetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${opts.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
      throw new Error(`decisions HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    const data = await res.json();
    const answer = data?.answers?.sender;
    const choice = answer?.choice;
    if (!choice || choice === NONE) return null;
    const probability = Number(answer.probabilities?.[choice] ?? answer.confidence ?? 0);
    if (!(probability >= minProbability)) return null;
    const chosen = candidates.find(c => `c${c.id}` === choice);
    if (!chosen) return null;
    return { id: chosen.id, name: chosen.name, probability };
  }

  return { enabled, url, pick };
}

module.exports = { createCorrespondentDecider, decisionsUrl };
