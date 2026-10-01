const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  url: String, publicId: String, resourceType: String, originalName: String,
  mimeType: String, size: Number, format: String, width: Number, height: Number,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const messageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  clientMessageId: { type: String, required: true, maxlength: 100 },
  type: { type: String, enum: ['text', 'image', 'file', 'event'], default: 'text' },
  text: { type: String, trim: true, maxlength: 2000, default: '' },
  attachments: { type: [attachmentSchema], default: [] },
  eventType: { type: String, enum: ['attachment_downloaded','profile_photo_updated','group_created','group_renamed','member_joined','member_left','member_removed','future_media_saved'], default: null },
  eventData: { type: mongoose.Schema.Types.Mixed, default: null },
  deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

messageSchema.index({ conversation: 1, createdAt: -1, _id: -1 });
messageSchema.index({ sender: 1, clientMessageId: 1 }, { unique: true });

module.exports = mongoose.model('Message', messageSchema);
