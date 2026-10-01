const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { SAFE_USER_FIELDS, findAuthorizedConversation, serializeConversation } = require('../utils/conversationHelpers');

function io(req) { return req.app.get('io'); }
function online(req) { return req.app.get('presence')?.onlineIds() || new Set(); }
const MAX_GROUP_MEMBERS = 50;
function isAdmin(conversation, userId) { return conversation.admins.some((id) => String(id._id || id) === String(userId)); }
async function populatedConversation(id) { return Conversation.findById(id).populate('members.user', SAFE_USER_FIELDS).populate('admins', SAFE_USER_FIELDS).populate({ path: 'lastMessage', populate: { path: 'sender', select: SAFE_USER_FIELDS } }); }
async function groupEvent(req, conversation, eventType, text, eventData = {}) {
  const event = await Message.create({ conversation: conversation._id, sender: req.userId, clientMessageId: `${eventType}:${conversation._id}:${Date.now()}`, type: 'event', text, eventType, eventData, deliveredTo: [req.userId], readBy: [req.userId] });
  await Conversation.updateOne({ _id: conversation._id }, { $set: { lastMessage: event._id, lastMessageAt: event.createdAt }, $inc: { 'members.$[recipient].unreadCount': 1 } }, { arrayFilters: [{ 'recipient.user': { $ne: req.userId } }] });
  return event;
}
async function broadcastConversation(req, conversation, event = 'conversation:updated') { for (const member of conversation.members) io(req)?.to(`user:${member.user._id || member.user}`).emit(event, serializeConversation(conversation, member.user._id || member.user, online(req))); }

async function listConversations(req, res, next) {
  try {
    const conversations = await Conversation.find({ 'members.user': req.userId }).sort({ lastMessageAt: -1 }).populate('members.user', SAFE_USER_FIELDS).populate('admins', SAFE_USER_FIELDS).populate({ path: 'lastMessage', populate: { path: 'sender', select: SAFE_USER_FIELDS } });
    return res.json({ success: true, conversations: conversations.map((item) => serializeConversation(item, req.userId, online(req))) });
  } catch (error) { return next(error); }
}

async function createDirect(req, res, next) {
  try {
    const recipientId = req.body.userId;
    if (!mongoose.isValidObjectId(recipientId)) return res.status(400).json({ success: false, message: 'Invalid user.' });
    if (String(recipientId) === String(req.userId)) return res.status(400).json({ success: false, message: 'You cannot message yourself.' });
    if (!(await User.exists({ _id: recipientId }))) return res.status(404).json({ success: false, message: 'User not found.' });
    const dmKey = Conversation.makeDmKey(req.userId, recipientId);
    let conversation;
    try { conversation = await Conversation.create({ type: 'direct', dmKey, members: [{ user: req.userId }, { user: recipientId }], createdBy: req.userId }); }
    catch (error) { if (error.code !== 11000) throw error; conversation = await Conversation.findOne({ dmKey }); }
    conversation = await Conversation.findById(conversation._id).populate('members.user', SAFE_USER_FIELDS).populate('admins', SAFE_USER_FIELDS).populate({ path: 'lastMessage', populate: { path: 'sender', select: SAFE_USER_FIELDS } });
    const payload = serializeConversation(conversation, req.userId, online(req));
    conversation.members.forEach((member) => io(req)?.to(`user:${member.user._id}`).emit('conversation:created', serializeConversation(conversation, member.user._id, online(req))));
    return res.status(201).json({ success: true, conversation: payload });
  } catch (error) { return next(error); }
}

async function createGroup(req, res, next) {
  try {
    const groupName = String(req.body.groupName || '').trim();
    if (!groupName || groupName.length > 40) return res.status(400).json({ success: false, message: 'Group name must be between 1 and 40 characters.' });
    const ids = [...new Set((Array.isArray(req.body.memberIds) ? req.body.memberIds : []).map(String))].filter((id) => id !== String(req.userId));
    if (ids.length < 2 || ids.length + 1 > MAX_GROUP_MEMBERS || ids.some((id) => !mongoose.isValidObjectId(id))) return res.status(400).json({ success: false, message: 'Select between 2 and 49 valid people.' });
    const validUsers = await User.find({ _id: { $in: ids } }).select('_id');
    if (validUsers.length !== ids.length) return res.status(400).json({ success: false, message: 'One or more selected users are invalid.' });
    let conversation = await Conversation.create({ type: 'group', groupName, members: [{ user: req.userId }, ...ids.map((user) => ({ user }))], admins: [req.userId], createdBy: req.userId });
    const event = await Message.create({ conversation: conversation._id, sender: req.userId, clientMessageId: `group-created:${conversation._id}`, type: 'event', text: `${req.user.username} created the group`, eventType: 'group_created', eventData: { groupName }, deliveredTo: [req.userId], readBy: [req.userId] });
    await Conversation.updateOne({ _id: conversation._id }, { $set: { lastMessage: event._id, lastMessageAt: event.createdAt } });
    conversation = await Conversation.findById(conversation._id).populate('members.user', SAFE_USER_FIELDS).populate('admins', SAFE_USER_FIELDS).populate({ path: 'lastMessage', populate: { path: 'sender', select: SAFE_USER_FIELDS } });
    conversation.members.forEach((member) => io(req)?.to(`user:${member.user._id}`).emit('conversation:created', serializeConversation(conversation, member.user._id, online(req))));
    return res.status(201).json({ success: true, conversation: serializeConversation(conversation, req.userId, online(req)) });
  } catch (error) { return next(error); }
}

async function requireGroup(req, res) {
  const conversation = await findAuthorizedConversation(req.params.id, req.userId, false);
  if (!conversation) { res.status(404).json({ success: false, message: 'Conversation not found.' }); return null; }
  if (conversation.type !== 'group') { res.status(400).json({ success: false, message: 'This operation is only available for groups.' }); return null; }
  return conversation;
}

async function renameGroup(req, res, next) { try { const conversation = await requireGroup(req, res); if (!conversation) return; if (!isAdmin(conversation, req.userId)) return res.status(403).json({ success: false, message: 'Only group admins can rename this group.' }); const name=String(req.body.groupName||'').trim(); if(!name||name.length>40)return res.status(400).json({success:false,message:'Group name must be between 1 and 40 characters.'}); if(name===conversation.groupName)return res.status(400).json({success:false,message:'Choose a different group name.'}); conversation.groupName=name; await conversation.save(); await groupEvent(req,conversation,'group_renamed',`${req.user.username} renamed the group to ${name}`,{groupName:name}); const full=await populatedConversation(conversation._id); await broadcastConversation(req,full); return res.json({success:true,conversation:serializeConversation(full,req.userId,online(req))}); } catch(error){return next(error);} }

async function addMembers(req,res,next){try{const conversation=await requireGroup(req,res);if(!conversation)return;if(!isAdmin(conversation,req.userId))return res.status(403).json({success:false,message:'Only group admins can add members.'});const current=new Set(conversation.members.map((m)=>String(m.user)));const ids=[...new Set((Array.isArray(req.body.memberIds)?req.body.memberIds:[]).map(String))].filter((id)=>!current.has(id));if(!ids.length||ids.some((id)=>!mongoose.isValidObjectId(id))||current.size+ids.length>MAX_GROUP_MEMBERS)return res.status(400).json({success:false,message:'Choose valid new members. Groups support up to 50 people.'});const users=await User.find({_id:{$in:ids}}).select('username');if(users.length!==ids.length)return res.status(400).json({success:false,message:'One or more users are unavailable.'});conversation.members.push(...ids.map((user)=>({user})));await conversation.save();for(const user of users)await groupEvent(req,conversation,'member_joined',`${user.username} joined the group`,{userId:String(user._id)});const full=await populatedConversation(conversation._id);await broadcastConversation(req,full);for(const id of ids)io(req)?.to(`user:${id}`).emit('conversation:created',serializeConversation(full,id,online(req)));return res.json({success:true,conversation:serializeConversation(full,req.userId,online(req))});}catch(error){return next(error);}}

async function removeMember(req,res,next){try{const conversation=await requireGroup(req,res);if(!conversation)return;if(!isAdmin(conversation,req.userId))return res.status(403).json({success:false,message:'Only group admins can remove members.'});const id=req.params.userId;if(!mongoose.isValidObjectId(id)||String(id)===String(req.userId))return res.status(400).json({success:false,message:'Use Leave group to remove yourself.'});const member=conversation.members.find((m)=>String(m.user)===String(id));if(!member)return res.status(404).json({success:false,message:'Member not found.'});if(conversation.members.length<=2)return res.status(400).json({success:false,message:'A group must keep at least two members.'});const removed=await User.findById(id).select('username');conversation.members=conversation.members.filter((m)=>String(m.user)!==String(id));conversation.admins=conversation.admins.filter((a)=>String(a)!==String(id));await conversation.save();await groupEvent(req,conversation,'member_removed',`${req.user.username} removed ${removed?.username||'a member'}`,{userId:String(id)});io(req)?.in(`user:${id}`).socketsLeave(`conversation:${conversation._id}`);io(req)?.to(`user:${id}`).emit('conversation:removed',{conversationId:String(conversation._id)});const full=await populatedConversation(conversation._id);await broadcastConversation(req,full);return res.json({success:true,conversation:serializeConversation(full,req.userId,online(req))});}catch(error){return next(error);}}

async function leaveGroup(req,res,next){try{const conversation=await requireGroup(req,res);if(!conversation)return;if(conversation.members.length<=2)return res.status(400).json({success:false,message:'A group must keep at least two members.'});const remaining=conversation.members.filter((m)=>String(m.user)!==String(req.userId));if(isAdmin(conversation,req.userId)){const otherAdmins=conversation.admins.filter((a)=>String(a)!==String(req.userId));conversation.admins=otherAdmins.length?otherAdmins:[remaining[0].user];}conversation.members=remaining;await conversation.save();await groupEvent(req,conversation,'member_left',`${req.user.username} left the group`,{userId:String(req.userId)});io(req)?.in(`user:${req.userId}`).socketsLeave(`conversation:${conversation._id}`);io(req)?.to(`user:${req.userId}`).emit('conversation:removed',{conversationId:String(conversation._id)});const full=await populatedConversation(conversation._id);await broadcastConversation(req,full);return res.json({success:true,message:'You left the group.'});}catch(error){return next(error);}}

async function getConversation(req, res, next) {
  try { const conversation = await findAuthorizedConversation(req.params.id, req.userId); if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found.' }); return res.json({ success: true, conversation: serializeConversation(conversation, req.userId, online(req)) }); }
  catch (error) { return next(error); }
}

async function getMessages(req, res, next) {
  try {
    const conversation = await findAuthorizedConversation(req.params.id, req.userId, false); if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found.' });
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 50); const filter = { conversation: conversation._id }; const conditions = [];
    const currentMember = conversation.members.find((member) => String(member.user) === String(req.userId));
    if (currentMember?.clearedAt) conditions.push({ createdAt: { $gt: currentMember.clearedAt } });
    if (req.query.before) { if (!mongoose.isValidObjectId(req.query.before)) return res.status(400).json({ success: false, message: 'Invalid message cursor.' }); const cursor = await Message.findOne({ _id: req.query.before, conversation: conversation._id }).select('createdAt'); if (!cursor) return res.status(400).json({ success: false, message: 'Invalid message cursor.' }); conditions.push({ $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: req.query.before } }] }); }
    if (conditions.length) filter.$and = conditions;
    const messages = await Message.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).populate('sender', SAFE_USER_FIELDS).lean(); const hasMore = messages.length > limit; if (hasMore) messages.pop(); messages.reverse();
    return res.json({ success: true, messages: messages.map(serializeMessage), page: { hasMore, nextCursor: hasMore ? String(messages[0]._id) : null } });
  } catch (error) { return next(error); }
}

async function setMute(req, res, next) {
  try {
    if (typeof req.body.muted !== 'boolean') return res.status(400).json({ success: false, message: 'Muted must be true or false.' });
    const conversation = await findAuthorizedConversation(req.params.id, req.userId, false);
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found.' });
    await Conversation.updateOne({ _id: conversation._id, 'members.user': req.userId }, { $set: { 'members.$.muted': req.body.muted } });
    const full = await populatedConversation(conversation._id); const serialized = serializeConversation(full, req.userId, online(req));
    io(req)?.to(`user:${req.userId}`).emit('conversation:settings', { conversationId: String(conversation._id), muted: serialized.muted });
    return res.json({ success: true, muted: serialized.muted, conversation: serialized });
  } catch (error) { return next(error); }
}

async function clearConversation(req, res, next) {
  try {
    const conversation = await findAuthorizedConversation(req.params.id, req.userId, false);
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found.' });
    const clearedAt = new Date();
    await Conversation.updateOne({ _id: conversation._id, 'members.user': req.userId }, { $set: { 'members.$.clearedAt': clearedAt, 'members.$.unreadCount': 0, 'members.$.lastReadAt': clearedAt, 'members.$.lastReadMessage': null } });
    const full = await populatedConversation(conversation._id); const serialized = serializeConversation(full, req.userId, online(req));
    io(req)?.to(`user:${req.userId}`).emit('conversation:cleared', { conversationId: String(conversation._id), clearedAt: serialized.clearedAt, conversation: serialized });
    return res.json({ success: true, message: 'Chat cleared.', conversation: serialized });
  } catch (error) { return next(error); }
}

function serializeMessage(message) { return { id: String(message._id), conversationId: String(message.conversation), clientMessageId: message.clientMessageId, type: message.type, text: message.text, sender: { id: String(message.sender._id), username: message.sender.username, avatar: message.sender.avatar?.url ? { url: message.sender.avatar.url } : null }, attachments: (message.attachments || []).map((item,index)=>({ id:String(item._id||index), index, url:item.url, resourceType:item.resourceType, originalName:item.originalName, mimeType:item.mimeType, format:item.format, size:item.size, width:item.width, height:item.height })), eventType: message.eventType || null, eventData: message.eventData || null, deliveredTo: (message.deliveredTo || []).map(String), readBy: (message.readBy || []).map(String), createdAt: message.createdAt }; }
module.exports = { listConversations, createDirect, createGroup, getConversation, getMessages, setMute, clearConversation, renameGroup, addMembers, removeMember, leaveGroup, serializeMessage, isAdmin };
