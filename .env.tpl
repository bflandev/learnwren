# .env.tpl — 1Password secret template for learnwren
# Render .env with: pnpm secrets:render   (op inject -i .env.tpl -o .env)
# Run a one-off:    pnpm secrets:run -- <command>  (op run --env-file=.env.tpl -- <command>)
#
# DO NOT commit .env to version control (it is gitignored).

# ── Workspace identity (canary) ───────────────────────────────────────
# Round-trip proof that the op pipeline works. Non-secret value.
WORKSPACE_NAME=op://learnwren/Workspace/name

# ── Web SDK config (target=production) ────────────────────────────────
# Public-by-design Firebase Web SDK keys. Baked into apps/web at build
# time by tools/web/build-environment.ts when LEARNWREN_FIREBASE_TARGET=production.
LEARNWREN_WEB_FIREBASE_API_KEY=op://learnwren/Web SDK Config/apiKey
LEARNWREN_WEB_FIREBASE_AUTH_DOMAIN=op://learnwren/Web SDK Config/authDomain
LEARNWREN_WEB_FIREBASE_PROJECT_ID=op://learnwren/Web SDK Config/projectId
LEARNWREN_WEB_FIREBASE_APP_ID=op://learnwren/Web SDK Config/appId
LEARNWREN_WEB_FIREBASE_STORAGE_BUCKET=op://learnwren/Web SDK Config/storageBucket
LEARNWREN_WEB_FIREBASE_MESSAGING_SENDER_ID=op://learnwren/Web SDK Config/messagingSenderId

# ── Admin SDK config (target=production) ──────────────────────────────
# Real project ID used by libs/api-firebase when targeting production.
# Service-account JSON path (FIREBASE_SERVICE_ACCOUNT_JSON_PATH) is set
# in the developer's shell init, not here — the path is per-machine.
LEARNWREN_API_FIREBASE_PROJECT_ID=op://learnwren/Admin SDK Config/projectId

# ── Reserved for later specs ──────────────────────────────────────────
# Cloud Functions deploy spec:  FIREBASE_TOKEN
# DRM/transcoder spec:          DRM_API_KEY, TRANSCODER_WEBHOOK_SECRET
