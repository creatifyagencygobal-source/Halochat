const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true, minlength: 3, maxlength: 24, match: /^[a-z0-9_]+$/, index: true },
  password: { type: String, required: true, minlength: 8, select: false },
  avatar: { url: { type: String, default: null }, publicId: { type: String, default: null } },
  lastSeen: { type: Date, default: null },
  tokenVersion: { type: Number, default: 0, min: 0, select: false },
  settings: {
    notificationsEnabled: { type: Boolean, default: false },
    notificationSound: { type: Boolean, default: true },
    notificationPreview: { type: Boolean, default: true },
  },
}, { timestamps: true });

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidate) { return bcrypt.compare(candidate, this.password); };
userSchema.methods.toSafeObject = function () {
  return { id: this._id.toString(), username: this.username, avatar: this.avatar?.url ? { url: this.avatar.url } : null,
    settings: { notificationsEnabled: this.settings?.notificationsEnabled === true, notificationSound: this.settings?.notificationSound !== false, notificationPreview: this.settings?.notificationPreview !== false } };
};

module.exports = mongoose.model('User', userSchema);
