# .env.deploy.tpl — 1Password template for the PRODUCTION functions runtime env.
# Render with: pnpm secrets:render:deploy
#   (op inject -i .env.deploy.tpl -o .env.learn-wren)
# The rendered .env.learn-wren is GITIGNORED. tools/deploy/patch-functions-package.mjs
# copies it into dist/apps/api at deploy time, where `firebase deploy` reads it —
# dotenv files in the functions source dir are the ONLY supported gen2 env
# mechanism (functions:config:set is legacy/dead; console-set Cloud Run env vars
# are wiped on every deploy).
#
# SMTP_PASS is deliberately ABSENT: it lives in Cloud Secret Manager
# (`firebase functions:secrets:set SMTP_PASS`) and binds via the `secrets:`
# option in apps/api/src/main.ts.
# NEVER add a key starting with FIREBASE_, X_GOOGLE_ or EXT_ — reserved
# prefixes abort the deploy.

NODE_ENV=production
LEARNWREN_FIREBASE_TARGET=production
LEARNWREN_API_FIREBASE_PROJECT_ID=learn-wren
LEARNWREN_FIREBASE_WEB_API_KEY=op://learnwren/Web SDK Config/apiKey

LEARNWREN_CORS_ORIGINS=https://learnwren.com,https://www.learnwren.com,https://learn-wren.web.app,https://learn-wren.firebaseapp.com

# PHASED VALUE (vault-held): LEARNWREN_PUBLIC_URL pins the GCS resumable-upload
# session origin (video-storage.adapter.ts) — browser VIDEO uploads only work
# from a page origin byte-equal to it (bucket CORS does NOT override the
# session origin). It also drives email links. Start as
# https://learn-wren.web.app (Phases B-C); flip to https://learnwren.com in
# Phase D once the custom domain serves, then redeploy functions.
LEARNWREN_PUBLIC_URL=op://learnwren/prod/LEARNWREN_PUBLIC_URL

LEARNWREN_EMAIL_TRANSPORT=smtp
LEARNWREN_EMAIL_FROM=noreply@learnwren.com
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=op://learnwren/prod/SMTP_USER

LEARNWREN_VIDEO_TRANSCODER=gcp
LEARNWREN_VIDEO_SOURCE_BUCKET=learn-wren-video-source
LEARNWREN_VIDEO_OUTPUT_BUCKET=learn-wren-video-output
LEARNWREN_GCP_PROJECT_ID=learn-wren
LEARNWREN_TRANSCODER_LOCATION=us-central1
# Full resource path — transcoder JobConfig.pubsubDestination requires
# projects/{project}/topics/{name}, and the code passes this value raw.
LEARNWREN_TRANSCODER_TOPIC=projects/learn-wren/topics/learn-wren-transcoder-events-prod
LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE=op://learnwren/prod/LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE
LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL=learn-wren-transcoder-invoker@learn-wren.iam.gserviceaccount.com

LEARNWREN_MATERIALS_BUCKET=learn-wren-materials
LEARNWREN_COVER_STORAGE=firebase
LEARNWREN_COVER_BUCKET=learn-wren-cover
LEARNWREN_COVER_PUBLIC_BASE_URL=https://storage.googleapis.com/learn-wren-cover
LEARNWREN_PICTURE_STORAGE=firebase
LEARNWREN_PICTURE_BUCKET=learn-wren-picture
LEARNWREN_PICTURE_PUBLIC_BASE_URL=https://storage.googleapis.com/learn-wren-picture
