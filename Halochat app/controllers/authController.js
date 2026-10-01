const { validationResult } = require('express-validator');
const User = require('../models/User');
const { generateToken, setAuthCookie, setCsrfCookie, clearAuthCookie } = require('../utils/generateToken');

function hasValidationErrors(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  const formatted = errors.array().map(({ path, msg }) => ({ field: path, message: msg }));
  res.status(400).json({ success: false, message: formatted[0].message, errors: formatted });
  return true;
}

async function register(req, res, next) {
  try {
    if (hasValidationErrors(req, res)) return;
    const username = req.body.username.trim().toLowerCase();
    if (await User.exists({ username })) return res.status(409).json({ success: false, message: 'Username is already taken.' });
    const user = await User.create({ username, password: req.body.password });
    setAuthCookie(res, generateToken(user._id.toString(), user.tokenVersion)); setCsrfCookie(res);
    return res.status(201).json({ success: true, message: 'Account created successfully.', user: user.toSafeObject() });
  } catch (error) { return next(error); }
}

async function login(req, res, next) {
  try {
    if (hasValidationErrors(req, res)) return;
    const user = await User.findOne({ username: req.body.username.trim().toLowerCase() }).select('+password +tokenVersion');
    if (!user || !(await user.comparePassword(req.body.password))) return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    setAuthCookie(res, generateToken(user._id.toString(), user.tokenVersion)); setCsrfCookie(res);
    return res.json({ success: true, message: 'Logged in successfully.', user: user.toSafeObject() });
  } catch (error) { return next(error); }
}

function logout(req, res) { clearAuthCookie(res); return res.json({ success: true, message: 'Logged out successfully.' }); }
function me(req, res) { setCsrfCookie(res); return res.json({ success: true, user: req.user.toSafeObject() }); }
module.exports = { register, login, logout, me };
