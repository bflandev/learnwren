# Self-hosting

Run your own Learn Wren with Docker Compose. One command brings up the whole
stack on a single machine; no cloud account, no credentials.

**Read the [limits](#what-this-does-and-does-not-give-you) before relying on
it.** This slice packages the platform's *emulator mode*: data lives in the
Firebase Emulator Suite, and the video pipeline runs its in-memory fakes. That
is the same mode every developer and every CI run uses, and it is complete for
everything except real video transcoding and playback. Replacing the emulators
and fakes with production-grade self-hosted services is the next slice of
US-09-04.

## Prerequisites

| Requirement | Notes |
| :--- | :--- |
| Docker Engine 24+ with Compose v2 | `docker compose version` must work. Docker Desktop on macOS/Windows is fine. |
| 4 GB free RAM, 3 GB free disk | The build stage installs the workspace and compiles both apps; the emulator image carries a JRE. |
| A checkout of this repository | `git clone` it; images are built from source. |

## Quick start

```bash
cp .env.example .env      # defaults work as-is on one machine
docker compose up -d      # builds three images on first run (several minutes)
```

Then open **http://localhost:8000**. Check the wiring:

```bash
curl http://localhost:8000/api/health   # {"status":"ok",...}
docker/smoke.sh                          # same checks, scripted
```

What is running:

| Service | Container | Reachable at (defaults) |
| :--- | :--- | :--- |
| Web app + `/api` reverse proxy | `web` (nginx) | http://localhost:8000 |
| API (NestJS, listen mode) | `api` | only through the web container's `/api` |
| Firebase Emulator UI | `emulators` | http://127.0.0.1:4000 |
| Auth / Firestore / Storage emulators | `emulators` | 127.0.0.1:9099 / :8080 / :9199 |

The api shares the emulators container's network namespace, so it reaches
them on `127.0.0.1` with no configuration, and the upload URLs it hands the
browser point at a host the browser can reach.

## First run

1. **Register** at http://localhost:8000/register.
2. **Verify the email.** Nothing is sent. Open the Emulator UI at
   http://127.0.0.1:4000/auth, find your user, click the envelope icon, and
   open the verification link. It lands you back on the app's login page.
3. **Make yourself an administrator.** The promotion tools run from a checkout
   with `pnpm install` done, against the emulator ports (published on loopback
   by default):
   ```bash
   pnpm tools:promote-to-admin you@example.com
   ```
   The account must be verified first. `pnpm tools:promote-to-instructor`
   works the same way; instructors can also apply in-app and an admin approves
   them under **Admin**.

Everything in [`USER_GUIDE.md`](./USER_GUIDE.md) Part 2 then applies, with
the video exception described below.

## Configuration

All settings live in `.env` (documented in [`.env.example`](../.env.example))
and are read by `docker-compose.yml`. Restart to apply: `docker compose up -d`.

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `LEARNWREN_HOST` | `localhost` | Hostname browsers use. Must resolve to this machine from the browser **and** from inside the containers, because the api mints video-upload URLs on it. |
| `LEARNWREN_WEB_PORT` | `8000` | Host port for the web app. |
| `LEARNWREN_STORAGE_BIND` | `127.0.0.1` | Host address for the Storage emulator port (9199). Browsers upload video straight to it. |
| `LEARNWREN_ADMIN_BIND` | `127.0.0.1` | Host address for the Emulator UI, Firestore and Auth ports. |
| `LEARNWREN_EMAIL_TRANSPORT` | `console` | `console` logs unlock and notification emails to `docker compose logs api`; `smtp` sends them via `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`. |
| `LEARNWREN_EMAIL_FROM` | `noreply@learnwren.local` | Sender address. |
| `LEARNWREN_STORAGE_QUOTA_GB` | unset | Enables the admin health dashboard's quota bar and alert. |

### Serving other machines

Set `LEARNWREN_HOST` to a name or IP that resolves to the server, and
`LEARNWREN_STORAGE_BIND=0.0.0.0` so browsers can reach the Storage port.
Leave `LEARNWREN_ADMIN_BIND` on loopback.

**Security note.** The emulator ports carry no authentication. Anyone who can
reach 4000, 8080 or 9099 can read and change every user and document; anyone
who can reach 9199 can read and write every uploaded file. Only publish 9199,
only to a trusted network, and put the web port behind a TLS-terminating
reverse proxy of your own (the stack serves plain HTTP and sets no HSTS
header). Verification links are only reachable through the Emulator UI, which stays on
loopback; open it from the server (or over an SSH tunnel).

## Data, backup, upgrade

Data persists in the `emulator-data` Docker volume. The emulators write an
export there on a clean shutdown and import it on the next start, so use
`docker compose stop` or `docker compose down` (never `kill`) to stop the
stack; the 60-second grace period covers the export.

- **Back up:** stop the stack, then copy the volume (named `<directory>_emulator-data`;
  the export itself is in `/data/export`), e.g.
  `docker run --rm -v learnwren_emulator-data:/data -v "$PWD":/backup alpine tar czf /backup/learnwren-data.tgz -C /data .`
- **Upgrade:** `git pull && docker compose up -d --build`. Data is kept.
- **Start over:** `docker compose down -v` deletes the volume.

## What this does and does not give you

Everything in the user guide works in this stack except real video playback:

- **Video.** Uploads succeed and land in the Storage emulator. Transcoding and
  AES-128 HLS packaging need the GCP Transcoder, and this stack runs the
  in-memory fake instead: a lesson video stays in *Transcoding* until the
  dev-only completion endpoint is called (see the API reference in the user
  guide), and playback then serves a stub manifest, not the uploaded file. A
  self-hosted transcoder (ffmpeg) and object store are the next slice.
- **Durability.** The Emulator Suite is a development tool. It runs in one
  process, keeps Firestore in memory between exports, has no authentication,
  and is not built for concurrent production load. Treat this as a
  single-machine or trusted-network install.
- **TLS.** Not included; front it with your own reverse proxy.
- **Email.** Account verification and password reset go through the Auth
  emulator and only ever appear in the Emulator UI; SMTP covers unlock and
  notification emails only.

## Troubleshooting

| Symptom | Cause / fix |
| :--- | :--- |
| `web` returns 502 for `/api` right after start | The api waits for the emulators' health check; give it ~30 s. `docker compose logs api` shows the boot log. |
| Video upload fails in the browser | The browser cannot reach `LEARNWREN_HOST:9199`. Check `LEARNWREN_STORAGE_BIND` and that the host resolves from the browser. |
| Data gone after restart | The stack was killed before the export finished. Always `docker compose stop`. |
| Port already in use | Change `LEARNWREN_WEB_PORT`, or stop the local `pnpm emulators` (same 4000/8080/9099/9199 ports). |
