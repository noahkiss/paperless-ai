// Run with: npm run test:unit
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isSetupPath, setupAccess, hasSavedConfig } = require('../services/setupGuard');

test('matches every path the old PUBLIC_ROUTES prefix rule made public', () => {
  for (const p of ['/setup', '/setup/', '/setup/anything', '/setupx']) {
    assert.equal(isSetupPath(p), true, p);
  }
  for (const p of ['/settings', '/login', '/', '/api/setup']) {
    assert.equal(isSetupPath(p), false, p);
  }
});

test('setup is public on first run, before any user exists', () => {
  assert.equal(setupAccess({ path: '/setup', method: 'POST' }, false), 'public');
  assert.equal(setupAccess({ path: '/setup', method: 'GET' }, false), 'public');
});

test('setup needs authentication once a user exists', () => {
  assert.equal(setupAccess({ path: '/setup', method: 'POST' }, true), 'auth');
  assert.equal(setupAccess({ path: '/setup', method: 'GET' }, true), 'auth');
  assert.equal(setupAccess({ path: '/setup/x', method: 'PUT' }, true), 'auth');
});

test('other paths keep the normal rules', () => {
  assert.equal(setupAccess({ path: '/dashboard', method: 'GET' }, true), 'not-setup');
  assert.equal(setupAccess({ path: '/login', method: 'POST' }, false), 'not-setup');
});

test('saved config with a Paperless URL locks setup; a missing file does not', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setupguard-'));
  const env = path.join(dir, '.env');
  try {
    assert.equal(hasSavedConfig(env), false);
    fs.writeFileSync(env, 'AI_PROVIDER=custom\n');
    assert.equal(hasSavedConfig(env), false);
    fs.writeFileSync(env, 'AI_PROVIDER=custom\nPAPERLESS_API_URL=http://paperless:8000/api\n');
    assert.equal(hasSavedConfig(env), true);
    // A path that cannot be read as a file counts as configured (fail closed)
    assert.equal(hasSavedConfig(dir), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
