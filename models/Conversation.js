const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  unreadCount: { type: Number, default: 0, min: 0 },
  lastReadAt: { type: Date, default: Date.now },
  lastReadMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  muted: { type: Boolean, default: false },
  clearedAt: { type: Date, default: null },
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  type: { type: String, enum: ['direct', 'group'], required: true, index: true },
  dmKey: { type: String, default: null },
  members: { type: [memberSchema], validate: [(value) => value.length >= 2, 'A conversation needs at least two members.'] },
  groupName: { type: String, trim: true, minlength: 1, maxlength: 40, default: null },
  groupAvatar: { url: { type: String, default: null }, publicId: { type: String, default: null } },
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  lastMessageAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

conversationSchema.index({ dmKey: 1 }, { unique: true, partialFilterExpression: { type: 'direct' } });
conversationSchema.index({ 'members.user': 1, lastMessageAt: -1 });

conversationSchema.statics.makeDmKey = function makeDmKey(firstId, secondId) {
  return [String(firstId), String(secondId)].sort().join(':');
};

module.exports = mongoose.model('Conversation', conversationSchema);
