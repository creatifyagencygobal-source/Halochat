const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { COOKIE_NAME } = require('../utils/generateToken');
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ success: false, message: 'Authentication required.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select('+tokenVersion');
    if (!user || payload.ver !== user.tokenVersion) return res.status(401).json({ success: false, message: 'Authentication required.' });
    req.user = user; req.userId = user._id; return next();
  } catch (error) {
    if (['JsonWebTokenError', 'TokenExpiredError'].includes(error.name)) return res.status(401).json({ success: false, message: 'Authentication required.' });
    return next(error);
  }
}
module.exports = { requireAuth };
