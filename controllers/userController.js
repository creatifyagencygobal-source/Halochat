const User = require('../models/User');
const Conversation = require('../models/Conversation');
const { clearAuthCookie } = require('../utils/generateToken');

function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function searchUsers(req, res, next) {
  try {
    const query = String(req.query.q || '').trim().toLowerCase();
    if (!query) return res.json({ success: true, users: [] });
    if (query.length > 24 || !/^[a-z0-9_]+$/.test(query)) return res.status(400).json({ success: false, message: 'Enter a valid username search.' });
    const users = await User.find({ _id: { $ne: req.userId }, username: { $regex: `^${escapeRegex(query)}` } }).select('username avatar lastSeen').sort({ username: 1 }).limit(20).lean();
    return res.json({ success: true, users: users.map((user) => ({ id: String(user._id), username: user.username, avatar: user.avatar?.url ? user.avatar : null, lastSeen: user.lastSeen || null })) });
  } catch (error) { return next(error); }
}

async function emitProfile(req, user) {
  const related = await Conversation.distinct('members.user', { 'members.user': req.userId });
  req.app.get('io')?.to([...new Set([String(req.userId), ...related.map(String)])].map((id) => `user:${id}`)).emit('profile:updated', { userId: String(req.userId), username: user.username, avatar: user.avatar?.url ? { url: user.avatar.url } : null });
}

async function updateProfile(req, res, next) {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const currentPassword = String(req.body.currentPassword || '');
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return res.status(400).json({ success: false, message: 'Username must be 3–24 letters, numbers, or underscores.' });
    if (username === req.user.username) return res.status(400).json({ success: false, message: 'Choose a different username.' });
    const user = await User.findById(req.userId).select('+password');
    if (!currentPassword || !(await user.comparePassword(currentPassword))) return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    if (await User.exists({ username, _id: { $ne: req.userId } })) return res.status(409).json({ success: false, message: 'Username is unavailable.' });
    user.username = username; await user.save(); await emitProfile(req, user);
    return res.json({ success: true, message: 'Username updated.', user: user.toSafeObject() });
  } catch (error) { return next(error); }
}

async function changePassword(req, res, next) {
  try {
    const currentPassword = String(req.body.currentPassword || ''), newPassword = String(req.body.newPassword || ''), confirmPassword = String(req.body.confirmPassword || '');
    if (newPassword.length < 8 || newPassword.length > 128) return res.status(400).json({ success: false, message: 'New password must be between 8 and 128 characters.' });
    if (newPassword !== confirmPassword) return res.status(400).json({ success: false, message: 'New passwords do not match.' });
    const user = await User.findById(req.userId).select('+password +tokenVersion');
    if (!(await user.comparePassword(currentPassword))) return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    if (await user.comparePassword(newPassword)) return res.status(400).json({ success: false, message: 'Choose a new password.' });
    user.password = newPassword; user.tokenVersion += 1; await user.save(); clearAuthCookie(res);
    req.app.get('io')?.in(`user:${req.userId}`).disconnectSockets(true);
    return res.json({ success: true, message: 'Password changed. Please sign in again.' });
  } catch (error) { return next(error); }
}

async function updateSettings(req, res, next) {
  try {
    const allowed = ['notificationsEnabled', 'notificationSound', 'notificationPreview']; const changes = {};
    for (const key of allowed) { if (Object.hasOwn(req.body, key)) { if (typeof req.body[key] !== 'boolean') return res.status(400).json({ success: false, message: 'Settings must be true or false.' }); changes[`settings.${key}`] = req.body[key]; } }
    if (!Object.keys(changes).length) return res.status(400).json({ success: false, message: 'No valid settings supplied.' });
    const user = await User.findByIdAndUpdate(req.userId, { $set: changes }, { new: true, runValidators: true });
    return res.json({ success: true, settings: user.toSafeObject().settings });
  } catch (error) { return next(error); }
}

module.exports = { searchUsers, updateProfile, changePassword, updateSettings };
