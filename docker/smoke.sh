#!/bin/sh
# Self-hosting smoke check: builds and starts the stack, then drives the whole
# product through nginx (http://localhost:PORT/api): register and verify an
# account from the emailed link, reset its password, log in as the bootstrap
# ADMIN, promote a second account to instructor, create a course, upload a
# video, wait for ffmpeg to transcode it, and fetch the playlist, key and one
# segment. Exit 0 = the stack works end to end.
#
# Usage: docker/smoke.sh [--down] [--force]
#   --down   tears the stack down afterwards (volumes are kept)
#   --force  runs even though the stack already has an api container
#
# It creates real accounts (the first becomes ADMIN) and restarts the api with
# the smoke account as bootstrap admin, so it refuses to run against a stack
# that already exists: run it under its own COMPOSE_PROJECT_NAME, never against
# a live install. Needs: sh, curl, sed, grep, od.
# The test video is made with the ffmpeg bundled in the api image.
set -eu
cd "$(dirname "$0")/.."

DOWN=
FORCE=
for arg in "$@"; do
  case "$arg" in
    --down) DOWN=1 ;;
    --force) FORCE=1 ;;
    *) echo "usage: docker/smoke.sh [--down] [--force]" >&2; exit 2 ;;
  esac
done
if [ -z "$FORCE" ] && [ -n "$(docker compose ps -aq api 2>/dev/null)" ]; then
  echo "smoke: project ${COMPOSE_PROJECT_NAME:-$(basename "$PWD")} already has an api container (running or stopped)." >&2
  echo "smoke: this script would restart it with a smoke admin account. Use another" >&2
  echo "smoke: COMPOSE_PROJECT_NAME, or pass --force if this stack is disposable." >&2
  exit 1
fi

PORT="${LEARNWREN_WEB_PORT:-8000}"
BASE="http://localhost:${PORT}"
API="${BASE}/api"
TMP="$(mktemp -d)"
VIDEO="$TMP/smoke.mp4"
trap 'rm -rf "$TMP"' EXIT

rand() { od -An -N6 -tx1 /dev/urandom | tr -d ' \n'; }
ID="$(date +%s)-$(rand)"
ADMIN_EMAIL="smoke-${ID}@example.com"
INST_EMAIL="smoke-${ID}-inst@example.com"
PASS1="Smoke-$(rand)-pass1"
PASS2="Smoke-$(rand)-pass2"

# The api reads this on every login: the smoke account becomes the first admin.
export LEARNWREN_BOOTSTRAP_ADMIN_EMAIL="$ADMIN_EMAIL"

fail() {
  echo "smoke: FAIL: $*" >&2
  [ -f "$TMP/body" ] && head -c 2000 "$TMP/body" >&2 && echo >&2
  exit 1
}
step() { echo "smoke: $*"; }

# req METHOD PATH [JSON]: body → $TMP/body, headers → $TMP/headers, code → $STATUS.
# Sends $COOKIE (the session cookie is Secure, so curl's jar won't replay it over http).
req() {
  if [ $# -ge 3 ]; then
    STATUS=$(curl -sS -o "$TMP/body" -D "$TMP/headers" -w '%{http_code}' -X "$1" \
      -H "Cookie: ${COOKIE:-none=0}" -H 'Content-Type: application/json' --data "$3" "$API$2")
  else
    STATUS=$(curl -sS -o "$TMP/body" -D "$TMP/headers" -w '%{http_code}' -X "$1" \
      -H "Cookie: ${COOKIE:-none=0}" "$API$2")
  fi
}
expect() { [ "$STATUS" = "$1" ] || fail "$2: expected HTTP $1, got $STATUS"; }
field() { grep -o "\"$1\":\"[^\"]*\"" "$TMP/body" | head -1 | cut -d'"' -f4; }
session_cookie() { sed -n 's/^[Ss]et-[Cc]ookie: \(__session=[^;]*\).*/\1/p' "$TMP/headers" | head -1; }

# email_token LOG_TAG EMAIL: the token from the newest console-transport email.
email_token() {
  for _ in $(seq 1 15); do
    t=$(docker compose logs api 2>/dev/null \
      | sed -n "s/.*\[$1\] to=$2 url=[^ ]*[?&]token=\([A-Za-z0-9_-]*\).*/\1/p" | tail -1)
    if [ -n "$t" ]; then echo "$t"; return 0; fi
    sleep 1
  done
  fail "no [$1] email for $2 in docker compose logs api"
}

# register_and_verify EMAIL PASSWORD NAME: prints the new uid.
register_and_verify() {
  COOKIE=
  req POST /auth/register "{\"email\":\"$1\",\"password\":\"$2\",\"displayName\":\"$3\"}"
  expect 201 "register $1"
  uid=$(field uid)
  token=$(email_token verification-email "$1")
  req POST /auth/email-action "{\"mode\":\"verify-email\",\"token\":\"$token\"}"
  expect 204 "verify $1"
  echo "$uid"
}

# login EMAIL PASSWORD: sets $COOKIE and $ROLE.
login() {
  COOKIE=
  req POST /auth/login "{\"email\":\"$1\",\"password\":\"$2\"}"
  expect 200 "login $1"
  ROLE=$(field role)
  COOKIE=$(session_cookie)
  [ -n "$COOKIE" ] || fail "login $1: no session cookie"
}

docker compose up -d --build

step "waiting for the api"
for _ in $(seq 1 90); do
  if curl -sf "$API/health" >/dev/null; then break; fi
  sleep 2
done
curl -sf "$API/health" | grep -q '"status":"ok"' || fail "api health"
curl -sf "$BASE/" | grep -q '<app-root' || fail "SPA shell"
curl -sf "$BASE/courses" | grep -q '<app-root' || fail "SPA fallback"

COOKIE=
req GET /_test/users/x
expect 404 "the /api/_test seam must be off in Compose"

step "register + verify $ADMIN_EMAIL"
register_and_verify "$ADMIN_EMAIL" "$PASS1" "Smoke Admin" >/dev/null

step "password reset"
COOKIE=
req POST /auth/request-password-reset "{\"email\":\"$ADMIN_EMAIL\"}"
expect 202 "request password reset"
token=$(email_token password-reset-email "$ADMIN_EMAIL")
req POST /auth/email-action "{\"mode\":\"reset-password\",\"token\":\"$token\",\"newPassword\":\"$PASS2\"}"
expect 204 "apply password reset"
COOKIE=
req POST /auth/login "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$PASS1\"}"
[ "$STATUS" != 200 ] || fail "old password still logs in"

step "login with the new password (bootstrap admin)"
login "$ADMIN_EMAIL" "$PASS2"
[ "$ROLE" = ADMIN ] || fail "expected role ADMIN, got $ROLE"
ADMIN_COOKIE=$COOKIE
req GET /admin/health
expect 200 "admin health"

# Only instructors author courses: the admin promotes a second account.
step "register + promote an instructor"
INST_UID=$(register_and_verify "$INST_EMAIL" "$PASS1" "Smoke Instructor")
COOKIE=$ADMIN_COOKIE
req POST "/admin/users/$INST_UID/promote"
expect 201 "promote instructor"
login "$INST_EMAIL" "$PASS1"
[ "$ROLE" = INSTRUCTOR ] || fail "expected role INSTRUCTOR, got $ROLE"

step "create a course, module and lesson"
req POST /courses '{"title":"Smoke course","description":"Created by docker/smoke.sh"}'
expect 201 "create course"
CID=$(field id)
req POST "/courses/$CID/modules" '{"title":"Smoke module"}'
expect 201 "create module"
MID=$(field id)
req POST "/courses/$CID/modules/$MID/lessons" '{"title":"Smoke lesson"}'
expect 201 "create lesson"
LID=$(field id)

step "upload a video"
# 2 s at 640x360: the transcoder refuses sources below its lowest rung (360p).
docker compose exec -T api sh -c '
  "$(node -p "require(\"@ffmpeg-installer/ffmpeg\").path")" -v error -y \
    -f lavfi -i testsrc=size=640x360:rate=25 -t 2 -pix_fmt yuv420p -c:v libx264 /tmp/smoke.mp4 \
  && cat /tmp/smoke.mp4 && rm /tmp/smoke.mp4' > "$VIDEO" || fail "could not make the test video"
SIZE=$(wc -c < "$VIDEO" | tr -d ' ')
req POST "/courses/$CID/modules/$MID/lessons/$LID/video/upload-session" \
  "{\"sizeBytes\":$SIZE,\"contentType\":\"video/mp4\"}"
expect 201 "create upload session"
VID=$(field videoId)
UPLOAD_PATH=$(field uploadSessionUri | sed -E 's#^(https?://[^/]+)?/api##')
# A chunk sent as JSON is eaten by the body parser: the api must refuse it at
# once, not hold the connection open until nginx times out.
STATUS=$(curl -sS -o "$TMP/body" -w '%{http_code}' --max-time 10 -X PUT -H "Cookie: $COOKIE" \
  -H 'Content-Type: application/json' -H 'Content-Range: bytes 0-1/2' --data '{}' "$API$UPLOAD_PATH") || STATUS=timeout
expect 400 "upload chunk sent as JSON"
STATUS=$(curl -sS -o "$TMP/body" -w '%{http_code}' -X PUT -H "Cookie: $COOKIE" \
  -H 'Content-Type: application/octet-stream' -H "Content-Range: bytes 0-$((SIZE - 1))/$SIZE" --data-binary "@$VIDEO" "$API$UPLOAD_PATH")
expect 200 "upload video bytes"
req POST "/videos/$VID/upload-complete"
expect 200 "upload complete"

step "waiting for the transcode"
STATE=
for _ in $(seq 1 90); do
  req GET "/videos/$VID"
  STATE=$(field state)
  case "$STATE" in
    READY) break ;;
    FAILED) fail "transcode failed" ;;
  esac
  sleep 2
done
[ "$STATE" = READY ] || fail "video never became READY (last state: $STATE)"

step "playback: master, rendition, key, segment"
req GET "/playback/manifest/$VID"
expect 200 "master playlist"
grep -q '^#EXTM3U' "$TMP/body" || fail "master is not an m3u8"
RENDITION=$(grep -v '^#' "$TMP/body" | grep . | head -1 | sed -E 's#^(https?://[^/]+)?/api##')
req GET "$RENDITION"
expect 200 "rendition playlist"
grep -q 'URI="/api/playback/keys/' "$TMP/body" || fail "rendition has no key URI"
SEGMENT=$(grep -v '^#' "$TMP/body" | grep . | head -1 | sed -E 's#^(https?://[^/]+)?/api##')
req GET "/playback/keys/$VID"
expect 200 "decryption key"
[ "$(wc -c < "$TMP/body" | tr -d ' ')" = 16 ] || fail "key is not 16 bytes"
req GET "$SEGMENT"
expect 200 "segment $SEGMENT"
[ "$(wc -c < "$TMP/body" | tr -d ' ')" -gt 0 ] || fail "empty segment"

echo "smoke: ok ($BASE, project ${COMPOSE_PROJECT_NAME:-default})"
if [ -n "$DOWN" ]; then docker compose down; fi
