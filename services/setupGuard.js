// Decides how the auth middleware treats a request to the setup wizard.
//
// The wizard is public only on a fresh instance: no user and no saved
// config. Once either exists, every /setup request needs the normal
// authentication: otherwise an anonymous POST /setup could replace the
// config and delete all users (GHSA-qgr5-7f3c-qqm3). Saved config alone
// locks it too, because an instance configured by editing data/.env has
// no user, and GET /setup renders the saved secrets.
//
// The lock does not use setupService.isConfigured(): that check validates
// against Paperless-ngx, so an unreachable Paperless would reopen the wizard.

const fs = require('fs');

// Same prefix match PUBLIC_ROUTES uses, so every path the old rule made
// public is covered. Other spellings (e.g. /SETUP) never matched
// PUBLIC_ROUTES and already need authentication.
function isSetupPath(path) {
  return path.startsWith('/setup');
}

/**
 * @param {object} req       - { path, method }
 * @param {boolean} locked   - a user or saved config exists
 * @returns {'not-setup'|'public'|'auth'}
 *   not-setup: not a setup path, use the normal rules
 *   public:    first-run setup, allow without authentication
 *   auth:      setup is locked, require authentication
 */
function setupAccess(req, locked) {
  if (!isSetupPath(req.path)) return 'not-setup';
  return locked ? 'auth' : 'public';
}

// True when the config file holds a Paperless URL, the same first test
// setupService.isConfigured() applies. A missing file means not configured;
// any other read error counts as configured, so the wizard stays locked.
function hasSavedConfig(envPath) {
  let content;
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch (error) {
    return error.code !== 'ENOENT';
  }
  return /^\s*PAPERLESS_API_URL\s*=\s*\S/m.test(content);
}

module.exports = { isSetupPath, setupAccess, hasSavedConfig };
