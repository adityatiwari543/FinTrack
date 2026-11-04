/**
 * Global Integration Test Setup File
 * Runs before any integration test suite executes.
 *
 * Ensures backward-compatibility for superagent across heterogeneous
 * node_modules trees containing mime v1.x and v2.x.
 */

// 1. Polyfill mime.getType across all reachable mime packages
const mimeCandidates = [
  'mime',
  '../../services/transaction-service/node_modules/mime',
  '../../services/auth-service/node_modules/mime',
  '../../services/notification-service/node_modules/mime',
  '../../gateway/node_modules/mime'
];

mimeCandidates.forEach((pkgPath) => {
  try {
    const m = require(pkgPath);
    if (m && !m.getType) {
      m.getType = (type) => {
        if (m.lookup) return m.lookup(type);
        if (type === 'json') return 'application/json';
        return type;
      };
    }
  } catch (e) {
    // Module path may not exist in specific environments
  }
});

// 2. Wrap superagent Request.prototype.type to reliably set application/json
const superagentCandidates = [
  'superagent',
  '../../services/transaction-service/node_modules/superagent',
  '../../services/auth-service/node_modules/superagent',
  '../../services/notification-service/node_modules/superagent',
  '../../gateway/node_modules/superagent'
];

superagentCandidates.forEach((pkgPath) => {
  try {
    const sa = require(pkgPath);
    if (sa && sa.Request && sa.Request.prototype && !sa.Request.prototype._fintrackPatched) {
      const origType = sa.Request.prototype.type;
      sa.Request.prototype.type = function (type) {
        if (type === 'json' || type === 'application/json') {
          return this.set('Content-Type', 'application/json');
        }
        try {
          return origType.call(this, type);
        } catch (err) {
          return this.set('Content-Type', type);
        }
      };
      sa.Request.prototype._fintrackPatched = true;
    }
  } catch (e) {
    // Module path may not exist in specific environments
  }
});

module.exports = {};
