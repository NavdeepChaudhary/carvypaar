# CarVypaar

A car marketplace for enthusiasts: buy, sell and **auction** cars, with an **AI price predictor**.

| Layer     | Stack |
|-----------|-------|
| Backend   | Python 3.11+, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2 |
| Database  | PostgreSQL (Docker) · SQLite (local dev) |
| Auth      | Clerk sign-in, then JWT access + rotating refresh tokens (httpOnly cookie), roles: buyer / seller / admin |
| Frontend  | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Framer Motion |
| ML        | scikit-learn gradient boosting + conformal price ranges, pandas, joblib |
| DevOps    | Docker + docker-compose |

## Project structure

```
CARVYPAAR/
├── docker-compose.yml        # db + backend + frontend
├── .env.example              # copy to .env (shared by compose and local backend)
├── backend/
│   ├── Dockerfile, docker-entrypoint.sh (runs migrations on boot)
│   ├── requirements.txt, requirements-dev.txt, pytest.ini, alembic.ini
│   ├── alembic/              # migrations (versions/…initial_schema.py)
│   ├── app/
│   │   ├── main.py           # app factory: CORS, rate limits, security headers, routers
│   │   ├── cli.py            # `python -m app.cli create-admin`
│   │   ├── core/             # config, security (JWT/bcrypt), rate_limit
│   │   ├── db/               # Base, naming convention, engine/session
│   │   ├── models/           # User, RefreshToken, Listing, ListingImage, Favorite,
│   │   │                     # Auction, Bid, Offer, Message, Notification, enums
│   │   ├── schemas/          # Pydantic request/response models
│   │   ├── services/         # auth_service, storage (Local → S3/Cloudinary-swappable)
│   │   └── api/              # deps (current user, role guards), routes/
│   └── tests/                # pytest suite
├── frontend/
│   ├── Dockerfile            # standalone Next.js build
│   └── src/
│       ├── app/              # /, /login, /register, /profile, 404
│       ├── components/       # Navbar, Hero, CountUp, ThemeToggle, ui/ (Button, Input, Skeleton…)
│       ├── context/          # AuthContext, ThemeContext
│       └── lib/              # api client (auto-refresh), types, validation
└── ml/                       # price model: data prep, training, evaluation (see ml/README.md)
```

## Quick start: Docker (PostgreSQL)

```bash
cp .env.example .env          # then set SECRET_KEY and POSTGRES_PASSWORD
docker compose up --build
```

- Web: http://localhost:3000
- API docs: http://localhost:8000/docs
- Create an admin: `docker compose exec backend python -m app.cli create-admin --email you@example.com --name "Admin"`
- Demo data: `docker compose exec backend python -m app.cli seed --count 36`

## Quick start: local dev (SQLite, no Docker)

**Backend** (Windows PowerShell shown; on macOS/Linux use `source .venv/bin/activate`):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
alembic upgrade head                      # creates backend/carvypaar.db
python -m app.cli create-admin --email admin@example.com --name "Admin"
python ..\ml\scripts\train.py             # train the AI price model (~25 s); do this before seeding
python ..\ml\scripts\download_data.py    # real CarDekho data (no Kaggle account needed for this public set)
python -m app.cli seed --count 36         # OPTIONAL demo sellers + listings (password DemoPass123)
python -m app.cli seed-auctions --count 6 # add demo auctions to an existing database
python -m app.cli reprice-demo            # re-price demo listings seeded before the model existed
uvicorn app.main:app --reload --port 8000
```

**Frontend** (new terminal):

```powershell
cd frontend
npm install
copy .env.example .env.local
npm run dev                               # http://localhost:3000
```

## Tests

```bash
cd backend
pytest --cov=app      # 147 tests, 95% coverage: auth, listings, auctions, WebSockets, ML, admin, security
python scripts/e2e_auction.py   # live end-to-end auction check (needs the API running)
cd ../ml && pytest              # 6 ML pipeline tests
cd ../frontend && npm test      # 20 unit tests (Vitest)
pip-audit -r requirements.txt && npm audit --omit=dev   # dependency CVE scan
cd ../frontend
npm run typecheck && npm run build
```

## API (Phase 1)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET    | `/api/health` | – | liveness + DB check |
| POST   | `/api/auth/clerk` | Clerk session token | sign in (creates or links the account); 20/min per IP |
| POST   | `/api/auth/refresh` | cookie or body | rotates refresh token |
| POST   | `/api/auth/logout` | cookie or body | revokes refresh token |
| GET    | `/api/users/me` | Bearer | own profile |
| PATCH  | `/api/users/me` | Bearer | name, phone, bio, location |
| GET    | `/api/users/{id}` | – | public profile (no email/phone) |
| POST   | `/api/users/me/become-seller` | Bearer | buyer → seller |
| GET    | `/api/users/me/listings` · `/me/favorites` | Bearer | my garage |

## API (Phase 2: listings)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET    | `/api/listings` | optional | filters: `q, make, model, min/max_price, min/max_year, max_mileage, fuel_type, transmission, body_type, condition, location, seller_id`; `sort`; `page`, `page_size` (≤48) |
| GET    | `/api/listings/makes` | – | makes → models for dropdowns |
| GET    | `/api/listings/{id}` | optional | hidden listings only visible to owner/admin |
| POST   | `/api/listings` | seller/admin | 20/hour |
| PATCH  | `/api/listings/{id}` | owner/admin | partial; `status`: active / inactive / sold |
| DELETE | `/api/listings/{id}` | owner/admin | also deletes photos |
| POST   | `/api/listings/{id}/images` | owner/admin | multipart `files`; max 10 per listing, 8 MB each |
| PUT    | `/api/listings/{id}/images/order` | owner/admin | `{image_ids: [...]}`; first is the cover |
| DELETE | `/api/listings/{id}/images/{image_id}` | owner/admin | |
| POST/DELETE | `/api/listings/{id}/favorite` | Bearer | idempotent |
| POST   | `/api/listings/{id}/offers` | Bearer | "Make offer"; notifies seller |
| POST   | `/api/listings/{id}/messages` | Bearer | "Contact seller"; notifies seller |
| GET    | `/api/offers?box=received\|sent` | Bearer | |
| PATCH  | `/api/offers/{id}` | Bearer | seller: accepted/rejected · buyer: withdrawn |
| GET    | `/api/messages` · POST `/{id}/reply` · POST `/{id}/read` | Bearer | |
| GET    | `/api/notifications` · POST `/{id}/read` · POST `/read-all` | Bearer | |

`REQUIRE_LISTING_APPROVAL` (default `true`) makes new listings start as `pending` until an admin
approves them at `/admin`. Admins' own listings publish directly. Set it to `false` to publish instantly.

## Auctions (Phase 3)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/listings/{id}/auction` | owner (seller/admin) | `starting_price, bid_increment, reserve_price?, start_time?, end_time` |
| GET  | `/api/auctions?tab=live\|upcoming\|ended` | optional | live = ending soonest first |
| GET  | `/api/auctions/{id}` | optional | state, listing, last 20 bids, `my_max_bid` |
| GET  | `/api/auctions/{id}/bids` | optional | bid history |
| POST | `/api/auctions/{id}/bids` | Bearer | `{amount}`: HTTP fallback, 30/min |
| POST | `/api/auctions/{id}/cancel` | seller | only while there are no bids |
| GET  | `/api/users/me/bids` | Bearer | outcome: leading / outbid / won / lost / upcoming / cancelled |
| WS   | `/api/ws/auctions/{id}` | auth message to bid | events: `snapshot`, `bid`, `status`, `bid_ok`, `error` |
| WS   | `/api/ws/notifications` | auth message first | events: `notification` |

**WebSocket protocol.** Send `{"type":"auth","token":"<access>"}` as a message; tokens are never
put in the URL, where they'd end up in logs. Then send `{"type":"bid","amount":1250000,"ref":"x1"}`;
`ref` is echoed back in `bid_ok` or `error`. Send `{"type":"ping"}` to get a `pong`.

**Rules**
- The first bid must be at least the starting price. After that, each bid must be at least the current bid plus the increment.
- Sellers can't bid on their own car, and the current leader can't outbid themselves.
- **Anti-sniping:** a bid with 2 minutes or less left extends the end time by 2 minutes
  (`ANTI_SNIPE_WINDOW_SECONDS`, `ANTI_SNIPE_EXTENSION_SECONDS`).
- **Reserve:** bidders only see whether it has been met. If the auction ends below the reserve
  (or with no bids), there is no winner, and the car goes back to an inactive fixed-price listing.
- **Closing:** a background task (`AUCTION_TICK_SECONDS`, default 1 s) opens scheduled auctions
  and closes expired ones. On close it picks the winner, marks the car sold, notifies the winner,
  the seller and the losing bidders, and broadcasts the result.
- **Concurrency:** each bid is a compare-and-swap `UPDATE` guarded by `bid_count` (an optimistic
  version), so two simultaneous bids can't both win and a bid in the last second can't be lost
  to the closer. A test fires 6 equal bids in parallel and checks that exactly 1 succeeds.
- Notifications are pushed live over WebSocket once their transaction commits (`after_commit` hook).

**Scaling note:** WebSocket rooms live in process memory. Run a single API worker, or add Redis
pub/sub fan-out behind `app/realtime.py` before scaling out (covered in Phase 6).

## AI price predictor (Phase 4)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/predict-price` | public, 30/min. Body: `make, model, year, mileage, fuel_type, transmission, body_type, condition, location, asking_price?` |
| GET  | `/api/predict-price/model` | version, training data, hold-out metrics (MAE, R², MAPE, range coverage) |

The response includes `estimated_price`, `low`/`high` (a calibrated 80% range), `confidence`,
the top 5 `factors` (each with its ₹ impact vs a typical car) and, when an asking price is
given, `deal` (`great_deal` / `fair` / `overpriced`). Fixed-price listing cards also carry
`estimated_price` and `price_rating`, and listing details include a full `price_insight`.
If no model has been trained, listings still work without badges, and the endpoint returns 503.

Training, data sources, metrics and retraining are covered in [ml/README.md](ml/README.md).
The UI is at `/price-check` ("What's my car worth?", with a speedometer gauge), plus deal badges
on cards and an "AI price check" panel on car and auction pages. The sell form also suggests a
price as you type.

## Admin dashboard (Phase 5)

Sign in as an admin (`python -m app.cli create-admin ...`) and open **`/admin`**. An "Admin" link
appears in the navbar. The API enforces admin-only access independently (403 for everyone else).

| Tab | What it does |
|-----|--------------|
| Overview | GMV (headline figure), members / new listings / live auctions / bids with week-over-week change, 14-day small-multiple charts (listings, members, bids per day), listings by status, top makes |
| Listings | Review queue (oldest first), then approve, reject with a reason the seller sees (editing resubmits), or remove. Filter by status, search title/make/seller email |
| Users | Search, filter by role/status, change role, deactivate/reactivate (deactivating revokes every session). Admins can't lock themselves out |
| Auctions | Every auction with top bid, reserve status and timing. Admins can cancel even with bids; bidders are notified |

| Method | Path |
|--------|------|
| GET | `/api/admin/stats` |
| GET | `/api/admin/listings?status=pending\|active\|sold\|rejected\|inactive\|all&q=&page=` |
| POST | `/api/admin/listings/{id}/approve` · `/reject` (`{reason}`) · DELETE `/api/admin/listings/{id}` |
| GET / PATCH | `/api/admin/users` · `/api/admin/users/{id}` (`{role?, is_active?}`) |
| GET / POST | `/api/admin/auctions?status=` · `/api/admin/auctions/{id}/cancel` |
| GET | `/api/stats` (public homepage counters) |

**UI polish in this phase:** page transitions; every framer-motion animation honors the OS
"reduce motion" setting; a route-level error boundary; live homepage counters and an "Ending soon"
auctions strip; a 360° drag-to-spin viewer on listings with 3+ photos (it uses the gallery
photos as frames, so an ordered walk-around photo set gives a true spin); and review-status
banners for sellers. The charts use one validated series hue per theme (`--viz-1`), small multiples
rather than dual axes, hover and keyboard tooltips, and a "View as table" fallback.

## Production deployment (Phase 6)

**See [DEPLOYMENT.md](DEPLOYMENT.md)** for the full guide: server setup, HTTPS, configuration
reference, upgrades and rollback, backups, monitoring, scaling, and the security checklist.

```bash
cp .env.production.example .env.production      # DOMAIN, ACME_EMAIL, SECRET_KEY, POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```
Caddy (automatic Let's Encrypt) serves the web app and API from one origin. PostgreSQL and Redis
stay internal. Two API workers share WebSockets, rate limits and lockouts through Redis.

**Continuous integration** (`.github/workflows/ci.yml`) runs:
- backend tests with a 90% coverage floor;
- migrations upgrade, downgrade and upgrade on real PostgreSQL, plus a seeded API smoke test;
- ML tests and a check that the scikit-learn versions match;
- frontend typecheck, unit tests and build;
- `pip-audit` / `npm audit`;
- Docker image builds and compose validation.

**Hardening added in Phase 6:**
- **Request size limits:** 413 before parsing, including chunked uploads.
- **JWT tokens:** issuer and audience are now verified.
- **A common-password denylist.**
- **Production config guards:** secure cookies, HTTPS-only CORS, PostgreSQL required, strong secret required.
- **Headers:** a CSP on the web app and the API, COOP/CORP, and a sandboxed CSP on uploaded files.
- **Request IDs and access logs.**
- **Trusted-proxy handling** for real client IPs.
- **Optional Redis fan-out** for running several workers.
- **A patched PostCSS** in place of the vulnerable copy Next.js bundles.

## Sign-in (Clerk)

Sign-up, sign-in, passwords, "Continue with Google", email verification and password resets
are handled by [Clerk](https://clerk.com).

1. Create an application at [dashboard.clerk.com](https://dashboard.clerk.com) and turn on the sign-in
   methods you want (email + password, Google, ...).
2. Copy the keys from **API keys**:
   - API (`.env`, Render): `CLERK_PUBLISHABLE_KEY=pk_...` and `CLERK_SECRET_KEY=sk_...`
   - Website (`frontend/.env.local`, Vercel): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...`
3. Restart the API and rebuild the website.

**How it works:** after Clerk signs someone in, the browser posts its Clerk session token to
`POST /api/auth/clerk`. The API:
- verifies it (RS256 signature against the Clerk instance's published keys, issuer, expiry, and that it
  was issued for one of our `CORS_ORIGINS`);
- reads the person's verified email from Clerk's Backend API;
- finds the user by their Clerk ID, links an existing account with the same verified email, or creates a
  new buyer account;
- issues the normal CarVypaar session (short access token + rotating refresh cookie).

Admins: create the account with `python -m app.cli create-admin` (or `BOOTSTRAP_ADMIN_*` on Render), then sign
up through Clerk with the same email. The two are linked on first sign-in.

## Security notes

- **Tokens:** 15-minute access JWT (kept in memory only) plus a 7-day refresh JWT in an
  `httpOnly`, `SameSite=Lax` cookie scoped to `/api/auth`. Refresh tokens are stored by `jti`
  and **rotated** on every use. Replaying a rotated token revokes every session for that user.
- **Passwords:** held by Clerk, never by CarVypaar (along with brute-force protection, email
  verification and resets). Only Clerk-verified emails can create or link an account.
- **Validation:** all input passes through Pydantic. New accounts are always buyers; unknown fields
  (such as `role`) are ignored on profile update.
- **SQL injection:** only ORM queries with bound parameters; no raw SQL is built from user input.
- **CORS:** explicit origin allow-list with credentials. Wildcard origins are refused in production.
- **Rate limiting:** slowapi, with a global default plus tight limits on auth routes.
- **Headers:** `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, and HSTS in production.
- **Production guard:** the app refuses to start if `ENVIRONMENT=production` and `SECRET_KEY` is weak.
- **Storage:** `LocalStorage` generates random file names and blocks path traversal.
- **Uploads:** content-type allow-list, size cap read in bounded chunks, Pillow must parse the
  bytes as a real JPEG/PNG/WebP, a pixel cap blocks decompression bombs, and every photo is
  re-encoded to WebP, which strips EXIF (including GPS) and any embedded payload. A batch with one
  bad file is rejected as a whole.
- **Search:** user text in `LIKE` patterns is escaped, so `%` and `_` match literally.
- **WebSockets:** `Origin` is checked against `CORS_ORIGINS` (blocks cross-site WebSocket
  hijacking), authentication happens in the first message rather than the URL, frames are capped
  at 4 KB, and bids are rate limited per socket (10 per 10 s).

## Roadmap

1. ✅ Structure, Docker, models, auth
2. ✅ Car listings API + browse/detail/sell/garage pages
3. ✅ Auctions with WebSockets (live bids, anti-sniping, auto-close, live notifications)
4. ✅ ML price predictor (training, calibrated ranges, explanations, deal badges, UI)
5. ✅ UI polish, animations, admin dashboard
6. ✅ Testing, security hardening, CI, deployment guide ([DEPLOYMENT.md](DEPLOYMENT.md))
