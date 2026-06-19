#!/usr/bin/env bash
# One-time-per-environment Pub/Sub wiring for transcoder job events.
# RUN AFTER THE FIRST `pnpm deploy:prod` — it derives the push endpoint from the
# deployed gen2 function's run.app URL (serviceConfig.uri). Idempotent.
# Requires: gcloud CLI authenticated as a project owner.
#
# Usage: PROJECT_ID=learn-wren REGION=us-central1 ENV_SUFFIX=prod tools/deploy/provision-pubsub.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

PROJECT_ID="${PROJECT_ID:-learn-wren}"
REGION="${REGION:-us-central1}"
ENV_SUFFIX="${ENV_SUFFIX:-prod}"

TOPIC="learn-wren-transcoder-events-${ENV_SUFFIX}"
DEADLETTER="${TOPIC}-deadletter"
SUB="${TOPIC}-sub"
INVOKER_SA_NAME="learn-wren-transcoder-invoker"
INVOKER_SA="${INVOKER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
PUBSUB_AGENT="service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com"

# Gen2 function URL — never hand-build cloudfunctions.net (it may not exist
# for Firebase-deployed v2 functions). The same string is the OIDC audience.
if ! FUNCTION_ORIGIN=$(gcloud functions describe api --region "${REGION}" \
    --project "${PROJECT_ID}" --format='value(serviceConfig.uri)' 2>/dev/null) \
    || [[ -z "${FUNCTION_ORIGIN}" ]]; then
  echo "FATAL: cannot resolve the api function URL — has the first deploy run?" >&2
  exit 1
fi
PUSH_ENDPOINT="${FUNCTION_ORIGIN}/api/internal/transcoder-events"
echo "Push endpoint + OIDC audience: ${PUSH_ENDPOINT}"

ensure_topic() {
  gcloud pubsub topics describe "$1" --project "${PROJECT_ID}" >/dev/null 2>&1 ||
    gcloud pubsub topics create "$1" --project "${PROJECT_ID}"
}

echo "== Topics =="
ensure_topic "${TOPIC}"
ensure_topic "${DEADLETTER}"

echo "== Dead-letter triage subscription =="
gcloud pubsub subscriptions describe "${DEADLETTER}-sub" --project "${PROJECT_ID}" >/dev/null 2>&1 ||
  gcloud pubsub subscriptions create "${DEADLETTER}-sub" --topic="${DEADLETTER}" --project "${PROJECT_ID}"

echo "== Invoker service account =="
gcloud iam service-accounts describe "${INVOKER_SA}" --project "${PROJECT_ID}" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "${INVOKER_SA_NAME}" \
    --display-name="Learn Wren Transcoder Pub/Sub Invoker" --project "${PROJECT_ID}"

echo "== Pub/Sub service agent: mint OIDC tokens as the invoker SA =="
# Scoped to the invoker SA (not project-wide): the agent only ever needs to
# mint tokens as this one identity.
gcloud iam service-accounts add-iam-policy-binding "${INVOKER_SA}" \
  --member="serviceAccount:${PUBSUB_AGENT}" \
  --role=roles/iam.serviceAccountTokenCreator --project "${PROJECT_ID}" >/dev/null
echo "   ${PUBSUB_AGENT}: tokenCreator on ${INVOKER_SA} granted"

echo "== Public invoker grant (Firebase Hosting /api/** rewrite REQUIREMENT) =="
# Firebase Hosting proxies /api/** to this gen2 function's underlying Cloud Run
# service, which MUST be publicly invokable or every API call 403s. This grant
# is the required counterpart to the rewrite — without it a fresh deploy serves
# zero working API routes, and the SPA fails silently (no error banner). It is
# NOT an auth hole: authentication is enforced in-app per controller
# (FirebaseSessionGuard et al.), and the transcoder webhook is OIDC-verified by
# PubSubPushGuard. Idempotent.
gcloud functions add-invoker-policy-binding api --region "${REGION}" \
  --project "${PROJECT_ID}" --member="allUsers"

echo "== gen2 invoker grant (roles/run.invoker for the Pub/Sub push SA) =="
# Forward-compatibility for an authenticated-push-only future; today the public
# grant above already covers the push SA, and PubSubPushGuard's OIDC checks are
# the actual security boundary on the webhook.
gcloud functions add-invoker-policy-binding api --region "${REGION}" \
  --project "${PROJECT_ID}" --member="serviceAccount:${INVOKER_SA}"

echo "== Dead-letter forwarding grants =="
gcloud pubsub topics add-iam-policy-binding "${DEADLETTER}" \
  --member="serviceAccount:${PUBSUB_AGENT}" --role=roles/pubsub.publisher \
  --project "${PROJECT_ID}" >/dev/null

echo "== Push subscription =="
if gcloud pubsub subscriptions describe "${SUB}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  echo "   ${SUB} already exists — skipping create (delete + re-run to change endpoint/audience)"
else
  gcloud pubsub subscriptions create "${SUB}" \
    --topic="${TOPIC}" --project "${PROJECT_ID}" \
    --push-endpoint="${PUSH_ENDPOINT}" \
    --push-auth-service-account="${INVOKER_SA}" \
    --push-auth-token-audience="${PUSH_ENDPOINT}" \
    --dead-letter-topic="${DEADLETTER}" \
    --max-delivery-attempts=5 \
    --min-retry-delay=10s --max-retry-delay=600s --ack-deadline=60
fi
gcloud pubsub subscriptions add-iam-policy-binding "${SUB}" \
  --member="serviceAccount:${PUBSUB_AGENT}" --role=roles/pubsub.subscriber \
  --project "${PROJECT_ID}" >/dev/null

cat <<EOF

== NEXT STEPS ==
Set these in the 1Password 'prod' vault item, re-render (pnpm secrets:render:deploy),
and redeploy the function (pnpm deploy:preview). The audience must match
LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE BYTE-FOR-BYTE (scheme/host/path).
  LEARNWREN_TRANSCODER_TOPIC=projects/${PROJECT_ID}/topics/${TOPIC}
  LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE=${PUSH_ENDPOINT}
  LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL=${INVOKER_SA}
EOF
