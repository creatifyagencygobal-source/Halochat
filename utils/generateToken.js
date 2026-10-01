const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const COOKIE_NAME = 'chat_auth';
const CSRF_COOKIE_NAME = 'chat_csrf';
function parseDuration(value = '7d') {
  const match = String(value).match(/^(\d+)([smhd])$/i);
  if (!match) return 7 * 86400000;
  return Number(match[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2].toLowerCase()];
}
function options() { return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: parseDuration(process.env.JWT_EXPIRES_IN) }; }
function generateToken(userId, tokenVersion = 0) { return jwt.sign({ sub: userId, ver: tokenVersion }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }); }
function setAuthCookie(res, token) { res.cookie(COOKIE_NAME, token, options()); }
function setCsrfCookie(res) { const token = crypto.randomBytes(32).toString('base64url'); res.cookie(CSRF_COOKIE_NAME, token, { ...options(), httpOnly: false }); return token; }
function clearAuthCookie(res) { const value = options(); delete value.maxAge; res.clearCookie(COOKIE_NAME, value); res.clearCookie(CSRF_COOKIE_NAME, { ...value, httpOnly: false }); }
module.exports = { COOKIE_NAME, CSRF_COOKIE_NAME, generateToken, setAuthCookie, setCsrfCookie, clearAuthCookie };
