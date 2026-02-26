# Decade server – security setup

## Password (backend check)

-  Login password is **checked on the server** only. Set the expected password via env:
   -  **`LOGIN_PASSWORD`** – plain password (hashed with scrypt on the server; never stored in code).
-  Optional: **`LOGIN_SALT`** – salt for hashing (defaults to a fixed value; override for extra security).
-  If `LOGIN_PASSWORD` is not set, all login attempts are rejected.

Example:

```bash
LOGIN_PASSWORD=yourSecretPassword node server.js
```

## Encrypted communication (HTTPS)

All traffic should use **HTTPS** so passwords and scores are encrypted in transit.

### Option 1: Certificates on this server

1. Create a `cert` folder next to `server.js`.
2. Put your private key and certificate there:
   -  `cert/key.pem`
   -  `cert/cert.pem`
3. Or set env vars:
   -  **`SSL_KEY_PATH`** – path to key file
   -  **`SSL_CERT_PATH`** – path to cert file

Then run the server; it will use HTTPS on the same port.

### Option 2: Reverse proxy (recommended in production)

Run the app over HTTP and put a reverse proxy (e.g. nginx, Caddy, or your host’s proxy) in front that terminates TLS. Then:

-  Users open `https://yourdomain.com` (proxy handles TLS).
-  Proxy forwards to `http://localhost:3000` (or your `PORT`).
-  No certs needed in Node; set **`LOGIN_PASSWORD`** and use HTTPS at the proxy.

### Local development

-  Without certs, the server runs on **HTTP** and logs a warning.
-  For local HTTPS, generate a self-signed cert, e.g.:
   ```bash
   mkdir -p cert && openssl req -x509 -newkey rsa:2048 -keyout cert/key.pem -out cert/cert.pem -days 365 -nodes -subj "/CN=localhost"
   ```
-  Then open `https://localhost:3000` (browser will warn about self-signed cert; accept for testing).
