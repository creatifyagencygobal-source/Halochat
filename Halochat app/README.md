# Halo — private realtime chat

Halo is a mobile-first glassmorphism chat MVP with real accounts, direct messages, groups, realtime delivery/read state, Cloudinary attachments, profile/security settings, browser notifications, and an installable PWA shell.

## Stack and architecture

- Node.js 18+, Express, Mongoose/MongoDB, Socket.IO
- bcrypt passwords; versioned JWT in HTTP-only cookie; double-submit CSRF protection
- Cloudinary authenticated assets through server-owned upload/delete helpers
- Vanilla HTML/CSS/JavaScript frontend; no production mock-data dependency
- Models: `User`, `Conversation`, and paginated `Message`; direct conversations use a unique deterministic `dmKey`

```text
config/       MongoDB and Cloudinary adapters
controllers/ auth, users, conversations, media
middleware/  auth, CSRF, membership, upload validation, errors
models/      persisted users, conversations, messages
routes/      authenticated REST surface
socket/      authenticated realtime events and presence
public/      responsive UI, PWA manifest/service worker
test/        database-independent business/security tests
```

## Setup

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:3000`. For production-style execution use `npm start`. Validate with `npm run check` and `npm test`.

## Environment

| Variable | Requirement |
| --- | --- |
| `PORT` | Optional; defaults to 3000 |
| `NODE_ENV` | Set to `production` in production |
| `MONGODB_URI` | Required; local MongoDB or Atlas URI |
| `JWT_SECRET` | Required, random, at least 32 characters |
| `JWT_EXPIRES_IN` | Optional duration such as `7d` |
| `CLIENT_ORIGIN` | Optional production HTTPS canonical origin |
| `CLOUDINARY_CLOUD_NAME` | Required for media |
| `CLOUDINARY_API_KEY` | Required for media |
| `CLOUDINARY_API_SECRET` | Required for media; server-only |

For Atlas, create a least-privilege database user, permit the deployment network, and use its `mongodb+srv://` URI. For Cloudinary, create credentials and keep all three variables out of source control. Never commit `.env`.

## Product behavior

Registration/login, user search, unique DMs, groups, text/media messages, typing, presence, unread counts, cursor pagination, delivery/read receipts, avatar changes, download events, username changes, password changes, account notification preferences, themes, and logout are wired to server state. Group admins may rename and add/remove members; members may leave. If the final admin leaves, admin ownership transfers deterministically to the first remaining member.

Password changes increment `tokenVersion`, invalidate existing HTTP and Socket.IO sessions, and require login again. Username changes require the current password. Notification permission remains browser-controlled even when the account preference is enabled; preview and sound settings follow the account.

The service worker uses versioned static caching only. It never caches `/api/` or `/socket.io/`, so private chat responses cannot cross accounts through a shared cache. Offline sending is not claimed or queued.

## Deployment

Use HTTPS, a persistent Node host with WebSocket support, MongoDB Atlas (or compatible MongoDB), and Cloudinary. Preserve sticky sessions or deploy a Socket.IO adapter when running multiple Node instances; in-memory presence is single-process. Terminate TLS at a trusted proxy, forward WebSocket upgrades, set `NODE_ENV=production`, and serve frontend/API from the same origin. Startup fails when MongoDB/JWT requirements are unsafe or missing. SIGINT/SIGTERM trigger graceful HTTP and MongoDB shutdown.

See [SECURITY.md](SECURITY.md) for the security model and [FINAL_TEST_REPORT.md](FINAL_TEST_REPORT.md) for verified versus unverified behavior.

## Known limitations

No calls, stories, posts, background push service, end-to-end encryption claim, or full offline messaging. Standard web/PWA applications cannot reliably detect device-level screenshots across browsers and operating systems. Halo records only observable application-controlled actions such as supported attachment downloads.
