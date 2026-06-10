#!/usr/bin/env bash
# One-time-per-environment GCS provisioning for Learn Wren production.
# Idempotent: safe to re-run. Requires: gcloud CLI authenticated as a
# project owner (gcloud auth login; gcloud config set project learn-wren).
#
# Creates the 5 app buckets, applies CORS, grants the function runtime SA
# and the Transcoder service agent, and enables the required APIs — incl.
# iamcredentials.googleapis.com + the runtime SA's tokenCreator self-grant,
# without which v4 signed-URL minting 500s (ADC has no private key; signing
# goes through the IAM Credentials signBlob API).
#
# Usage: PROJECT_ID=learn-wren REGION=us-central1 tools/deploy/provision-buckets.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

PROJECT_ID="${PROJECT_ID:-learn-wren}"
REGION="${REGION:-us-central1}"

PRIVATE_BUCKETS=("${PROJECT_ID}-video-source" "${PROJECT_ID}-video-output" "${PROJECT_ID}-materials")
PUBLIC_BUCKETS=("${PROJECT_ID}-cover" "${PROJECT_ID}-picture")

PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
TRANSCODER_SA="service-${PROJECT_NUMBER}@gcp-sa-transcoder.iam.gserviceaccount.com"

echo "== Enabling required APIs =="
gcloud services enable transcoder.googleapis.com pubsub.googleapis.com \
  iamcredentials.googleapis.com secretmanager.googleapis.com --project "${PROJECT_ID}"

create_bucket() { # <name> [extra create flags...]
  local name="$1"
  shift
  if gcloud storage buckets describe "gs://${name}" >/dev/null 2>&1; then
    echo "   gs://${name} already exists — skipping create"
  else
    gcloud storage buckets create "gs://${name}" --project "${PROJECT_ID}" \
      --location "${REGION}" --uniform-bucket-level-access "$@"
  fi
}

echo "== Private buckets (signed-URL / service-agent access only) =="
for b in "${PRIVATE_BUCKETS[@]}"; do
  create_bucket "${b}" --public-access-prevention
done

echo "== Public buckets (cover/picture: allUsers read via storage.googleapis.com) =="
for b in "${PUBLIC_BUCKETS[@]}"; do
  create_bucket "${b}"
  gcloud storage buckets add-iam-policy-binding "gs://${b}" \
    --member=allUsers --role=roles/storage.objectViewer >/dev/null
  echo "   gs://${b}: allUsers objectViewer granted"
done

echo "== Bucket CORS =="
gcloud storage buckets update "gs://${PROJECT_ID}-video-output" --cors-file=tools/deploy/gcs-cors.json
gcloud storage buckets update "gs://${PROJECT_ID}-materials" --cors-file=tools/deploy/gcs-cors-materials.json
gcloud storage buckets update "gs://${PROJECT_ID}-video-source" --cors-file=tools/deploy/gcs-cors-source.json

echo "== Runtime SA bucket grants (${RUNTIME_SA}) =="
for b in "${PRIVATE_BUCKETS[@]}" "${PUBLIC_BUCKETS[@]}"; do
  gcloud storage buckets add-iam-policy-binding "gs://${b}" \
    --member="serviceAccount:${RUNTIME_SA}" --role=roles/storage.objectAdmin >/dev/null
  echo "   gs://${b}: objectAdmin granted"
done

echo "== Runtime SA self-grant for v4 URL signing (signBlob) =="
gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role=roles/iam.serviceAccountTokenCreator --project "${PROJECT_ID}" >/dev/null
echo "   ${RUNTIME_SA}: tokenCreator on itself granted"

echo "== Transcoder service agent =="
# Needs the gcloud beta component — fail loudly, or the silent failure below
# surfaces later as a misleading 'service account does not exist'.
if ! gcloud beta --help >/dev/null 2>&1; then
  echo "FATAL: gcloud beta component missing — run: gcloud components install beta --quiet" >&2
  exit 1
fi
# Pre-provision the agent — it otherwise only exists after the first job
# (with up to ~7 min delay), and the bucket bindings below would fail.
# '|| true': re-runs return ALREADY_EXISTS, which is fine (idempotent).
gcloud beta services identity create --service=transcoder.googleapis.com \
  --project "${PROJECT_ID}" || true
gcloud storage buckets add-iam-policy-binding "gs://${PROJECT_ID}-video-source" \
  --member="serviceAccount:${TRANSCODER_SA}" --role=roles/storage.objectViewer >/dev/null
# objectAdmin (not objectCreator): retried jobs overwrite the same output paths.
gcloud storage buckets add-iam-policy-binding "gs://${PROJECT_ID}-video-output" \
  --member="serviceAccount:${TRANSCODER_SA}" --role=roles/storage.objectAdmin >/dev/null
echo "   ${TRANSCODER_SA}: source objectViewer + output objectAdmin granted"

echo "Done. Buckets: ${PRIVATE_BUCKETS[*]} ${PUBLIC_BUCKETS[*]}"
