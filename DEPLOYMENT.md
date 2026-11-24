# Deploying CarvyPaar

This guide takes CarvyPaar from a fresh Linux server to a production deployment with
HTTPS, backups and monitoring, then covers scaling, upgrades and the security model.

- [1. Architecture](#1-architecture)
- [2. Server setup (first deploy)](#2-server-setup-first-deploy)
- [3. Configuration reference](#3-configuration-reference)
- [4. Operations: upgrades, rollback, retraining](#4-operations)
- [5. Backups and restore](#5-backups-and-restore)
- [6. Monitoring and logs](#6-monitoring-and-logs)
- [7. Scaling](#7-scaling)
- [8. Security model and checklist](#8-security-model-and-checklist)
- [9. Alternatives to a single server](#9-alternatives-to-a-single-server)

---

## 1. Architecture

```
                     ┌──────────────── one server (docker-compose.prod.yml) ────────────────┐
  browser ──HTTPS──▶ │ Caddy :443 ──/api/*, /uploads/*, /api/ws/* ──▶ backend (FastAPI ×N)   │
                     │   (auto TLS)                                    │    │       │       │
                     │        └────────── everything else ──────────▶ frontend   │       │       │
                     │                                                (Next.js)  ▼       ▼       │
                     │                                                    PostgreSQL   Redis     │
                     │  ml (one-shot): trains price_model.joblib ──▶ ml_models volume (ro)     │
                     └──────────────────────────────────────────────────────────────────────────┘
```

* **One origin.** Caddy serves the web app and the API from the same domain, so the refresh
  cookie, CORS and the CSP stay simple, with no mixed content.
* **Only Caddy is exposed** (80/443). Postgres, Redis and the app containers sit on the internal Docker network.
* **Redis** keeps several API workers consistent: WebSocket fan-out (live bids and notifications reach
  users on any worker), shared rate limits and shared login lockouts.
* **Background auction worker** runs inside every API worker. Opening and closing auctions uses
  compare-and-swap updates, so concurrent workers can't double-close an auction or lose a last-second bid.
* **Migrations** run automatically on backend start (`alembic upgrade head` in the entrypoint).
* **The ML model** is trained once by the `ml` job (only if missing) and hot-reloaded by the API when retrained.

## 2. Server setup (first deploy)

**Requirements:** a Linux VM with 2 vCPU / 4 GB RAM / 30 GB disk (Ubuntu 24.04 LTS is a good default),
a domain name, and ports 80/443 open.

```bash
# 1. Docker Engine + compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# 2. Firewall: SSH + web only
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
sudo ufw enable

# 3. Code
sudo mkdir -p /srv/carvypaar && sudo chown $USER /srv/carvypaar
git clone <your-repo-url> /srv/carvypaar && cd /srv/carvypaar

# 4. Configuration
cp .env.production.example .env.production
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(48)); print('POSTGRES_PASSWORD=' + secrets.token_urlsafe(24))"
nano .env.production          # set DOMAIN, ACME_EMAIL and paste the two secrets
chmod 600 .env.production

# 5. DNS: point an A (and AAAA) record for $DOMAIN (and www.$DOMAIN) at the server IP, then:
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# 6. First admin (prompts for a password; never put it in shell history)
docker compose -f docker-compose.prod.yml --env-file .env.production exec backend python -m app.cli create-admin --email you@yourdomain.com --name "Your Name"
```

Caddy obtains the TLS certificate on the first request (give DNS a few minutes to propagate).
Then check:

```bash
curl -s https://$DOMAIN/api/health          # {"status":"ok","database":"ok",...}
curl -sI https://$DOMAIN | grep -i strict    # HSTS present
```

> **Demo data in production:** don't run `seed` on a real deployment. It creates demo sellers with a published password.

## 3. Configuration reference

The backend refuses to start in production with unsafe settings: a weak `SECRET_KEY`,
`COOKIE_SECURE=false`, non-HTTPS or wildcard CORS origins, or a SQLite database.

| Variable | Default | Notes |
|----------|---------|-------|
| `SECRET_KEY` | dev placeholder | 32+ random chars. Rotating it signs everyone out |
| `DATABASE_URL` | SQLite file | Set by compose in prod (`postgresql+psycopg://…`) |
| `REDIS_URL` | unset | Enables cross-worker WebSockets, rate limits and lockouts |
| `ADMIN_EMAILS` | unset | Comma-separated emails promoted to admin when they sign in through Clerk |
| `COMMISSION_PCT` | 2 | Marketplace commission (%) shown on the admin dashboard |
| `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | unset | Clerk API keys; required for sign-in. The website needs the publishable key too, as `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (build-time) |
| `CORS_ORIGINS` | localhost:3000 | Comma-separated, `https://` only in production |
| `COOKIE_SECURE` | false | **true** in production (compose sets it) |
| `REQUIRE_LISTING_APPROVAL` | true | New listings wait for admin approval |
| `ACCESS_TOKEN_EXPIRE_MINUTES` / `REFRESH_TOKEN_EXPIRE_DAYS` | 15 / 7 | |
| `LOGIN_LOCKOUT_ATTEMPTS` / `LOGIN_LOCKOUT_MINUTES` | 5 / 15 | Per email + IP |
| `RATE_LIMIT_DEFAULT` | 200/minute | Per IP. Auth routes have tighter limits |
| `MAX_UPLOAD_MB` / `MAX_IMAGES_PER_LISTING` | 8 / 10 | The upload request cap is derived from these |
| `MAX_JSON_BODY_KB` | 512 | Larger non-upload bodies get 413 |
| `WEB_CONCURRENCY` | 1 (2 in prod compose) | API worker processes. More than 1 requires `REDIS_URL` |
| `FORWARDED_ALLOW_IPS` | 127.0.0.1 | Proxies trusted for `X-Forwarded-For`. `*` only when the API isn't publicly reachable |
| `ANTI_SNIPE_WINDOW_SECONDS` / `_EXTENSION_SECONDS` | 120 / 120 | |
| `DEAL_GREAT_BELOW_PCT` / `DEAL_OVERPRICED_ABOVE_PCT` | 10 / 12 | Price badge thresholds |
| `PRICE_MODEL_PATH` | `ml/models/price_model.joblib` | Set by compose |
| `NEXT_PUBLIC_API_URL` | http://localhost:8000 | **Build-time** for the frontend image |

## 4. Operations

All commands below assume `alias dc='docker compose -f docker-compose.prod.yml --env-file .env.production'`.

**Deploy an update**
```bash
./deploy/backup.sh                 # always back up first
git pull
dc up -d --build                   # rebuilds changed images; migrations run on backend start
dc ps && curl -s https://$DOMAIN/api/health
```

**Roll back**
```bash
git checkout <previous-tag>
dc up -d --build
# If the bad release ran a migration that must be undone:
dc exec backend alembic downgrade -1
```
Prefer tagging releases (`git tag v1.4.0`) so rollbacks are one checkout away. Every migration
in this repo has a `downgrade()`, and CI runs upgrade, then downgrade, then upgrade on PostgreSQL.

**Retrain the price model** (hot-reloaded, no restart)
```bash
dc exec backend python -m app.cli export-training-data   # real listings -> ml_data volume
dc run --rm ml python scripts/train.py
dc logs backend | grep "Loaded price model"
```

**Admin tasks**
```bash
dc exec backend python -m app.cli create-admin --email ops@yourdomain.com   # create or promote
dc exec db psql -U carvypaar -d carvypaar                                    # SQL shell (careful)
```

## 5. Backups and restore

`deploy/backup.sh` writes a compressed `pg_dump` plus a tarball of uploaded photos to
`backups/<timestamp>/`, prunes old ones, and fails loudly on an empty dump.

```bash
chmod +x deploy/backup.sh
crontab -e
# 15 3 * * *  cd /srv/carvypaar && ./deploy/backup.sh >> backups/backup.log 2>&1
```

**Copy backups off the server.** A backup on the same disk isn't a backup. For example,
`rclone sync backups remote:carvypaar-backups` to S3, Backblaze B2 or similar, ideally with object versioning.

**Test restores** (quarterly at least), using the restore commands in the script header, on a
scratch server. Lost data you can't restore was never backed up.

What isn't backed up, and doesn't need to be: Redis (cache, rate-limit counters, transient
pub/sub), the ML model (retrainable in about 30 s), and Caddy certificates (re-issued automatically).

## 6. Monitoring and logs

* **Health:** `GET /api/health` returns app and database status. Point an uptime monitor
  (UptimeRobot, Better Stack, a cron curl) at `https://$DOMAIN/api/health` and alert on non-200 or `"database":"unavailable"`.
* **Container health:** the backend image has a Docker `HEALTHCHECK`, and `dc ps` shows `healthy`.
* **Logs:** `dc logs -f backend caddy`. Every API request writes one access-log line with method,
  path, status, duration and a **request ID** (also returned as the `X-Request-ID` header).
  Ask users for that ID when they report a problem. Logs never contain bodies, tokens or query strings.
  Caddy logs JSON to stdout. Forward Docker logs to Loki, CloudWatch or Datadog as needed.
* **Disk:** watch the `pgdata` and `uploads` volumes (`docker system df -v`).
* **Errors:** the API returns a generic 500 to clients and logs the full traceback server-side.
  To add Sentry: `pip install sentry-sdk[fastapi]` and call `sentry_sdk.init(dsn=...)` at the top of `app/main.py`.

## 7. Scaling

| Stage | What to do |
|-------|------------|
| One server, a few thousand users | The default prod compose: 2 API workers + Redis |
| More API throughput | Raise `WEB_CONCURRENCY` (≈ CPU cores). Redis keeps WebSockets, rate limits and lockouts consistent across workers |
| Several API servers | Run the backend on N hosts behind a load balancer, all pointing at the same Postgres + Redis. Sticky sessions aren't required: WebSocket events fan out through Redis |
| Database | Managed PostgreSQL (RDS, Cloud SQL, Neon) with automated backups and PITR, plus pgbouncer if connections climb |
| Photos | Implement `StorageBackend` for S3/R2/Cloudinary in `app/services/storage.py` (three methods) and serve through a CDN. Routes don't change |
| Frontend | Next.js scales horizontally as is, or deploy it to Vercel with `NEXT_PUBLIC_API_URL` pointing at the API domain. You'd then need to set `CORS_ORIGINS` |

Already safe for scale-out: bid concurrency (optimistic compare-and-swap), auction closing
(idempotent, guarded by `end_time` and `bid_count`), atomic model hot-swap, and WebSocket fan-out.

## 8. Security model and checklist

**Built in**

| Area | Measures |
|------|----------|
| Authentication | bcrypt (cost 12). 15-minute access JWT kept in memory only. Rotating 7-day refresh token in an `httpOnly; Secure; SameSite=Lax` cookie scoped to `/api/auth`. Refresh-token reuse detection revokes the whole session family. `iss`/`aud`/`exp` verified and algorithm pinned (blocks `alg=none`) |
| Brute force | Per-IP rate limits (login 10/min, register 5/min), per email+IP lockout (5 failures for 15 min), constant-time "user not found" path |
| Passwords | 8–72 bytes, letters + digits, common-password denylist |
| Authorization | Roles enforced server-side on every route. Hidden listings return 404 (not 403) so they can't be probed. Admins can't lock themselves out |
| Input | Pydantic validation everywhere, bounded pagination and search, `LIKE` wildcards escaped, ORM-only queries (no SQL built from user input) |
| Uploads | Content-type allow-list, size caps enforced before parsing (413), Pillow decodes and verifies, pixel cap blocks decompression bombs, re-encoding to WebP strips EXIF/GPS and payloads, random file names, path-traversal-proof storage, served with `CSP: sandbox` |
| Transport and headers | HSTS. CSP on both the web app and the API. `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP |
| CORS / CSRF | Explicit origin list (HTTPS-only in prod). The refresh cookie is `SameSite=Lax` and only accepted on POST |
| WebSockets | Origin check (blocks cross-site WebSocket hijacking), auth in the first message (never in the URL), 4 KB frame cap, per-socket bid rate limit |
| Secrets | Env-only, refused if weak in production, `.env*` git-ignored |
| Supply chain | `pip-audit` and `npm audit` in CI. The Next.js-bundled PostCSS is overridden to a patched version |
| Containers | Non-root users, minimal slim/alpine images, no published DB/Redis ports |

**Known trade-offs**

* **CSP `script-src 'unsafe-inline'`.** Next.js needs inline bootstrap scripts. A nonce-based
  CSP (via middleware) would remove this, at the cost of making every page render dynamically.
* **Registration reveals whether an email exists** (409). That's standard UX for a marketplace.
  If it matters, switch to a "check your inbox" flow (needs email sending).
* **No email verification or password reset yet.** `is_verified` exists in the schema. Add an email
  provider (SES, Postmark) and token-based flows before a public launch.
* **Plain-HTTP testing:** the production CSP includes `upgrade-insecure-requests`, so test production
  builds on `localhost` or over HTTPS, not on plain-HTTP LAN IPs.

**Go-live checklist**

- [ ] `.env.production` filled in with fresh secrets and `chmod 600`
- [ ] DNS points at the server, and `https://$DOMAIN` shows a valid certificate
- [ ] `curl -s https://$DOMAIN/api/health` returns `"database":"ok"`
- [ ] Admin account created with a strong, unique password. **No demo data seeded**
- [ ] `https://$DOMAIN/docs` returns 404 (docs are disabled in production)
- [ ] Backups scheduled, copied off-site, and **one restore tested**
- [ ] Uptime monitor on `/api/health` with alerting
- [ ] Firewall allows only 22/80/443, and SSH uses keys only (`PasswordAuthentication no`)
- [ ] OS security updates enabled (`unattended-upgrades`)
- [ ] CI green (tests, Postgres migration check, dependency audit)

## 9. Alternatives to a single server

* **Managed containers** (Render, Railway, Fly.io, ECS/Cloud Run): deploy `backend/`, `frontend/`
  and a managed Postgres + Redis. Run `ml` as a one-off job and mount or copy the model into the
  backend (or bake it into the image in CI). Set `FORWARDED_ALLOW_IPS` to the platform's proxy range.
* **Frontend on Vercel + API elsewhere:** set `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`,
  `CORS_ORIGINS=https://yourdomain.com`, and keep both on the same registrable domain so the
  `SameSite=Lax` refresh cookie still works.
