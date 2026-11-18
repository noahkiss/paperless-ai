// Run with: npm run test:unit
const test = require('node:test');
const assert = require('node:assert/strict');
const { isSetupPath, setupAccess, lockedSetupResponse } = require('../services/setupGuard');

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

test('locked setup: page loads redirect to login, everything else gets 401', () => {
  assert.equal(lockedSetupResponse('GET'), 'redirect');
  assert.equal(lockedSetupResponse('HEAD'), 'redirect');
  assert.equal(lockedSetupResponse('POST'), 'unauthorized');
  assert.equal(lockedSetupResponse('PUT'), 'unauthorized');
  assert.equal(lockedSetupResponse('DELETE'), 'unauthorized');
});
