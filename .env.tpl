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

# ── Reserved for later specs ──────────────────────────────────────────
# Cloud Functions deploy spec:  FIREBASE_TOKEN
# DRM/transcoder spec:          DRM_API_KEY, TRANSCODER_WEBHOOK_SECRET
