const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { isMember, safeUser, serializeConversation } = require('../utils/conversationHelpers');
const { imageSignature, fileSignature } = require('../middleware/uploadMiddleware');
const { folderFor } = require('../config/cloudinary');
const User = require('../models/User');
const { safeEqual } = require('../middleware/csrfMiddleware');
const { generateToken } = require('../utils/generateToken');
const jwt = require('jsonwebtoken');
const fs = require('node:fs');
const path = require('node:path');

test('DM keys are deterministic and order-independent', () => {
  const first = new mongoose.Types.ObjectId(); const second = new mongoose.Types.ObjectId();
  assert.equal(Conversation.makeDmKey(first, second), Conversation.makeDmKey(second, first));
  assert.match(Conversation.makeDmKey(first, second), /^[a-f0-9]{24}:[a-f0-9]{24}$/);
});

test('membership helper rejects unrelated users', () => {
  const member = new mongoose.Types.ObjectId(); const outsider = new mongoose.Types.ObjectId();
  assert.equal(isMember({ members: [{ user: member }] }, member), true);
  assert.equal(isMember({ members: [{ user: member }] }, outsider), false);
});

test('safe user serialization excludes password and security fields', () => {
  const user = { _id: new mongoose.Types.ObjectId(), username: 'safe_user', password: 'hash', avatar: { url: null }, lastSeen: null };
  assert.deepEqual(Object.keys(safeUser(user)).sort(), ['avatar', 'id', 'lastSeen', 'username']);
  assert.equal('password' in safeUser(user), false);
});

test('conversation serialization exposes current member unread state', () => {
  const me = new mongoose.Types.ObjectId(); const other = new mongoose.Types.ObjectId();
  const conversation = { _id:new mongoose.Types.ObjectId(), type:'direct', members:[{user:{_id:me,username:'me'},unreadCount:4},{user:{_id:other,username:'other'},unreadCount:0}], admins:[], createdBy:me, lastMessage:null, lastMessageAt:new Date() };
  assert.equal(serializeConversation(conversation, me).unreadCount, 4);
  assert.equal(serializeConversation(conversation, me).counterpart.username, 'other');
});

test('conversation member mute and clear fields are backward-compatible', () => {
  const first = new mongoose.Types.ObjectId(); const second = new mongoose.Types.ObjectId();
  const conversation = new Conversation({ type:'direct', dmKey:Conversation.makeDmKey(first,second), members:[{user:first},{user:second}], createdBy:first });
  assert.equal(conversation.members[0].muted, false);
  assert.equal(conversation.members[0].clearedAt, null);
});

test('conversation serialization exposes only the requesting member mute state', () => {
  const me = new mongoose.Types.ObjectId(); const other = new mongoose.Types.ObjectId();
  const base = { _id:new mongoose.Types.ObjectId(), type:'direct', members:[{user:{_id:me,username:'me'},muted:true},{user:{_id:other,username:'other'},muted:false}], admins:[], createdBy:me, lastMessage:null, lastMessageAt:new Date() };
  assert.equal(serializeConversation(base, me).muted, true);
  assert.equal(serializeConversation(base, other).muted, false);
});

test('cleared last message is hidden only for the clearing member', () => {
  const me = new mongoose.Types.ObjectId(); const other = new mongoose.Types.ObjectId(); const sentAt = new Date('2026-01-01T00:00:00Z');
  const conversation = { _id:new mongoose.Types.ObjectId(), type:'direct', members:[{user:{_id:me,username:'me'},clearedAt:new Date('2026-01-02T00:00:00Z')},{user:{_id:other,username:'other'},clearedAt:null}], admins:[], createdBy:me, lastMessage:{_id:new mongoose.Types.ObjectId(),text:'old',type:'text',sender:{_id:other,username:'other'},createdAt:sentAt}, lastMessageAt:sentAt };
  assert.equal(serializeConversation(conversation, me).lastMessage, null);
  assert.equal(serializeConversation(conversation, other).lastMessage.text, 'old');
});

test('conversation controls use real APIs and safe DOM rendering', () => {
  const app = fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const routes = fs.readFileSync(path.join(__dirname,'../routes/conversationRoutes.js'),'utf8');
  const controller = fs.readFileSync(path.join(__dirname,'../controllers/conversationController.js'),'utf8');
  assert.doesNotMatch(app, /not available yet/i);
  assert.doesNotMatch(app, /\.innerHTML\s*=/);
  assert.match(app, /if\s*\(\s*!conversation\.muted\s*\)\s*ChatNotifications\.show/);
  assert.match(routes, /patch\('\/:id\/mute'/);
  assert.match(routes, /post\('\/:id\/clear'/);
  assert.match(controller, /createdAt:\s*\{\s*\$gt:\s*currentMember\.clearedAt/);
  assert.doesNotMatch(controller, /Message\.deleteMany/);
});

test('new post-clear messages become visible to the clearing member', () => {
  const me = new mongoose.Types.ObjectId(); const other = new mongoose.Types.ObjectId(); const clearedAt = new Date('2026-01-02T00:00:00Z'); const sentAt = new Date('2026-01-03T00:00:00Z');
  const conversation = { _id:new mongoose.Types.ObjectId(), type:'direct', members:[{user:{_id:me,username:'me'},clearedAt},{user:{_id:other,username:'other'}}], admins:[], createdBy:me, lastMessage:{_id:new mongoose.Types.ObjectId(),text:'new',type:'text',sender:{_id:other,username:'other'},createdAt:sentAt}, lastMessageAt:sentAt };
  assert.equal(serializeConversation(conversation, me).lastMessage.text, 'new');
});

test('direct profile data is counterpart-only and contains safe fields', () => {
  const me = new mongoose.Types.ObjectId(); const other = new mongoose.Types.ObjectId();
  const conversation = { _id:new mongoose.Types.ObjectId(), type:'direct', members:[{user:{_id:me,username:'me',password:'hidden'}},{user:{_id:other,username:'other',password:'hidden',tokenVersion:4,lastSeen:new Date()}}], admins:[], createdBy:me, lastMessage:null, lastMessageAt:new Date() };
  const profile = serializeConversation(conversation, me).counterpart;
  assert.equal(profile.id, String(other));
  assert.deepEqual(Object.keys(profile).sort(), ['avatar','id','isAdmin','lastReadAt','lastReadMessage','lastSeen','online','username']);
  assert.equal(profile.password, undefined);
  assert.equal(profile.tokenVersion, undefined);
});

test('service worker never intercepts API/socket data and refreshes application code', () => {
  const worker = fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf8');
  assert.match(worker, /halo-static-v6/);
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker, /url\.pathname\.startsWith\('\/socket\.io\/'\)/);
  assert.match(worker, /url\.pathname\.startsWith\('\/js\/'\).*url\.pathname\.startsWith\('\/css\/'\)/);
  assert.match(worker, /cache:'no-cache'/);
  assert.match(worker, /cache:'no-store'/);
  assert.doesNotMatch(worker.match(/const STATIC=\[[^;]+/)?.[0] || '', /app\.html/);
});

test('message model keeps markup as inert text and enforces length', () => {
  const message = new Message({ conversation:new mongoose.Types.ObjectId(), sender:new mongoose.Types.ObjectId(), clientMessageId:'nonce-1', text:'<script>alert(1)</script>' });
  assert.equal(message.text, '<script>alert(1)</script>');
  message.text = 'x'.repeat(2001);
  assert.ok(message.validateSync().errors.text);
});

test('message idempotency index is scoped to sender and client ID', () => {
  const unique = Message.schema.indexes().find(([keys, options]) => keys.sender === 1 && keys.clientMessageId === 1 && options.unique);
  assert.ok(unique);
});

test('media signatures reject spoofed images and accept real headers', () => {
  assert.equal(imageSignature(Buffer.from('not an image')), false);
  assert.equal(imageSignature(Buffer.from([0xff,0xd8,0xff,0x00])), true);
  assert.equal(fileSignature({ mimetype:'application/pdf', originalname:'safe.pdf', buffer:Buffer.from('%PDF-1.7') }), true);
  assert.equal(fileSignature({ mimetype:'application/pdf', originalname:'spoof.pdf', buffer:Buffer.from('MZ executable') }), false);
});

test('Cloudinary folders remain separated by asset purpose', () => {
  assert.equal(folderFor('profile'), 'private-chat/profile-pictures');
  assert.equal(folderFor('image'), 'private-chat/chat-media/images');
  assert.equal(folderFor('file'), 'private-chat/chat-media/files');
  assert.throws(() => folderFor('unknown'));
});

test('safe account serialization excludes password, token version, and Cloudinary public ID', () => {
  const user = new User({ username:'secure_user', password:'not-serialized', tokenVersion:9, avatar:{url:'https://example.test/a',publicId:'secret-id'} });
  const safe=user.toSafeObject(); assert.equal(safe.avatar.publicId,undefined); assert.equal(safe.password,undefined); assert.equal(safe.tokenVersion,undefined);
  assert.deepEqual(safe.settings,{notificationsEnabled:false,notificationSound:true,notificationPreview:true});
});

test('JWT carries the server-checked token version', () => {
  const prior=process.env.JWT_SECRET;process.env.JWT_SECRET='x'.repeat(32);const token=generateToken(new mongoose.Types.ObjectId().toString(),7);assert.equal(jwt.verify(token,process.env.JWT_SECRET).ver,7);process.env.JWT_SECRET=prior;
});

test('CSRF comparison rejects missing and mismatched tokens', () => {
  assert.equal(safeEqual('same-token','same-token'),true);assert.equal(safeEqual('one','two'),false);assert.equal(safeEqual('', ''),false);
});
test('mobile layout guards prevent intrinsic chat overflow', () => {
  const appCss = fs.readFileSync(path.join(__dirname,'../public/css/app.css'),'utf8');
  const componentsCss = fs.readFileSync(path.join(__dirname,'../public/css/components.css'),'utf8');
  assert.match(appCss, /\.chat-view,[\s\S]*\.message-list,[\s\S]*min-width:\s*0/);
  assert.match(appCss, /\.message-bubble\s*\{\s*min-width:\s*0;\s*overflow:\s*hidden/);
  assert.match(componentsCss, /aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(componentsCss, /object-position:\s*center/);
});

test('profile rendering does not interpolate account data through innerHTML', () => {
  const app = fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  assert.doesNotMatch(app, /\.innerHTML\s*=/);
  assert.match(app, /profileAction\("👤",\s*"Username"/);
});