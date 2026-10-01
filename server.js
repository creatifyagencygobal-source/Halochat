require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { connectDatabase, disconnectDatabase } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const { Server } = require('socket.io');
const { initializeSocket } = require('./socket');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { requireCsrf } = require('./middleware/csrfMiddleware');

function validateEnvironment() {
  const missing = ['MONGODB_URI', 'JWT_SECRET'].filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters.');
  if (process.env.NODE_ENV === 'production' && process.env.CLIENT_ORIGIN && !/^https:\/\//.test(process.env.CLIENT_ORIGIN)) throw new Error('CLIENT_ORIGIN must use HTTPS in production.');
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
app.use(helmet({ contentSecurityPolicy: { directives: { 'script-src': ["'self'"], 'connect-src': ["'self'"], 'img-src': ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'], 'media-src': ["'self'", 'https://res.cloudinary.com'], 'worker-src': ["'self'"] } } }));
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(cookieParser());
app.use(requireCsrf);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/media', mediaRoutes);
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/api', notFound);
app.use(errorHandler);

let server;
async function start() {
  validateEnvironment();
  await connectDatabase();
  const port = Number(process.env.PORT) || 3000;
  server = http.createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 100000, cors: false });
  const presence = initializeSocket(io);
  app.set('io', io);
  app.set('presence', presence);
  server.listen(port, () => console.log(`Server running at http://localhost:${port}`));
}
async function shutdown(signal) {
  console.log(`${signal} received. Shutting down.`);
  if (server) await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase(); process.exit(0);
}
if (require.main === module) {
  start().catch((error) => { console.error(`Startup failed: ${error.message}`); process.exit(1); });
  ['SIGINT', 'SIGTERM'].forEach((signal) => process.on(signal, () => shutdown(signal)));
}
module.exports = { app, start, validateEnvironment };
