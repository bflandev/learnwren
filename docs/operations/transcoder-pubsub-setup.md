# Transcoder Pub/Sub Setup — EP-03 Slice B

This is a one-time operational task per environment. Run it before deploying
slice B with `LEARNWREN_VIDEO_TRANSCODER=gcp`. CI and local dev use
`LEARNWREN_VIDEO_TRANSCODER=fake` and do not need any of this.

## Prerequisites

- `gcloud` CLI authenticated as a project owner.
- `LEARNWREN_GCP_PROJECT_ID`, `LEARNWREN_TRANSCODER_LOCATION` decided.
- Output bucket already provisioned: `${project}-video-output`.

## Steps

```bash
PROJECT_ID=learn-wren-dev
ENV=dev
LOCATION=us-central1
FUNCTION_URL=https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net/api
INVOKER_SA=learn-wren-transcoder-invoker@${PROJECT_ID}.iam.gserviceaccount.com
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')

# 1. Topic
gcloud pubsub topics create learn-wren-transcoder-events-${ENV}

# 2. Dead-letter topic + pull subscription for triage
gcloud pubsub topics create learn-wren-transcoder-events-${ENV}-deadletter
gcloud pubsub subscriptions create learn-wren-transcoder-events-${ENV}-deadletter-sub \
  --topic=learn-wren-transcoder-events-${ENV}-deadletter

# 3. Invoker SA
gcloud iam service-accounts create learn-wren-transcoder-invoker \
  --display-name="Learn Wren Transcoder Pub/Sub Invoker"

# 4. Grant invoker SA permission to call the function
gcloud functions add-iam-policy-binding api \
  --region=${LOCATION} \
  --member="serviceAccount:${INVOKER_SA}" \
  --role="roles/cloudfunctions.invoker"

# 5. Push subscription with OIDC token + dead-letter
gcloud pubsub subscriptions create learn-wren-transcoder-events-${ENV}-sub \
  --topic=learn-wren-transcoder-events-${ENV} \
  --push-endpoint="${FUNCTION_URL}/api/internal/transcoder-events" \
  --push-auth-service-account="${INVOKER_SA}" \
  --push-auth-token-audience="${FUNCTION_URL}/api/internal/transcoder-events" \
  --dead-letter-topic=learn-wren-transcoder-events-${ENV}-deadletter \
  --max-delivery-attempts=5 \
  --min-retry-delay=10s \
  --max-retry-delay=600s \
  --ack-deadline=60

# 6. Grant Transcoder service agent the buckets
gcloud storage buckets add-iam-policy-binding gs://${PROJECT_ID}-video-source \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-transcoder.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"
gcloud storage buckets add-iam-policy-binding gs://${PROJECT_ID}-video-output \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-transcoder.iam.gserviceaccount.com" \
  --role="roles/storage.objectCreator"
```

The topic name is wired into each job via `JobConfig.config.pubsubDestination` at submit time — there is no global Transcoder API setting to provision separately.

## Verification

```bash
gcloud pubsub subscriptions describe learn-wren-transcoder-events-${ENV}-sub \
  --format='value(pushConfig.pushEndpoint, pushConfig.oidcToken.serviceAccountEmail)'
```

Expected: the push endpoint matches `LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE` and the SA email matches `LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL`.

## Tearing down

```bash
gcloud pubsub subscriptions delete learn-wren-transcoder-events-${ENV}-sub
gcloud pubsub subscriptions delete learn-wren-transcoder-events-${ENV}-deadletter-sub
gcloud pubsub topics delete learn-wren-transcoder-events-${ENV}-deadletter
gcloud pubsub topics delete learn-wren-transcoder-events-${ENV}
gcloud iam service-accounts delete ${INVOKER_SA}
```
