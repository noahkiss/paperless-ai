// Run with: npm run test:unit
const test = require('node:test');
const assert = require('node:assert/strict');
const { rankCandidates } = require('../services/correspondentMatcher');
const { createCorrespondentDecider, decisionsUrl } = require('../services/correspondentDecider');

const existing = [
  { id: 1, name: 'Example Society' },
  { id: 2, name: 'Society of Friends' },
  { id: 3, name: 'Lake County' },
  { id: 4, name: 'Department of Motor Vehicles' },
  { id: 5, name: 'Example Bank' },
];

test('rankCandidates puts the dropped-word variant first', () => {
  const r2 = rankCandidates('The Example Society Northern Chapter', existing, 10);
  assert.equal(r2[0].id, 1);
  assert.ok(r2.length <= 10);
  assert.ok(r2.every(c => c.score > 0));
});

test('rankCandidates catches a misspelling and respects the limit', () => {
  const ranked = rankCandidates('Departmnt of Motor Vehicle', existing, 2);
  assert.equal(ranked[0].id, 4);
  assert.equal(ranked.length, 2);
});

test('decisionsUrl swaps a trailing /v1', () => {
  assert.equal(decisionsUrl('http://gate:5483/v1'), 'http://gate:5483/alpha/decisions');
  assert.equal(decisionsUrl('http://gate:5483/v1/'), 'http://gate:5483/alpha/decisions');
  assert.equal(decisionsUrl(''), '');
});

function fakeFetch(answer, status = 200) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return {
      ok: status === 200,
      status,
      text: async () => 'boom',
      json: async () => ({ answers: { sender: answer } }),
    };
  };
  fn.calls = calls;
  return fn;
}

const base = { baseUrl: 'http://gate/v1', apiKey: 'k', model: 'm' };
const candidates = existing.slice(0, 3);

test('a confident pick returns the existing correspondent', async () => {
  const fetch = fakeFetch({ type: 'choice', choice: 'c1', probabilities: { c1: 0.97, none: 0.03 } });
  const d = createCorrespondentDecider({ ...base, fetch });
  const r = await d.pick({ proposed: 'Society', title: 't', excerpt: 'e', candidates });
  assert.deepEqual(r, { id: 1, name: 'Example Society', probability: 0.97 });
  const sent = fetch.calls[0];
  assert.equal(sent.url, 'http://gate/alpha/decisions');
  assert.equal(sent.body.questions.sender.type, 'choice');
  assert.deepEqual(Object.keys(sent.body.questions.sender.criteria), ['c1', 'c2', 'c3', 'none']);
  assert.match(sent.body.state, /Proposed correspondent: "Society"/);
});

test('"none" and low-probability picks mean create new', async () => {
  let d = createCorrespondentDecider({ ...base, fetch: fakeFetch({ choice: 'none', probabilities: { none: 0.9 } }) });
  assert.equal(await d.pick({ proposed: 'x', candidates }), null);
  d = createCorrespondentDecider({ ...base, fetch: fakeFetch({ choice: 'c2', probabilities: { c2: 0.6 } }) });
  assert.equal(await d.pick({ proposed: 'x', candidates }), null);
  d = createCorrespondentDecider({ ...base, fetch: fakeFetch({ choice: 'c99', probabilities: { c99: 0.99 } }) });
  assert.equal(await d.pick({ proposed: 'x', candidates }), null);
});

test('an HTTP error throws; a missing key disables the tier', async () => {
  const d = createCorrespondentDecider({ ...base, fetch: fakeFetch({}, 500) });
  await assert.rejects(d.pick({ proposed: 'x', candidates }), /decisions HTTP 500/);
  const off = createCorrespondentDecider({ ...base, apiKey: '' });
  assert.equal(off.enabled, false);
  assert.equal(await off.pick({ proposed: 'x', candidates }), null);
});
