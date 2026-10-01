const crypto = require('crypto');
const { CSRF_COOKIE_NAME } = require('../utils/generateToken');

function safeEqual(first, second) {
  const a = Buffer.from(String(first || '')); const b = Buffer.from(String(second || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || ['/api/auth/login', '/api/auth/register'].includes(req.path)) return next();
  if (!safeEqual(req.cookies[CSRF_COOKIE_NAME], req.get('x-csrf-token'))) return res.status(403).json({ success: false, message: 'Security token is missing or invalid. Refresh and try again.' });
  return next();
}
module.exports = { requireCsrf, safeEqual };
