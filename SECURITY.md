# Halo security model

Halo uses bcrypt (cost 12) for passwords and short-lived JWT authentication in an HTTP-only, SameSite=Lax cookie. Production cookies are Secure. JWTs contain a server-checked `tokenVersion`; changing a password increments it, clears the current cookie, disconnects account sockets, and invalidates every prior token.

All conversation, message, upload, download-event, receipt, and group mutation paths resolve the authenticated user on the server and check current membership. Admin-only group operations also check the persisted admin list. Clients cannot choose a sender or deletion `publicId`.

State-changing HTTP requests use a double-submit CSRF token (`chat_csrf` cookie and `X-CSRF-Token` header). Login and registration are rate limited; password and username changes have a stricter limiter. The deployment is same-origin and does not enable wildcard credentialed CORS. `CLIENT_ORIGIN`, when set in production, must be HTTPS.

Uploads are memory-limited, count-limited, extension/MIME checked, signature checked, ownership checked before parsing, and stored as authenticated Cloudinary assets. Cloudinary secrets and asset public IDs are not returned to the browser. Filenames are reduced to a safe basename for display.

User text is rendered with DOM `textContent`; the only `innerHTML` use inserts application-owned SVG icon constants. Helmet keeps CSP enabled and narrowly permits same-origin scripts/connections and Cloudinary images/media. The PWA caches only explicit static assets and excludes `/api/` and `/socket.io/`.

Limitations: this is not a formal audit or certification and does not claim end-to-end encryption. Standard web/PWA apps cannot reliably detect device-level screenshots; Halo records only observable application-controlled downloads.

Report suspected vulnerabilities privately to the project maintainer. Do not include passwords, tokens, private messages, or production credentials in a report.
