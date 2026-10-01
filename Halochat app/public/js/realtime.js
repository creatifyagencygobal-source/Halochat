window.Realtime = (() => {
  const socket = io({ autoConnect: false, transports: ['websocket', 'polling'] });
  const listeners = new Map();
  const notify = (event, payload) => (listeners.get(event) || new Set()).forEach((handler) => handler(payload));
  ['conversation:created','conversation:updated','conversation:removed','conversation:settings','conversation:cleared','message:new','message:delivered','message:read','typing:start','typing:stop','presence:update','profile:updated','attachment:downloaded'].forEach((event) => socket.on(event, (payload) => notify(event, payload)));
  socket.on('connect', () => notify('connection', { state: 'connected' }));
  socket.on('disconnect', () => notify('connection', { state: 'offline' }));
  socket.io.on('reconnect_attempt', () => notify('connection', { state: 'reconnecting' }));
  socket.io.on('reconnect', () => notify('connection', { state: 'connected', reconnected: true }));
  socket.on('connect_error', (error) => notify('connection', { state: 'offline', message: error.message }));
  const emitAck = (event, payload, timeout = 8000) => new Promise((resolve, reject) => socket.timeout(timeout).emit(event, payload, (error, response) => error ? reject(new Error('Realtime request timed out.')) : response?.success ? resolve(response) : reject(new Error(response?.message || 'Realtime request failed.'))));
  return {
    connect: () => socket.connect(),
    on(event, handler) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(handler); return () => listeners.get(event)?.delete(handler); },
    join: (conversationId) => emitAck('conversation:join', { conversationId }),
    leave: (conversationId) => socket.emit('conversation:leave', { conversationId }),
    sendMessage: (payload) => emitAck('message:send', payload),
    delivered: (messageId) => socket.emit('message:delivered', { messageId }),
    read: (conversationId, messageId) => socket.emit('conversation:read', { conversationId, messageId }),
    typing: (conversationId, active) => socket.emit(active ? 'typing:start' : 'typing:stop', { conversationId }),
  };
})();
