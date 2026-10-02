# Self-hosting

Run your own Learn Wren with Docker Compose. One command brings up the whole
stack on a single machine; no cloud account, no credentials.

**Read the [limits](#what-this-does-and-does-not-give-you) before relying on
it.** The stack has four services: the web server, the api, PostgreSQL and an
S3-compatible object store (RustFS by default; any S3-compatible store works).
User accounts and course data live in PostgreSQL. Sign-up, login, sessions and
email links are built into the api (`LEARNWREN_IDENTITY=local`). Files (videos,
HLS output, lesson materials, cover images, profile pictures) live in the
object store, and video is transcoded in-process with ffmpeg. No Firebase
emulator runs and no cloud account is needed.

## Prerequisites

| Requirement | Notes |
| :--- | :--- |
| Docker Engine 24+ with Compose v2 | `docker compose version` must work. Docker Desktop on macOS/Windows is fine. |
| 4 GB free RAM, 3 GB free disk plus your media | The build stage installs the workspace and compiles both apps. Uploaded files and the database live in Docker volumes. |
| A checkout of this repository | `git clone` it; images are built from source. |

## Quick start

```bash
cp .env.example .env      # 1. copy
# 2. edit .env: set LEARNWREN_POSTGRES_PASSWORD and LEARNWREN_BOOTSTRAP_ADMIN_EMAIL
#    (see "First run"); do this BEFORE the next line
docker compose up -d      # 3. builds two images on first run (several minutes)
```

Then open **http://localhost:8000**. Check the wiring:

```bash
curl http://localhost:8000/api/health   # {"status":"ok",...}
```

`docker/smoke.sh` runs the whole product through the stack (register, verify,
reset a password, log in as admin, create a course, upload a video, play it).
It creates real accounts, including an ADMIN (it sets the bootstrap email to a
throwaway address), so **run it only on a fresh stack**, never on an install
that has users. It refuses to start if the stack already has an api
container (running or stopped); give it a project of its own instead, for example
`COMPOSE_PROJECT_NAME=lw-smoke docker/smoke.sh --down`. (`--force` overrides
the check, for a stack you are happy to throw away.)

What is running:

| Service | Container | Reachable at (defaults) |
| :--- | :--- | :--- |
| Web app + `/api` reverse proxy | `web` (nginx) | http://localhost:8000 |
| API (NestJS, ffmpeg, S3 client, public images at `/api/media`) | `api` | only through the web container's `/api` |
| Object store (RustFS, S3-compatible) | `objectstore` | **not published** |
| PostgreSQL 17 (accounts and course data) | `postgres` | **not published** |

Browsers never talk to the object store. Uploads (video chunks, materials)
`PUT` to `/api`, downloads and video segments stream back through `/api`, and
the two public buckets (covers, profile pictures) are served anonymously at
`/api/media/<bucket>/…`. The api creates its five buckets on boot, and its one database table.

## First run

1. **Name your admin.** In `.env`, set `LEARNWREN_BOOTSTRAP_ADMIN_EMAIL` to the
   address you will register with. Also set `LEARNWREN_POSTGRES_PASSWORD` now
   (see [Configuration](#configuration)); changing it later needs extra steps.
2. **Start the stack and register, before anyone else can reach it.**
   Whoever registers that address first gets the admin account, and Compose
   publishes the web port on every network interface. Setting or leaving
   `LEARNWREN_HOST` changes nothing here. For the first run, set
   `LEARNWREN_WEB_BIND=127.0.0.1` in `.env` so only this machine can connect
   (or block the port in your firewall). Run `docker compose up -d` and
   register at http://localhost:8000/register. Keep the bind until step 4.
   **If registration says the address is already in use, stop: do not verify
   any link.** Someone else registered it. Wipe the new install with
   `docker compose down -v` and start again.
3. **Verify the email.** With the default `console` transport, nothing is
   sent: find the link in `docker compose logs api` (a line starting
   `[verification-email]`). With `LEARNWREN_EMAIL_TRANSPORT=smtp` it arrives
   in your inbox. Open the link; it lands on the app's `/auth/action` page.
   Verify only the link for the account you just registered.
4. **Log in.** You are now an ADMIN. The api promotes the account on login
   when its email matches the variable (exact match, ignoring case) and is
   verified. Then **clear `LEARNWREN_BOOTSTRAP_ADMIN_EMAIL`** (and
   `LEARNWREN_WEB_BIND`, if you set it in step 2) and run
   `docker compose up -d` again. Any later admins you promote in the
   **Admin** area, so you do not need the variable again.

Two cautions about the variable. It only promotes; it never demotes. If you
demote that admin while the variable is still set, the next login promotes the
account again, so clear the variable first. And anyone who registers and
verifies that address gets ADMIN, so set it only to an address you control.

Instructors can apply in-app, and an admin approves them under **Admin**. The
`pnpm tools:promote-to-admin` and `pnpm tools:promote-to-instructor` tools also
work against this stack when run from a checkout with `pnpm install` done, with
`LEARNWREN_DATA_STORE=postgres`, `LEARNWREN_IDENTITY=local` and
`LEARNWREN_POSTGRES_URL` set. The database is not published, so you must
first publish its port yourself (for example with a `ports:` entry on the
`postgres` service in a compose override). Most installs never need this.

Everything in [`USER_GUIDE.md`](./USER_GUIDE.md) Part 2 then applies,
including video: upload a lesson video, wait for *Transcoding* to become
*Ready* (about real-time for the first encode on a small server), and play it.

## Configuration

All settings live in `.env` (documented in [`.env.example`](../.env.example))
and are read by `docker-compose.yml`. Restart to apply: `docker compose up -d`.

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `LEARNWREN_HOST` | `localhost` | Hostname browsers use. It needs to resolve only from the browser; the api builds links and image URLs on it but never fetches them. |
| `LEARNWREN_WEB_PORT` | `8000` | Host port for the web app. |
| `LEARNWREN_PUBLIC_URL` | `http://LEARNWREN_HOST:LEARNWREN_WEB_PORT` | The origin browsers use, with no trailing slash. Emailed links (verify, reset, email change), CORS and cover/profile image URLs are built on it. Set it to your proxy's address (for example `https://learn.example.com`) when you serve over HTTPS. |
| `LEARNWREN_WEB_BIND` | `0.0.0.0` | Host address the web port listens on. `127.0.0.1` keeps it to this machine (use it for the first run). |
| `LEARNWREN_S3_ACCESS_KEY` / `LEARNWREN_S3_SECRET_KEY` | `learnwren` / `learnwren-change-me` | Object store root credentials, used by the api. **Change the secret** on any machine other people can reach. |
| `LEARNWREN_POSTGRES_PASSWORD` | `learnwren-change-me` | Password for the bundled PostgreSQL. **Change it before the first `docker compose up`.** Postgres keeps it in its volume, so a later change also needs `ALTER USER postgres PASSWORD ...` in the database. Use only letters, digits, `-` and `_`: it goes into a URL. |
| `LEARNWREN_BOOTSTRAP_ADMIN_EMAIL` | unset | The account with this email becomes ADMIN when it logs in verified. See [First run](#first-run). Clear it afterwards. |
| `LEARNWREN_EMAIL_TRANSPORT` | `console` | `console` logs every email (and any link in it) to `docker compose logs api`; `smtp` sends them via `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`. |
| `LEARNWREN_EMAIL_FROM` | `noreply@learnwren.local` | Sender address. |
| `LEARNWREN_STORAGE_QUOTA_GB` | unset | Enables the admin health dashboard's quota bar and alert. |

### Serving other machines

Set `LEARNWREN_HOST` to a name or IP that resolves to the server. Only the
web port needs to be reachable. Nothing else is published to the host.

**Security note.** The database and the object store are not published; only
the web port is. Their credentials sit in `.env`, so change
`LEARNWREN_POSTGRES_PASSWORD` and `LEARNWREN_S3_SECRET_KEY` from the defaults.
Put the web port behind a TLS-terminating reverse proxy of your own (the stack
serves plain HTTP and sets no HSTS header), and set `LEARNWREN_PUBLIC_URL` to
the proxy's `https://` origin. Otherwise emailed links and image URLs still
point at plain-HTTP `LEARNWREN_HOST:LEARNWREN_WEB_PORT`, sending reset tokens
in clear. The session cookie is always
marked `Secure`, so login over plain HTTP works only on `localhost` in some
browsers (Chrome and Firefox; Safari refuses even there). Use HTTPS for
anything beyond a quick local trial.

## Data, backup, upgrade

Two Docker volumes hold everything: `postgres-data` (accounts, course data,
enrolments, progress) and `objectstore-data` (every uploaded file and HLS
output).

- **Back up:** dump the database from the running `postgres` service, and copy
  the object-store volume (named `<directory>_objectstore-data`). Take them
  together, with uploads quiet, so they agree.
  ```bash
  docker compose exec -T postgres pg_dump -U postgres -d learnwren -Fc > learnwren.dump
  docker run --rm -v "learnwren_objectstore-data:/data" -v "$PWD":/backup alpine tar czf /backup/learnwren-objectstore.tgz -C /data .
  ```
- **Restore:** start a fresh stack, then
  `docker compose exec -T postgres pg_restore -U postgres -d learnwren --clean --if-exists < learnwren.dump`
  and untar the files into the object-store volume.
- **Upgrade:** `git pull && docker compose up -d --build`. Data is kept.
- **Start over:** `docker compose down -v` deletes both volumes.

**Upgrading from an emulator-based install.** Earlier versions kept accounts
and data in the Firebase emulators' `emulator-data` volume. There is no
migration to PostgreSQL. Either start fresh (the new stack begins with an
empty database, and your old `emulator-data` volume is left untouched) or stay
on the previous version.

**If you upgrade, start the new stack with `--remove-orphans`:**

```bash
docker compose up -d --build --remove-orphans
```

Without it, the old `emulators` container keeps running (it restarts itself)
and keeps serving your old data on ports 4000, 8080 and 9099 with no
authentication. `docker compose rm emulators` will not remove it, because the
service is no longer in `docker-compose.yml`. If you already upgraded without
the flag, remove it by name: `docker rm -f <project>-emulators-1` (the project
is the checkout's directory name unless you set `COMPOSE_PROJECT_NAME`).

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
  re-authorised against the student's enrolment (a database read). Fine for
  a class, not for a public video site. Chunked video uploads keep their
  progress in api memory: if the api restarts mid-upload the browser reports
  the upload as failed and the instructor uploads again.
- **Durability.** Files are safe in the object store as soon as an upload
  finishes, and accounts and course data are committed to PostgreSQL. The
  api is a single process, and PostgreSQL and the object store each run as one
  container on one machine, so a disk failure loses data unless you back up
  (see above).
- **Accounts are built in.** Passwords are stored as scrypt hashes in
  PostgreSQL. Logout ends only the current browser's session; a password
  reset, password change, email change, suspension or deletion ends every
  session of the account. Expired sessions and email links are removed per user (on that
  user's next login or link, or when the account is deleted), with no
  scheduler, so rows of users who never return stay until their account is
  deleted.
- **TLS.** Not included; front it with your own reverse proxy.
- **Email.** Account verification, password reset, email change and unlock
  links all go through the configured email transport. With `console` they
  appear only in `docker compose logs api`; set `LEARNWREN_EMAIL_TRANSPORT=smtp`
  for real delivery. Links are single use and expire (verify 24 h; reset and
  change email 1 h).

## Troubleshooting

| Symptom | Cause / fix |
| :--- | :--- |
| `web` returns 502 for `/api` right after start | The api waits for the database and object store to pass their health checks; give it ~30 s. `docker compose logs api` shows the boot log. |
| Uploads fail with 5xx, or the api will not start | `docker compose logs api` and `docker compose logs objectstore`; the api creates its buckets on boot and refuses to start if the store rejects the credentials in `.env`. |
| Cover images do not load | They are served at `/api/media/<bucket>/…` from the buckets in `LEARNWREN_PUBLIC_BUCKETS` (set in `docker-compose.yml`); check `docker compose logs api` for the request. |
| Login or register fails with a database error | `docker compose logs api postgres`. If you changed `LEARNWREN_POSTGRES_PASSWORD` after the first start, the volume still holds the old one; run `ALTER USER postgres PASSWORD ...` or start over with `docker compose down -v`. |
| I cannot become admin | The variable must match the email you registered with, and the email must be verified before you log in. Set it, run `docker compose up -d`, then log in again. |
| Port already in use | Change `LEARNWREN_WEB_PORT`. |
