const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { findAuthorizedConversation, SAFE_USER_FIELDS, serializeConversation } = require('../utils/conversationHelpers');
const { serializeMessage } = require('../controllers/conversationController');
const { COOKIE_NAME } = require('../utils/generateToken');

function parseCookies(header = '') { const result={}; for(const part of header.split(';')){const index=part.indexOf('=');if(index<1)continue;try{result[decodeURIComponent(part.slice(0,index).trim())]=decodeURIComponent(part.slice(index+1).trim());}catch{}}return result; }
function safeAck(ack, payload) { if (typeof ack === 'function') ack(payload); }

function createPresence(io) {
  const connections = new Map();
  function onlineIds() { return new Set(connections.keys()); }
  function add(userId, socketId) { const id = String(userId); const sockets = connections.get(id) || new Set(); const becameOnline = sockets.size === 0; sockets.add(socketId); connections.set(id, sockets); return becameOnline; }
  function remove(userId, socketId) { const id = String(userId); const sockets = connections.get(id); if (!sockets) return false; sockets.delete(socketId); if (sockets.size) return false; connections.delete(id); return true; }
  async function broadcast(userId, online, lastSeen = null) { const related = await Conversation.distinct('members.user', { 'members.user': userId }); const rooms = related.filter((id) => String(id) !== String(userId)).map((id) => `user:${id}`); if (rooms.length) io.to(rooms).emit('presence:update', { userId: String(userId), online, lastSeen }); }
  return { onlineIds, add, remove, broadcast };
}

function eventLimiter(socket, event, limit, windowMs) {
  socket.data.limits ||= new Map(); const now = Date.now(); const record = socket.data.limits.get(event) || { count: 0, reset: now + windowMs }; if (now > record.reset) { record.count = 0; record.reset = now + windowMs; } record.count += 1; socket.data.limits.set(event, record); return record.count <= limit;
}

function initializeSocket(io) {
  const presence = createPresence(io);
  io.use(async (socket, next) => {
    try {
      const token = parseCookies(socket.handshake.headers.cookie)[COOKIE_NAME]; if (!token) return next(new Error('Authentication required.'));
      const payload = jwt.verify(token, process.env.JWT_SECRET); const user = await User.findById(payload.sub).select('username avatar lastSeen +tokenVersion'); if (!user || payload.ver !== user.tokenVersion) return next(new Error('Authentication required.'));
      socket.userId = String(user._id); socket.safeUser = { id: socket.userId, username: user.username, avatar: user.avatar?.url ? user.avatar : null }; return next();
    } catch { return next(new Error('Authentication required.')); }
  });

  io.on('connection', async (socket) => {
    socket.join(`user:${socket.userId}`); const becameOnline = presence.add(socket.userId, socket.id); if (becameOnline) await presence.broadcast(socket.userId, true);

    socket.on('conversation:join', async ({ conversationId } = {}, ack) => {
      if (!eventLimiter(socket, 'join', 40, 60000)) return safeAck(ack, { success: false, message: 'Too many requests.' });
      const conversation = await findAuthorizedConversation(conversationId, socket.userId, false); if (!conversation) return safeAck(ack, { success: false, message: 'Conversation unavailable.' });
      await socket.join(`conversation:${conversationId}`); return safeAck(ack, { success: true });
    });
    socket.on('conversation:leave', ({ conversationId } = {}) => { if (conversationId) socket.leave(`conversation:${conversationId}`); });

    socket.on('message:send', async (payload = {}, ack) => {
      try {
        if (!eventLimiter(socket, 'message', 60, 60000)) return safeAck(ack, { success: false, message: 'You are sending messages too quickly.' });
        const { conversationId, clientMessageId } = payload; const text = String(payload.text || '').trim();
        if (!clientMessageId || String(clientMessageId).length > 100 || !text || text.length > 2000) return safeAck(ack, { success: false, message: 'Message must be between 1 and 2000 characters.' });
        const conversation = await findAuthorizedConversation(conversationId, socket.userId, false); if (!conversation) return safeAck(ack, { success: false, message: 'Conversation unavailable.' });
        let message; let created = true;
        try { message = await Message.create({ conversation: conversation._id, sender: socket.userId, clientMessageId, type: 'text', text, deliveredTo: [socket.userId], readBy: [socket.userId] }); }
        catch (error) { if (error.code !== 11000) throw error; created = false; message = await Message.findOne({ sender: socket.userId, clientMessageId }); }
        if (!created) { message = await Message.findById(message._id).populate('sender', SAFE_USER_FIELDS); return safeAck(ack, { success: true, message: serializeMessage(message), duplicate: true }); }
        await Conversation.updateOne({ _id: conversation._id }, { $set: { lastMessage: message._id, lastMessageAt: message.createdAt }, $inc: { 'members.$[recipient].unreadCount': 1 } }, { arrayFilters: [{ 'recipient.user': { $ne: message.sender } }] });
        message = await Message.findById(message._id).populate('sender', SAFE_USER_FIELDS); const serialized = serializeMessage(message); const userRooms = conversation.members.map((member) => `user:${member.user}`); io.to([`conversation:${conversationId}`, ...userRooms]).emit('message:new', serialized);
        return safeAck(ack, { success: true, message: serialized });
      } catch (error) { console.error('message:send failed', error); return safeAck(ack, { success: false, message: 'Message could not be sent.' }); }
    });

    socket.on('message:delivered', async ({ messageId } = {}, ack) => {
      if (!eventLimiter(socket, 'delivered', 120, 60000)) return safeAck(ack, { success: false });
      const message = await Message.findById(messageId); if (!message) return safeAck(ack, { success: false }); const conversation = await findAuthorizedConversation(message.conversation, socket.userId, false); if (!conversation) return safeAck(ack, { success: false });
      await Message.updateOne({ _id: message._id }, { $addToSet: { deliveredTo: socket.userId } }); io.to(`conversation:${message.conversation}`).emit('message:delivered', { messageId: String(message._id), userId: socket.userId }); safeAck(ack, { success: true });
    });

    socket.on('conversation:read', async ({ conversationId, messageId } = {}, ack) => {
      if (!eventLimiter(socket, 'read', 60, 60000)) return safeAck(ack, { success: false }); const conversation = await findAuthorizedConversation(conversationId, socket.userId, false); if (!conversation) return safeAck(ack, { success: false });
      if (messageId && (!require('mongoose').isValidObjectId(messageId) || !(await Message.exists({ _id: messageId, conversation: conversationId })))) return safeAck(ack, { success: false, message: 'Invalid read position.' });
      const readAt = new Date(); const update = { 'members.$.unreadCount': 0, 'members.$.lastReadAt': readAt }; if (messageId) update['members.$.lastReadMessage'] = messageId;
      await Conversation.updateOne({ _id: conversationId, 'members.user': socket.userId }, { $set: update }); io.to(`conversation:${conversationId}`).emit('message:read', { conversationId, userId: socket.userId, messageId: messageId || null, readAt }); safeAck(ack, { success: true });
    });

    for (const event of ['typing:start', 'typing:stop']) socket.on(event, async ({ conversationId } = {}) => { if (!eventLimiter(socket, 'typing', 40, 10000)) return; const conversation = await findAuthorizedConversation(conversationId, socket.userId, false); if (!conversation) return; socket.to(`conversation:${conversationId}`).emit(event, { conversationId, user: socket.safeUser }); });

    socket.on('disconnect', async () => { if (!presence.remove(socket.userId, socket.id)) return; const lastSeen = new Date(); await User.updateOne({ _id: socket.userId }, { $set: { lastSeen } }); await presence.broadcast(socket.userId, false, lastSeen); });
  });
  return presence;
}

module.exports = { initializeSocket };
