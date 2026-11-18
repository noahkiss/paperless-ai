// Decides how the auth middleware treats a request to the setup wizard.
//
// The wizard is public only while the instance has no user. Once a user
// exists, every /setup request needs the normal authentication: otherwise an
// anonymous POST /setup could replace the config and delete all users
// (GHSA-qgr5-7f3c-qqm3).
//
// The lock keys on users, not on setupService.isConfigured(): that check
// validates against Paperless-ngx, so an unreachable Paperless would reopen
// the wizard.

// Same prefix match PUBLIC_ROUTES uses, so every path the old rule made
// public is covered. Other spellings (e.g. /SETUP) never matched
// PUBLIC_ROUTES and already need authentication.
function isSetupPath(path) {
  return path.startsWith('/setup');
}

/**
 * @param {object} req       - { path, method }
 * @param {boolean} hasUsers - at least one user exists
 * @returns {'not-setup'|'public'|'auth'}
 *   not-setup: not a setup path, use the normal rules
 *   public:    first-run setup, allow without authentication
 *   auth:      setup is locked, require authentication
 */
function setupAccess(req, hasUsers) {
  if (!isSetupPath(req.path)) return 'not-setup';
  return hasUsers ? 'auth' : 'public';
}

// How to answer an unauthenticated request to a locked setup path.
// Browsers navigating to the page get the login page; anything else gets 401.
function lockedSetupResponse(method) {
  return method === 'GET' || method === 'HEAD' ? 'redirect' : 'unauthorized';
}

module.exports = { isSetupPath, setupAccess, lockedSetupResponse };
