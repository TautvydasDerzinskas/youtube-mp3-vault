# YoutubeVault

A self-hosted service that tracks YouTube playlists, automatically downloads them as MP3s for offline listening, and lets you play them back right in the browser — with a companion mobile app planned for a future phase.

---

## Features

### Implemented

**Accounts**
- **Email + password auth** — register, sign in, persistent sessions via httpOnly JWT cookies
- **Email verification** — signup sends a confirmation link via SMTP; login is blocked until it's clicked, with a resend option if the link expires (24h) or gets lost. Changing your email from the profile page goes through the same flow — the address only changes once the new one confirms it
- **Demo account** — `demo@gmail.com` / `demo` is seeded automatically on every backend start when `APP_ENV=dev` (the default), for one-click sign-in after a rebuild; skipped entirely for `staging`/`production`
- **Admin account + Users page** — whichever email matches `ADMIN_EMAIL` is marked admin at signup; admins get a Users nav item listing every account (verification/ban status, playlist count), a detail view of any account's playlists, and a ban/unban action that takes effect immediately (not just on next login)
- **Profile page** — change email or password (current password required to confirm either); display name is fixed
- **Multi-language UI** — English, Lithuanian, Polish (react-i18next); saved per-account and switchable from the profile page

**Playlists & sync**
- **Add playlists by URL** — unnecessary query params are stripped automatically
- **yt-dlp scraping** — playlist metadata and video list fetched without any Google API key or OAuth
- **Playlist browser** — expandable accordion list showing all videos per playlist (title, duration, thumbnail, file size)
- **Manual sync** — re-fetch the latest video list for any playlist on demand
- **Automatic sync** — a cron job re-syncs every non-paused playlist every 3 hours
- **Pause / resume automatic sync** — per playlist; while paused only Rename/Delete/Resume remain available, and pausing mid-sync waits for the in-flight video to finish before actually stopping
- **Live "currently syncing" indicator** — shows which video (title + position/total) is being processed, even while the playlist row is collapsed, without flickering a loading spinner or resetting your scroll position
- **MusicBrainz metadata enrichment** — each video is looked up on MusicBrainz in the background (best-effort, throttled to their 1 req/sec limit) to fill in artist, album, track number and genre; skipped whenever the server is offline and never blocks downloads. Lays the groundwork for upcoming genre/artist sub-playlist views

**Downloads**
- **MP3 download pipeline** — `yt-dlp -x --audio-format mp3 --audio-quality 0` runs in the background after each sync
- **Per-video download status** — pending / downloading / done / failed / removed
- **Failure reasons** — the underlying yt-dlp error is stored and shown on hover over a failed video
- **Retry failed videos** — one click to retry only the videos that failed, without re-syncing the whole playlist
- **Disk usage** — per-video file size and total playlist size shown in the UI

**Playback**
- **In-browser playback** — play any downloaded MP3 via a mini player pinned to the bottom of the content area (doesn't overlap the sidebar)
- **Acts like a real playlist** — finishing one track automatically starts the next downloaded track in the same playlist
- **YouTube link + MP3 download** — per-video shortcuts to watch the original on YouTube or download its MP3 file directly

**Reliability**
- **Connectivity check** — the backend periodically checks it can reach the internet; the UI banners this and disables sync-related controls when it can't (playback of already-downloaded songs is unaffected)

- **Dark UI** — React + TypeScript + Material UI v6 dark theme

### Todo — Phase 3 (Mobile app)

- [ ] **React Native app** — iOS + Android client that connects to the self-hosted service
- [ ] **Same auth** — login/register with the same email + password account
- [ ] **Playlist sync** — browse synced playlists and download their MP3s to the device
- [ ] **Offline playback** — listen via the device's native media player or an in-app player
- [ ] **Manual trigger** — kick off a server-side sync from the mobile app without waiting for the cron job

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Material UI v6, react-i18next |
| Backend | Node.js, Express, TypeScript, Passport.js |
| Database | PostgreSQL 16 via Prisma ORM |
| Scraping & downloads | yt-dlp (Python, installed in the backend container) |
| Reverse proxy | nginx (serves SPA + proxies `/api` to backend) |
| Container | Docker Compose |

---

## Running with Docker (recommended)

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose plugin)

> **Which command do I have?**  
> Run `docker compose version` — if it works you have **v2** (plugin, no hyphen).  
> If not, try `docker-compose version` — that's **v1** (standalone, with hyphen).  
> All examples below use v2; substitute `docker-compose` if you're on v1.

### Setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd youtube-music-playlist-vault

# 2. Create your .env from the example
cp .env.example .env
```

Open `.env` and set the required values:

```dotenv
POSTGRES_PASSWORD=pick_a_strong_password
JWT_SECRET=pick_a_long_random_string   # openssl rand -base64 48
```

### Start

```bash
docker compose up --build       # v2 (plugin)
# or
docker-compose up --build       # v1 (standalone)
```

The app is available at **http://localhost** (or the port set by `FRONTEND_PORT`).

On first boot the backend automatically runs database migrations, seeds the demo account, and starts the cron scheduler before accepting requests.

### Stop

```bash
docker compose down             # v2 — keep data
docker compose down -v          # v2 — also delete the postgres volume
# or
docker-compose down             # v1
docker-compose down -v          # v1
```

---

## Deploying published images (e.g. on OpenMediaVault)

Every push to `main`/`master` that passes lint automatically builds and publishes `backend` and `frontend` images to GitHub Container Registry (see `.github/workflows/docker-publish.yml`) — no local build needed on the machine that runs them.

`docker-compose.prod.yml` is the same stack as above, but with `image:` references instead of `build:`, meant for a host (like an OMV Compose plugin) that only pulls images:

```dotenv
# .env on the deploy host — same as .env.example, plus:
GHCR_NAMESPACE=yourname/youtube-music-playlist-vault   # "owner/repo", lowercase
IMAGE_TAG=latest                                        # or a specific commit SHA
```

```bash
# On the deploy host — no clone of the source needed, just this compose file + .env
docker compose -f docker-compose.prod.yml up -d
```

**One-time setup on GitHub before this works:**
1. Push this repo to GitHub (it currently has no remote configured) with the default branch named `main` or `master`, matching the workflow trigger.
2. Under the repo's **Settings → Actions → General → Workflow permissions**, select **"Read and write permissions"** — the workflow needs to push packages using the built-in `GITHUB_TOKEN`, and some accounts/orgs default this to read-only.
3. After the first successful workflow run, go to the repo's **Packages** tab (or your GitHub profile's Packages) → open the new `backend`/`frontend` packages → **Package settings → Change visibility → Public**. GHCR packages are private by default; a NAS pulling anonymously (no `docker login`) needs them public — or alternatively run `docker login ghcr.io` on the NAS with a [PAT](https://github.com/settings/tokens) scoped to `read:packages`.

---

## Running locally (development)

### Prerequisites

- Node.js 20.19+ or 22.12+ (required by the root lint tooling; the backend/frontend apps themselves only need 20+)
- PostgreSQL 16 running locally
- Python 3 + yt-dlp: `pip install yt-dlp`

### Linting

A single [oxlint](https://oxc.rs/docs/guide/usage/linter) config at the repo root lints both `backend/` and `frontend/` with the same base rules (plus React/JSX rules scoped to `frontend/` only):

```bash
npm install   # from the repo root — installs the linter only
npm run lint
npm run lint:fix
```

### Backend

```bash
cd backend
npm install

# Create a .env file (copy from the project root example and adjust DATABASE_URL)
cp ../.env.example .env
# Edit .env: set DATABASE_URL=postgresql://user:pass@localhost:5432/ympv

# Create the database and run migrations
npx prisma migrate dev

# Start in watch mode
npm run dev
# → Listening on http://localhost:3001
```

### Frontend

```bash
cd frontend
npm install

# Start Vite dev server (proxies /api → localhost:3001 automatically)
npm run dev
# → http://localhost:5173
```

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_DB` | No | `ympv` | Database name |
| `POSTGRES_USER` | No | `ympv` | Database user |
| `POSTGRES_PASSWORD` | **Yes** | — | Database password |
| `JWT_SECRET` | **Yes** | — | Secret used to sign JWT tokens (≥ 32 chars) |
| `APP_ENV` | No | `dev` | Deployment tier: `dev` / `staging` / `production`. The demo account is only seeded when this is `dev` |
| `ADMIN_EMAIL` | No | — | Whichever account registers with this email is marked admin at creation time (not retroactive — set it before that account signs up) |
| `FRONTEND_URL` | No | `http://localhost` | Used for CORS; set to your domain in production |
| `FRONTEND_PORT` | No | `80` | Host port the nginx container binds to |
| `MUSIC_DIR` | No | `/data` | Path inside the backend container where downloaded MP3s live; point the `music_data` volume in `docker-compose.yml` at a host/NAS path to change where files actually land |
| `SMTP_HOST` | Required when `APP_ENV` isn't `dev` | — | SMTP server for sending signup verification emails; when unset in `dev`, the verification link is logged to the console instead of sent |
| `SMTP_PORT` | No | `587` | SMTP server port |
| `SMTP_SECURE` | No | `false` | Use implicit TLS (`true` for port 465) |
| `SMTP_USER` / `SMTP_PASS` | No | — | SMTP auth credentials, if your server requires them |
| `SMTP_FROM` | No | `YoutubeVault <no-reply@localhost>` | `From` address on verification emails |
| `GHCR_NAMESPACE` | `docker-compose.prod.yml` only | — | `owner/repo` (lowercase) of this repo on GitHub, used to resolve the published image names |
| `IMAGE_TAG` | No (`docker-compose.prod.yml` only) | `latest` | Which published image tag to run — `latest` or a specific commit SHA |

---

## Project structure

```
.
├── docker-compose.yml
├── docker-compose.prod.yml     # same stack, pulls published images instead of building
├── .env.example
├── .oxlintrc.json              # shared lint rules for backend + frontend
├── .github/workflows/          # lint + build/publish Docker images on push to main/master
├── backend/
│   ├── Dockerfile
│   ├── entrypoint.sh          # runs migrations then starts server
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/        # single consolidated init migration (DB is rebuilt from scratch each run)
│   └── src/
│       ├── index.ts
│       ├── config.ts
│       ├── middleware/        # JWT auth helpers (ban check + admin gate), error handler
│       ├── routes/            # auth, playlists, admin (admin-only user management)
│       └── services/          # passport, prisma, mailer, yt-dlp wrapper, sync engine,
│                               # downloader, playlist stats, connectivity check, demo user seed, scheduler
└── frontend/
    ├── Dockerfile
    ├── nginx.conf             # SPA + /api proxy
    └── src/
        ├── api/               # axios client, auth, admin, playlists, status
        ├── contexts/          # AuthContext (also syncs i18n language)
        ├── i18n/              # react-i18next setup + en/lt/pl locale files
        ├── components/Layout/ # Sidebar (Users nav item shown for admins), AppLayout
        └── pages/
            ├── LoginPage, ProfilePage, VerifyEmailPage, AuthCallbackPage
            ├── UsersPage/      # admin-only — table + UserDetailDialog
            └── PlaylistsPage/ # split into subcomponents + hooks
                ├── PlaylistRow/    # Thumbnail, Info, Actions
                └── hooks/          # usePlaylists, useAudioPlayer, useOnlineStatus
```

---

## API reference

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | — | Liveness check |
| `GET` | `/api/status` | ✓ | Whether the backend can currently reach the internet |
| `POST` | `/api/auth/register` | — | Create account (unverified) and send a confirmation email |
| `POST` | `/api/auth/verify-email` | — | Confirm the emailed token; verifies the account and signs you in |
| `POST` | `/api/auth/resend-verification` | — | Re-send the confirmation email if the link expired or was lost |
| `POST` | `/api/auth/login` | — | Sign in (rejected until the account is verified) |
| `POST` | `/api/auth/logout` | — | Clear session cookie |
| `GET` | `/api/auth/me` | ✓ | Current user |
| `PATCH` | `/api/auth/profile` | ✓ | Change email and/or password (requires current password); an email change is pending until the new address confirms it via `/verify-email` |
| `PATCH` | `/api/auth/language` | ✓ | Change UI language (`en` / `lt` / `pl`) |
| `GET` | `/api/playlists` | ✓ | List user's playlists |
| `POST` | `/api/playlists` | ✓ | Add playlist by URL |
| `PATCH` | `/api/playlists/:id` | ✓ | Rename playlist (custom display name) |
| `DELETE` | `/api/playlists/:id` | ✓ | Remove playlist and its downloaded files |
| `GET` | `/api/playlists/:id/videos` | ✓ | List videos in a playlist |
| `POST` | `/api/playlists/:id/sync` | ✓ | Re-scrape playlist from YouTube and download any new videos |
| `POST` | `/api/playlists/:id/retry-failed` | ✓ | Retry only the videos that previously failed to download |
| `POST` | `/api/playlists/:id/pause` | ✓ | Pause automatic sync for this playlist |
| `POST` | `/api/playlists/:id/resume` | ✓ | Resume automatic sync (continues any pending downloads immediately) |
| `GET` | `/api/playlists/:id/videos/:videoId/stream` | ✓ | Stream a downloaded video's MP3 for in-browser playback |
| `GET` | `/api/playlists/:id/videos/:videoId/download` | ✓ | Download a video's MP3 file |
| `GET` | `/api/admin/users` | Admin | List every account (verification/ban status, playlist count) |
| `GET` | `/api/admin/users/:id` | Admin | Full account detail + their playlists |
| `POST` | `/api/admin/users/:id/ban` | Admin | Suspend an account — takes effect immediately, not just on next login |
| `POST` | `/api/admin/users/:id/unban` | Admin | Restore a suspended account |
