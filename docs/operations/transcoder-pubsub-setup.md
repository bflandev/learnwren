# Transcoder Pub/Sub Setup — gen2

One-time operational task per environment. CI and local dev use
`LEARNWREN_VIDEO_TRANSCODER=fake` and need none of this.

**The executable form of this runbook is `tools/deploy/provision-pubsub.sh`**
(idempotent; run as `PROJECT_ID=learn-wren REGION=us-central1 ENV_SUFFIX=prod
tools/deploy/provision-pubsub.sh`). This document explains what it does and why.

## Prerequisites

- `gcloud` CLI authenticated as a project owner.
- The `api` function deployed at least once (`pnpm deploy:prod`) — the push
  endpoint derives from the live function URL.
- Buckets + Transcoder service-agent grants provisioned
  (`tools/deploy/provision-buckets.sh`).

## What the script does (gen2-corrected)

1. **Topics**: `learn-wren-transcoder-events-<env>` plus a dead-letter topic
   and a pull triage subscription on the dead-letter.
2. **Invoker SA**: `learn-wren-transcoder-invoker@<project>.iam.gserviceaccount.com`.
3. **Pub/Sub service agent grant**: `service-<projectNumber>@gcp-sa-pubsub.iam.gserviceaccount.com`
   gets `roles/iam.serviceAccountTokenCreator` **scoped to the invoker SA**
   (required to mint the OIDC push tokens — omitted entirely from the old
   gen1 runbook).
4. **Invoker grant (gen2)**: `gcloud functions add-invoker-policy-binding api`
   — grants `roles/run.invoker` on the function's underlying Cloud Run
   service. The old `gcloud functions add-iam-policy-binding …
   --role=roles/cloudfunctions.invoker` does **not** gate gen2 invocation.
   Note: the function is public anyway (Firebase Hosting rewrite requirement),
   so the in-app `PubSubPushGuard` OIDC validation — not IAM — is the real
   security boundary; the grant is forward-compatibility.
5. **Push endpoint + audience**: derived from
   `gcloud functions describe api --format='value(serviceConfig.uri)'` —
   the run.app URL. Never hand-build
   `https://<region>-<project>.cloudfunctions.net/api`: Firebase-deployed v2
   functions sometimes have no cloudfunctions.net endpoint, and the path
   shape differs. The push endpoint is
   `<serviceConfig.uri>/api/internal/transcoder-events` and the **same exact
   string** is the OIDC token audience.
6. **Push subscription** with OIDC auth, dead-letter after 5 attempts,
   retry backoff 10s–600s, ack deadline 60s.

The topic is wired into each job via `JobConfig.config.pubsubDestination` at
submit time — no global Transcoder setting exists. The env var
`LEARNWREN_TRANSCODER_TOPIC` must carry the **full resource path**
(`projects/<project>/topics/<name>`); the code passes it raw.

## Matching the runtime env

The guard (`libs/api-courses/src/lib/video/webhook/pubsub-push.guard.ts`)
validates: token signature, `iss === https://accounts.google.com`, unexpired,
`aud` **byte-equal** to `LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE` (scheme, host,
path, trailing slash), `email === LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL`, and
`email_verified === true`. The script prints the three env values; only
`LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE` is vault-held (1Password `prod` item) —
the topic path and invoker SA email are committed literals in `.env.deploy.tpl`.
Re-render and `pnpm deploy:preview` after wiring.

## Verification

```bash
gcloud pubsub subscriptions describe learn-wren-transcoder-events-prod-sub \
  --format='value(pushConfig.pushEndpoint, pushConfig.oidcToken.serviceAccountEmail)'
```

Expected: push endpoint matches `LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE`; SA
matches `LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL`. Then run one real video
through upload → transcode → playback and confirm the dead-letter
subscription stays empty:

```bash
gcloud pubsub subscriptions pull learn-wren-transcoder-events-prod-deadletter-sub --limit=5
```

## Tearing down

```bash
gcloud pubsub subscriptions delete learn-wren-transcoder-events-prod-sub
gcloud pubsub subscriptions delete learn-wren-transcoder-events-prod-deadletter-sub
gcloud pubsub topics delete learn-wren-transcoder-events-prod-deadletter
gcloud pubsub topics delete learn-wren-transcoder-events-prod
gcloud iam service-accounts delete learn-wren-transcoder-invoker@learn-wren.iam.gserviceaccount.com
```

## Bucket CORS

Applied by `tools/deploy/provision-buckets.sh`: video output (`tools/deploy/gcs-cors.json`,
segment GETs), materials (`gcs-cors-materials.json`, browser PUT preflights),
video source (`gcs-cors-source.json`, resumable chunk PUTs — defensive). Verify
with `node tools/deploy/verify-gcs-cors.mjs '<signed-segment-url>'` and
`node tools/deploy/verify-gcs-cors.mjs <materials-bucket> --preflight-put`.
