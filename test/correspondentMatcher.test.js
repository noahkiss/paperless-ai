// Run with: npm run test:unit
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeName, findMatchingCorrespondent } = require('../services/correspondentMatcher');

const existing = [
  { id: 71, name: 'Example Bank' },
  { id: 818, name: 'Example Society' },
  { id: 900, name: 'Jane Q. Doe, Tax Collector' },
  { id: 901, name: 'DMV' },
  { id: 902, name: 'Lake State' },
  { id: 903, name: 'Acme Widgets, Inc.' },
  { id: 950, name: 'acme widgets' }, // a later duplicate of 903
  { id: 904, name: 'Barnes & Noble' },
  { id: 905, name: 'The Widget Company' },
];

test('normalizeName strips case, punctuation, "the" and legal suffixes', () => {
  assert.equal(normalizeName('Example Bank, N.A.'), 'example bank');
  assert.equal(normalizeName('JANE Q DOE, TAX COLLECTOR'), 'jane q doe tax collector');
  assert.equal(normalizeName('Acme Widgets LLC'), 'acme widgets');
  assert.equal(normalizeName('Acme Widgets, L.L.C.'), 'acme widgets');
  assert.equal(normalizeName('Barnes and Noble'), 'barnes and noble');
  assert.equal(normalizeName('Widget Co.'), 'widget');
  assert.equal(normalizeName('Café Rouge'), 'cafe rouge');
});

test('normalizeName never strips a name down to nothing', () => {
  assert.equal(normalizeName('Inc'), 'inc');
  assert.equal(normalizeName('The'), 'the');
  assert.equal(normalizeName('  '), '');
});

test('normalized variants reuse the existing correspondent', () => {
  const cases = [
    ['Example Bank, N.A.', 71],
    ['JANE Q DOE, TAX COLLECTOR', 900],
    ['Barnes and Noble', 904],
    ['Widget Co.', 905],
    ['the widget company', 905],
  ];
  for (const [suggested, id] of cases) {
    const m = findMatchingCorrespondent(suggested, existing);
    assert.ok(m, `expected a match for ${suggested}`);
    assert.equal(m.id, id, suggested);
    assert.equal(m.rule, 'normalized');
  }
});

test('duplicates resolve to the lowest id', () => {
  assert.equal(findMatchingCorrespondent('ACME WIDGETS INC', existing).id, 903);
});

test('different senders do not match by default', () => {
  assert.equal(findMatchingCorrespondent('Department of Motor Vehicles', existing), null);
  assert.equal(findMatchingCorrespondent('Lake State Health', existing), null);
  assert.equal(findMatchingCorrespondent('Example Society Northern Chapter', existing), null);
  assert.equal(findMatchingCorrespondent('Example Bank of Somewhere', existing), null);
  assert.equal(findMatchingCorrespondent('', existing), null);
});

test('prefix rule is opt-in and needs a unique candidate', () => {
  const opts = { prefix: true };
  const m = findMatchingCorrespondent('Example Society Northern Chapter', existing, opts);
  assert.equal(m.id, 818);
  assert.equal(m.rule, 'prefix');
  // "Lake State" has two tokens, so it qualifies; this is why the rule is off by default.
  assert.equal(findMatchingCorrespondent('Lake State Health', existing, opts).id, 902);
  // A single-token prefix is never enough.
  assert.equal(findMatchingCorrespondent('DMV Driver Services', existing, opts), null);
  // Two candidates: no match.
  const twoBanks = [...existing, { id: 72, name: 'Example Bank Trust' }];
  assert.equal(findMatchingCorrespondent('Example Bank Trust Department', twoBanks, opts), null);
});
