# .env.tpl — 1Password secret template for learnwren
# Render .env with: pnpm secrets:render   (op inject -i .env.tpl -o .env)
# Run a one-off:    pnpm secrets:run -- <command>  (op run --env-file=.env.tpl -- <command>)
#
# DO NOT commit .env to version control (it is gitignored).

# ── Workspace identity (canary) ───────────────────────────────────────
# Round-trip proof that the op pipeline works. Non-secret value.
WORKSPACE_NAME=op://learnwren/Workspace/name

# ── Admin SDK config (target=production) ──────────────────────────────
# Real project ID used by libs/api-firebase when targeting production.
# Service-account JSON path (FIREBASE_SERVICE_ACCOUNT_JSON_PATH) is set
# in the developer's shell init, not here — the path is per-machine.
LEARNWREN_API_FIREBASE_PROJECT_ID=op://learnwren/Admin SDK Config/projectId

# ── Auth REST API (target=production) ────────────────────────────────
# Web API key used server-side by FirebaseAuthRestClient to verify
# passwords against identitytoolkit.googleapis.com. Public-by-design
# value (Firebase publishes it); rendered through 1Password for parity
# with other Firebase config.
FIREBASE_WEB_API_KEY=op://learnwren/Web SDK Config/apiKey

# ── Email transport (unlock email only) ──────────────────────────────
# Verification + password-reset emails are sent by Firebase. The unlock
# email goes through Nodemailer. In dev/emulator, default to a console
# transport that logs the unlock URL to stdout. Prod overrides to smtp.
LEARNWREN_EMAIL_TRANSPORT=console
LEARNWREN_EMAIL_FROM=noreply@learnwren.local
# Required when LEARNWREN_EMAIL_TRANSPORT=smtp (uncomment and fill in):
# SMTP_HOST=<host>
# SMTP_PORT=<port>
# SMTP_USER=<user>
# SMTP_PASS=<password>

# ── Video upload (EP-03) ─────────────────────────────────────────────
# Cloud Storage bucket for raw instructor uploads (before transcoding).
# Create with: gsutil mb -p <project> -l us-central1 gs://<bucket-name>
# Grant Cloud Functions SA: roles/storage.objectAdmin on the bucket.
LEARNWREN_VIDEO_SOURCE_BUCKET=op://learnwren/dev/LEARNWREN_VIDEO_SOURCE_BUCKET
# Number of minutes before an UPLOADING video is considered stuck.
LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES=30

# ── Video transcoding (EP-03 slice B) ────────────────────────────────
# Output bucket: Transcoder API writes encrypted HLS playlists + segments
# here. Slice C reads via signed URLs. Provision separately from the source
# bucket (see docs/operations/transcoder-pubsub-setup.md).
LEARNWREN_VIDEO_OUTPUT_BUCKET=op://learnwren/dev/LEARNWREN_VIDEO_OUTPUT_BUCKET

# Transcoder selection: 'gcp' (real GCP Transcoder API) or 'fake' (in-memory
# adapter for CI and local dev). The env validator rejects 'fake' when
# NODE_ENV=production.
LEARNWREN_VIDEO_TRANSCODER=fake

# Only required when LEARNWREN_VIDEO_TRANSCODER=gcp:
LEARNWREN_GCP_PROJECT_ID=op://learnwren/dev/LEARNWREN_GCP_PROJECT_ID
LEARNWREN_TRANSCODER_LOCATION=us-central1
LEARNWREN_TRANSCODER_TOPIC=op://learnwren/dev/LEARNWREN_TRANSCODER_TOPIC
LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE=op://learnwren/dev/LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE
LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL=op://learnwren/dev/LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL

# Web client poll interval while a video is TRANSCODING. Override in e2e
# to reduce wall-clock duration of tests.
LEARNWREN_WEB_VIDEO_POLL_INTERVAL_MS=5000

# ── Video playback (EP-03 slice C) ───────────────────────────────────
# Segment URL TTL in seconds. Cloud Storage v4 signed URLs minted on
# every manifest fetch expire after this window. 4 h matches the
# architecture spec (long-pause tolerance for a single owner session).
LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC=14400

# ── Reserved for later specs ──────────────────────────────────────────
# Cloud Functions deploy spec:  FIREBASE_TOKEN
# DRM/transcoder spec:          DRM_API_KEY, TRANSCODER_WEBHOOK_SECRET
