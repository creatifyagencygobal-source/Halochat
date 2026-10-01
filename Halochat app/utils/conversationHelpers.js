const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');

const SAFE_USER_FIELDS = 'username avatar lastSeen';

function isObjectId(value) { return mongoose.isValidObjectId(value); }
function memberId(member) { return String(member.user?._id || member.user); }
function isMember(conversation, userId) { return conversation.members.some((member) => memberId(member) === String(userId)); }
function memberState(conversation, userId) { return conversation.members.find((member) => memberId(member) === String(userId)); }

async function findAuthorizedConversation(conversationId, userId, populate = true) {
  if (!isObjectId(conversationId)) return null;
  let query = Conversation.findOne({ _id: conversationId, 'members.user': userId });
  if (populate) query = query.populate('members.user', SAFE_USER_FIELDS).populate('admins', SAFE_USER_FIELDS).populate({ path: 'lastMessage', populate: { path: 'sender', select: SAFE_USER_FIELDS } });
  return query;
}

function safeUser(user) {
  if (!user) return null;
  return { id: String(user._id), username: user.username, avatar: user.avatar?.url ? { url: user.avatar.url } : null, lastSeen: user.lastSeen || null };
}

function serializeConversation(conversation, currentUserId, onlineIds = new Set()) {
  const currentMember = memberState(conversation, currentUserId);
  const members = conversation.members.map((member) => ({ ...safeUser(member.user), isAdmin: conversation.admins.some((admin) => String(admin._id || admin) === memberId(member)), online: onlineIds.has(memberId(member)), lastReadAt: member.lastReadAt || null, lastReadMessage: member.lastReadMessage ? String(member.lastReadMessage) : null }));
  const counterpart = conversation.type === 'direct' ? members.find((member) => member.id !== String(currentUserId)) : null;
  const last = conversation.lastMessage;
  const clearedAt = currentMember?.clearedAt || null;
  const visibleLast = last && (!clearedAt || new Date(last.createdAt) > new Date(clearedAt)) ? last : null;
  return {
    id: String(conversation._id), type: conversation.type,
    name: conversation.type === 'group' ? conversation.groupName : counterpart?.username,
    avatar: conversation.type === 'group' && conversation.groupAvatar?.url ? conversation.groupAvatar : counterpart?.avatar || null,
    members, admins: conversation.admins.map((admin) => String(admin._id || admin)), createdBy: String(conversation.createdBy),
    unreadCount: currentMember?.unreadCount || 0, lastReadAt: currentMember?.lastReadAt || null,
    muted: currentMember?.muted === true, clearedAt,
    lastMessage: visibleLast ? { id: String(visibleLast._id), text: visibleLast.text, type: visibleLast.type, sender: safeUser(visibleLast.sender), createdAt: visibleLast.createdAt } : null,
    lastMessageAt: conversation.lastMessageAt, counterpart,
  };
}

module.exports = { SAFE_USER_FIELDS, isObjectId, isMember, memberState, findAuthorizedConversation, safeUser, serializeConversation };
