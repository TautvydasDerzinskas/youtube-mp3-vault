# YoutubeVault

A self-hosted service that tracks YouTube playlists, automatically downloads them as MP3s for offline listening, and lets you play them back right in the browser — with a companion Android app now in early development.

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
- **MusicBrainz metadata enrichment** — each video is looked up on MusicBrainz in the background (best-effort, throttled to their 1 req/sec limit) to fill in artist, album, track number and release year; skipped whenever the server is offline and never blocks downloads. Lays the groundwork for upcoming genre/artist sub-playlist views
- **Offline genre classification (Essentia)** — genre isn't sourced from MusicBrainz (its crowd-sourced tags are missing for most non-mainstream recordings) but classified locally from the downloaded audio itself, via a Discogs-EffNet model running in a dedicated `audio-analysis` service. Fully offline, no internet required. Opt-in (`--profile audio-analysis`, see below) and amd64-only — see the Stack table

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

### Phase 3 (Mobile app) — in progress

**Implemented**
- **React Native app (Expo, Android-focused for now)** — lives in `mobile/`, linted by the same root oxlint config as `backend/`/`frontend/`
- **Login, persisted session** — signs in against the existing `/api/auth/login` + `/api/auth/me` endpoints; the JWT is stored in `expo-secure-store` (Android Keystore-backed) so the session survives app restarts and only ends on explicit logout
- **React Native Paper, themed to match the web app** — MUI itself is web/DOM-only and can't run in React Native; Paper is the RN equivalent (Material Design components), themed with the same dark palette as `frontend/src/theme.ts` (red primary, near-black backgrounds)
- **In-app update notice** — a CI-built app checks GitHub Releases on launch and shows a dismissible snackbar if a newer build exists (see **In-app "update available" notice** under Running locally → Mobile, below)
- **Web → app handoff** — opening the web frontend from a phone shows a dismissible full-screen prompt linking straight to the APK download instead of the desktop-oriented web UI (`MobileAppGate`); the apk is baked into the frontend's own Docker image, not linked from anything that expires (see **Mobile** below)

**Todo**
- [ ] **Playlist sync** — browse synced playlists and download their MP3s to the device (backend already exposes `GET /api/playlists/:id/manifest` for this — see API reference below)
- [ ] **Offline playback** — listen via the device's native media player or an in-app player
- [ ] **Manual trigger** — kick off a server-side sync from the mobile app without waiting for the cron job
- [ ] **Register from the app** — currently login-only; account creation still happens on the web

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Material UI v6, react-i18next |
| Mobile | React Native (Expo), TypeScript, React Native Paper — Android-focused |
| Backend | Node.js, Express, TypeScript, Passport.js |
| Database | PostgreSQL 16 via Prisma ORM |
| Scraping & downloads | yt-dlp (Python, installed in the backend container) |
| Genre classification | Essentia (Discogs-EffNet model), own FastAPI service — opt-in, amd64-only (no arm64 wheel upstream) |
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

Genre classification (`audio-analysis`) is opt-in — it's amd64-only (no arm64 wheel for its Essentia dependency) and adds a fairly heavy image, so it's left out of a plain `docker compose up`. Enable it with:

```bash
docker compose --profile audio-analysis up --build -d
```

Without it, everything else works exactly the same — genres just never get filled in.

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

Every push to `main`/`master` that passes lint automatically builds and publishes `backend`/`frontend`/`audio-analysis` images to GitHub Container Registry, and builds a standalone Android APK from `mobile/` (see the **Mobile** section below) — but each only runs if that specific subfolder actually changed in the push (via `dorny/paths-filter`, see `.github/workflows/docker-publish.yml`), so e.g. a backend-only change doesn't rebuild and republish the other three untouched images.

`frontend` and `mobile` are the exception — they're coupled, not independent: the web app always ships the current Android APK baked into the image (see **Mobile** below), so publishing frontend needs a freshly built apk even if `mobile/` itself didn't change, and conversely a mobile-only change still triggers a fresh frontend publish so that new apk actually reaches the download prompt. Either one changing runs both jobs; `backend`/`audio-analysis` are unaffected either way.

Need to force-republish one that *didn't* change (e.g. after a registry hiccup, or to pick up a base-image security patch) — go to the repo's **Actions → Build & Publish → Run workflow**, pick a `component` (`backend` / `frontend` / `audio-analysis` / `mobile` / `all`), and run it manually; that bypasses the changed-files check entirely for whichever you pick.

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

A single [oxlint](https://oxc.rs/docs/guide/usage/linter) config at the repo root lints `backend/`, `frontend/`, and `mobile/` with the same base rules (plus React/JSX rules scoped to `frontend/` and `mobile/`):

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

### Mobile

Requires an Android emulator (via Android Studio) or a physical device with [Expo Go](https://expo.dev/go) installed.

```bash
cd mobile
npm install
npm run android
```

By default (no `.env` needed) the app points at the self-hosted instance's real address on the LAN, `https://youtubevault.mylan`, resolved by the router's local DNS — same as the web app, just over the network instead of same-origin. If you're instead running a backend directly on your dev machine (not the LAN instance), copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL`:
- **Android emulator** reaches your host machine at `10.0.2.2` (its alias for the host's `localhost`)
- **Physical device** needs your host machine's real LAN IP instead (e.g. `http://192.168.1.50:3001/api`), with the backend reachable from your phone's network

> **Node version:** react-native/Metro in this Expo SDK want Node `^20.19.4 || ^22.13.0` — a couple patch versions ahead of the `^20.19.0` minimum the rest of the repo tolerates. If `npm install` here prints `EBADENGINE` warnings, bump your local Node before troubleshooting anything else.

**CI builds an installable APK** on every push to `main`/`master` that touches `mobile/` *or* `frontend/` (or a manual dispatch — see above), alongside the Docker publish jobs: it runs `expo prebuild` to generate the native Android project fresh, then `./gradlew assembleRelease` — a *release* build type (not debug: a debug APK doesn't bundle its JS at all, it loads it from a Metro dev server on whatever machine built it, so it only runs while that machine is reachable — release bundles the JS in at build time instead, so the installed app never depends on anything running anywhere). Signed with our own stable key (see below), not Google's — "release" here describes the build type, not Play Store distribution. It shows up three ways: a `YoutubeVault-apk` workflow artifact (kept 30 days, handy for a specific CI run), a [GitHub Release](../../releases) tagged `mobile-<short-sha>` with the APK attached (kept indefinitely — this is what the app's own update check reads, see below; only published when `mobile/` itself changed, not for a frontend-only-triggered rebuild — see next paragraph), and baked directly into the frontend's own Docker image (see below).

**The web frontend always ships the current APK, embedded in the image itself** — not linked from the Release or the workflow artifact, both of which either expire or live outside the image. A phone browser opening the web app gets a full-screen prompt (`MobileAppGate`, dismissible) pointing at `/download/YoutubeVault.apk`, a real static file the `publish-frontend` job downloads from the `android-apk` job's build (`actions/download-artifact`, into `frontend/public/download/` before `docker build`) and Vite bundles like any other public asset. This is why the two jobs are coupled (see above) — a mobile-only change still rebuilds+republishes frontend so the new apk actually reaches that download prompt, and a frontend-only change still rebuilds mobile first so frontend has *something* current to embed, even though nothing in `mobile/` moved.

#### Stable signing key (required for in-place updates)

Without this, the app still builds and installs fine — it just falls back to the debug keystore bundled with every unconfigured Expo/RN project (a publicly known key, not unique to this app), so installing a newer build over an older one fails with "conflicts with an existing package" and forces an uninstall (losing the saved login) each time. To fix that, generate a private keystore **on your own machine** (never commit it, never paste it anywhere but the GitHub secret below):

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore mobile-release.keystore \
  -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass android -keypass android \
  -dname "CN=YoutubeVault, OU=Personal, O=Personal, L=Unknown, ST=Unknown, C=US"

base64 -i mobile-release.keystore | pbcopy   # macOS — copies to clipboard
# base64 -w0 mobile-release.keystore          # Linux — prints to stdout instead
```

Add the copied value as a repo secret named `MOBILE_KEYSTORE_BASE64` (**Settings → Secrets and variables → Actions → New repository secret**). Keep `mobile-release.keystore` itself somewhere safe (password manager, encrypted backup) — losing it means every future build gets a new identity again, breaking the update chain for whoever already has it installed.

#### In-app "update available" notice

The app embeds its own build's short commit SHA at build time (`EXPO_PUBLIC_BUILD_SHA`, set by the `android-apk` job) and, on launch, checks the latest GitHub Release's tag against it (`src/hooks/useUpdateCheck.ts`) — a mismatch shows a dismissible "a newer version is available" snackbar with a link to the release. Best-effort only: no internet, rate-limited, or a locally-run dev build (`expo start`, no `EXPO_PUBLIC_BUILD_SHA` set) just means no banner, never an error.

---

## Environment variables

The `POSTGRES_*`, `SMTP_*`, and `LASTFM_*` values below are only ever read
once — the first time the backend starts against a fresh database, to seed
an `app_settings` row (see `services/settings.ts`). Every read and write
after that goes through the database, not the environment, so an admin's
changes via **Administration → Settings** survive redeploys even if these
env vars still have their old values. Postgres changes there are tested
(reachable, and already this app's own schema) before ever being applied,
so a typo can't take the app down — see `services/prisma.ts`'s `switchDatabase`.

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
| `SMTP_HOST` | No | — | SMTP server for sending signup verification emails. Unset (in any tier, not just `dev`) means no verification step at all — new accounts are created already-verified and signed in immediately, since there's no way to email a confirmation link. In `dev` specifically, the link is logged to the console instead, so the full flow stays testable locally with zero setup |
| `SMTP_PORT` | No | `587` | SMTP server port |
| `SMTP_SECURE` | No | `false` | Use implicit TLS (`true` for port 465) |
| `SMTP_USER` / `SMTP_PASS` | No | — | SMTP auth credentials, if your server requires them |
| `SMTP_FROM` | No | `YoutubeVault <no-reply@localhost>` | `From` address on verification emails |
| `LASTFM_API_KEY` | No | — | From [last.fm/api/account/create](https://www.last.fm/api/account/create) (free); alone, powers the track page's "Discover" section (external similar-track suggestions) — unset just means that section doesn't render |
| `LASTFM_API_SECRET` | No | — | From the same Last.fm API registration. Additionally required before the "Connect to Last.fm" option appears in Profile — without it, a user has no way to link their account and scrobble plays |
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
│                               # downloader, playlist stats, connectivity check, demo user seed, scheduler,
│                               # musicbrainz + audioAnalysis workers
├── audio-analysis/            # Essentia genre classification service (opt-in, amd64-only)
│   ├── Dockerfile             # downloads the Discogs-EffNet model files at build time
│   └── app.py                 # FastAPI: POST /analyze { path }, GET /health
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf             # SPA + /api proxy
│   └── src/
│       ├── api/               # axios client, auth, admin, playlists, status
│       ├── contexts/          # AuthContext, PlayerContext (also syncs i18n language)
│       ├── i18n/              # react-i18next setup + en/lt/pl locale files
│       ├── components/Layout/ # Sidebar (Users nav item shown for admins), AppLayout, MiniPlayer
│       └── pages/
│           ├── LoginPage, ProfilePage, VerifyEmailPage, AuthCallbackPage
│           ├── UsersPage/      # admin-only — table + UserDetailDialog
│           ├── TrackDetailPage/ # per-track view — similar songs, remixes
│           └── PlaylistsPage/, PlaylistDetailPage/ # split into subcomponents + hooks
└── mobile/                    # React Native (Expo), Android-focused — see "Mobile" above
    ├── App.tsx                # Root: AuthProvider + Login/Home screen switch
    └── src/
        ├── api/                # axios client (Bearer-token auth), auth
        ├── auth/tokenStorage.ts # expo-secure-store wrapper — persists the session
        ├── contexts/           # AuthContext
        └── screens/            # LoginScreen, HomeScreen (placeholder post-login)
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
| `POST` | `/api/auth/login` | — | Sign in (rejected until the account is verified); returns the JWT in the response body as well as the cookie, for clients like the mobile app that can't use a browser cookie jar |
| `POST` | `/api/auth/logout` | — | Clear session cookie |
| `GET` | `/api/auth/me` | ✓ | Current user |
| `PATCH` | `/api/auth/profile` | ✓ | Change email and/or password (requires current password); an email change is pending until the new address confirms it via `/verify-email` |
| `PATCH` | `/api/auth/language` | ✓ | Change UI language (`en` / `lt` / `pl`) |
| `GET` | `/api/auth/lastfm/connect` | ✓ | Redirects to Last.fm's own authorize page; only available when the admin has set both a Last.fm API key and shared secret |
| `GET` | `/api/auth/lastfm/callback` | ✓ | Where Last.fm redirects back to after the user approves; exchanges the token for a permanent session key, then redirects into the Profile page |
| `POST` | `/api/auth/lastfm/disconnect` | ✓ | Unlink this account from Last.fm and turn scrobbling off |
| `PATCH` | `/api/auth/lastfm/scrobbling` | ✓ | Turn scrobbling on/off (requires already being connected) |
| `GET` | `/api/playlists` | ✓ | List user's playlists |
| `POST` | `/api/playlists` | ✓ | Add playlist by URL |
| `PATCH` | `/api/playlists/:id` | ✓ | Rename playlist (custom display name) |
| `DELETE` | `/api/playlists/:id` | ✓ | Remove playlist and its downloaded files |
| `GET` | `/api/playlists/:id/videos` | ✓ | List videos in a playlist |
| `GET` | `/api/playlists/:id/manifest` | ✓ | Full track list with per-track `downloadUrl` (only when downloaded) and `downloadStatus` — including removed/unavailable tracks with no URL, so a client (e.g. the mobile app) can mirror and keep a local copy in sync, not just do an initial download |
| `POST` | `/api/playlists/:id/sync` | ✓ | Re-scrape playlist from YouTube and download any new videos |
| `POST` | `/api/playlists/:id/retry-failed` | ✓ | Retry only the videos that previously failed to download |
| `POST` | `/api/playlists/:id/pause` | ✓ | Pause automatic sync for this playlist |
| `POST` | `/api/playlists/:id/resume` | ✓ | Resume automatic sync (continues any pending downloads immediately) |
| `GET` | `/api/playlists/:id/videos/:videoId/stream` | ✓ | Stream a downloaded video's MP3 for in-browser playback |
| `GET` | `/api/playlists/:id/videos/:videoId/download` | ✓ | Download a video's MP3 file |
| `GET` | `/api/playlists/:id/videos/:videoId/recommendations` | ✓ | "Similar songs" — audio-embedding similarity, boosted by same-artist/same-genre |
| `GET` | `/api/playlists/:id/videos/:videoId/discover` | ✓ | "Discover" — external similar tracks via Last.fm, each resolved to a best-guess YouTube link plus a Spotify search link |
| `GET` | `/api/playlists/:id/videos/:videoId/remixes` | ✓ | Best-effort YouTube search for remixes of this track |
| `POST` | `/api/playlists/:id/videos/:videoId/played` | ✓ | Call once a track finishes playing — bumps its internal play count/last-played time, and best-effort scrobbles to Last.fm if the user has that enabled |
| `GET` | `/api/admin/users` | Admin | List every account (verification/ban status, playlist count) |
| `GET` | `/api/admin/users/:id` | Admin | Full account detail + their playlists |
| `POST` | `/api/admin/users/:id/ban` | Admin | Suspend an account — takes effect immediately, not just on next login |
| `POST` | `/api/admin/users/:id/unban` | Admin | Restore a suspended account |
| `GET` | `/api/admin/settings` | Admin | Current SMTP + Postgres + Last.fm settings |
| `PATCH` | `/api/admin/settings/smtp` | Admin | Update SMTP settings |
| `POST` | `/api/admin/settings/postgres` | Admin | Test and, only if reachable, switch to a different Postgres database/user/password (host/port stay fixed) |
| `PATCH` | `/api/admin/settings/lastfm` | Admin | Update the Last.fm API key/shared secret |
