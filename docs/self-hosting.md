# Self-hosting

Run your own Learn Wren with Docker Compose. One command brings up the whole
stack on a single machine; no cloud account, no credentials.

**Read the [limits](#what-this-does-and-does-not-give-you) before relying on
it.** Files (videos, HLS output, lesson materials, cover images, profile
pictures) live in an S3-compatible object store inside the stack (RustFS by
default; any S3-compatible store works), and video is transcoded in-process
with ffmpeg. Only user accounts and course data
still run on the Firebase *emulators* (Auth and Firestore); replacing those
two with production-grade self-hosted stores is the remaining part of
US-09-04.

## Prerequisites

| Requirement | Notes |
| :--- | :--- |
| Docker Engine 24+ with Compose v2 | `docker compose version` must work. Docker Desktop on macOS/Windows is fine. |
| 4 GB free RAM, 3 GB free disk plus your media | The build stage installs the workspace and compiles both apps; the emulator image carries a JRE. Uploaded files live in a Docker volume. |
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
| API (NestJS, ffmpeg, S3 client, public images at `/api/media`) | `api` | only through the web container's `/api` |
| Object store (RustFS, S3-compatible) | `objectstore` | **not published** |
| Firebase Emulator UI | `emulators` | http://127.0.0.1:4000 |
| Auth / Firestore emulators | `emulators` | 127.0.0.1:9099 / :8080 |

Browsers never talk to the object store. Uploads (video chunks, materials)
`PUT` to `/api`, downloads and video segments stream back through `/api`, and
the two public buckets (covers, profile pictures) are served anonymously at
`/api/media/<bucket>/…`. The api creates its five buckets on boot. The api shares the emulators container's network
namespace, so it reaches Auth and Firestore on `127.0.0.1` with no
configuration.

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

Everything in [`USER_GUIDE.md`](./USER_GUIDE.md) Part 2 then applies,
including video: upload a lesson video, wait for *Transcoding* to become
*Ready* (about real-time for the first encode on a small server), and play it.

## Configuration

All settings live in `.env` (documented in [`.env.example`](../.env.example))
and are read by `docker-compose.yml`. Restart to apply: `docker compose up -d`.

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `LEARNWREN_HOST` | `localhost` | Hostname browsers use. Must resolve to this machine from the browser **and** from inside the containers, because the api mints video-upload URLs on it. |
| `LEARNWREN_WEB_PORT` | `8000` | Host port for the web app. |
| `LEARNWREN_S3_ACCESS_KEY` / `LEARNWREN_S3_SECRET_KEY` | `learnwren` / `learnwren-change-me` | Object store root credentials, used by the api. **Change the secret** on any machine other people can reach. |
| `LEARNWREN_ADMIN_BIND` | `127.0.0.1` | Host address for the Emulator UI, Firestore and Auth ports. |
| `LEARNWREN_EMAIL_TRANSPORT` | `console` | `console` logs unlock and notification emails to `docker compose logs api`; `smtp` sends them via `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`. |
| `LEARNWREN_EMAIL_FROM` | `noreply@learnwren.local` | Sender address. |
| `LEARNWREN_STORAGE_QUOTA_GB` | unset | Enables the admin health dashboard's quota bar and alert. |

### Serving other machines

Set `LEARNWREN_HOST` to a name or IP that resolves to the server. Only the
web port needs to be reachable; leave `LEARNWREN_ADMIN_BIND` on loopback.

**Security note.** The emulator ports carry no authentication: anyone who can
reach 4000, 8080 or 9099 can read and change every user and document. The
object store is not published at all; its credentials sit in `.env`, so
change `LEARNWREN_S3_SECRET_KEY` from the default. Put the web port behind a
TLS-terminating reverse proxy of your own (the stack serves plain HTTP and
sets no HSTS header). Verification links are only reachable through the
Emulator UI, which stays on loopback; open it from the server (or over an
SSH tunnel).

## Data, backup, upgrade

Two Docker volumes hold everything: `objectstore-data` (every uploaded file
and HLS output, written immediately) and `emulator-data` (users and course data;
the emulators write an export there on a clean shutdown and import it on the
next start). Use `docker compose stop` or `docker compose down` (never
`kill`) so the export completes; the 60-second grace period covers it.

- **Back up:** stop the stack, then copy both volumes (named
  `<directory>_objectstore-data` and `<directory>_emulator-data`; the emulator
  export itself is in `/data/export`), e.g.
  `for v in objectstore-data emulator-data; do docker run --rm -v "learnwren_$v:/data" -v "$PWD":/backup alpine tar czf "/backup/learnwren-$v.tgz" -C /data .; done`
- **Upgrade:** `git pull && docker compose up -d --build`. Data is kept.
- **Start over:** `docker compose down -v` deletes both volumes.

## What this does and does not give you

Everything in the user guide works in this stack. Know these limits:

- **Video encoding runs inside the api container**, one rendition at a time
  (up to four, never upscaling). A ten-minute 1080p upload takes several
  minutes of CPU on a small server, and the api answers other requests more
  slowly meanwhile. If the api container restarts mid-encode, that video
  stays in *Transcoding*; delete it from the lesson and upload again.
- **Every file passes through the api.** Uploads (video in 8 MB chunks,
  materials up to 50 MB), material downloads and six-second video segments
  all stream through the api container, and each segment request is
  re-authorised against the student's enrolment (a Firestore read). Fine for
  a class, not for a public video site. Chunked video uploads keep their
  progress in api memory: if the api restarts mid-upload the browser reports
  the upload as failed and the instructor uploads again.
- **Durability.** Files are safe in the object store as soon as an upload finishes.
  Users and course data live in the Firebase Emulator Suite, a development
  tool: one process, Firestore in memory between exports, no authentication,
  not built for concurrent production load. Treat this as a single-machine or
  trusted-network install until the auth/data layer is replaced.
- **TLS.** Not included; front it with your own reverse proxy.
- **Email.** Account verification and password reset go through the Auth
  emulator and only ever appear in the Emulator UI; SMTP covers unlock and
  notification emails only.

## Troubleshooting

| Symptom | Cause / fix |
| :--- | :--- |
| `web` returns 502 for `/api` right after start | The api waits for the emulators' health check; give it ~30 s. `docker compose logs api` shows the boot log. |
| Uploads fail with 5xx, or the api will not start | `docker compose logs api` and `docker compose logs objectstore`; the api creates its buckets on boot and refuses to start if the store rejects the credentials in `.env`. |
| Cover images do not load | They are served at `/api/media/<bucket>/…` from the buckets in `LEARNWREN_PUBLIC_BUCKETS` (set in `docker-compose.yml`); check `docker compose logs api` for the request. |
| Data gone after restart | The stack was killed before the export finished. Always `docker compose stop`. |
| Port already in use | Change `LEARNWREN_WEB_PORT`, or stop the local `pnpm emulators` (same 4000/8080/9099 ports). |
