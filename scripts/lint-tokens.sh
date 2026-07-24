#!/usr/bin/env bash
# Token discipline: app/lib styles may only consume --lw-* custom properties.
# Raw hex/oklch outside the token sources & generated output is a violation.
set -euo pipefail
# `(^|[^&])#…` keeps HTML character entities (&#127881;) out of the hex match.
violations=$(grep -rnE '(^|[^&])#[0-9a-fA-F]{3,8}\b|oklch\(' \
  apps/web/src libs/web-admin/src libs/web-auth/src libs/web-catalog/src \
  libs/web-courses/src libs/web-design-system/src libs/web-enrollment/src \
  libs/web-landing/src libs/web-learn/src libs/web-ui/src libs/web-video/src \
  --include='*.scss' --include='*.css' --include='*.html' \
  | grep -v 'web-design-system/src/generated' \
  | grep -v 'web-design-system/src/legacy-tokens.fixture.css' \
  | grep -v 'web-ui/src/styles/recipes.css' || true)
if [[ -n "$violations" ]]; then
  echo "Raw color values found (use --lw-* tokens):"
  echo "$violations"
  exit 1
fi
echo "token lint OK"
