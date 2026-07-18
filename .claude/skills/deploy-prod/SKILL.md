---
name: deploy-prod
description: Use when deploying Learn Wren to production (Firebase / learnwren.com), redeploying after a merge, or when a deploy shipped stale code, a new API route returns 404 in prod, or firebase aborts with "Invalid dotenv file".
---

# Deploying Learn Wren to Production

Full runbook: `docs/deployment.md`. This skill is the failure-tested ritual — every rule below has shipped a broken deploy when skipped.

## The stale-cache Iron Law

`pnpm nx reset` is NOT sufficient. It has twice shipped stale artifacts anyway (2026-06-19 stale web bundle; 2026-07-17 stale api function → live Nest 404 on a new route). Build explicitly, bypassing cache:

```bash
NX_DAEMON=false pnpm exec nx build api --configuration=production --skip-nx-cache
NX_DAEMON=false pnpm exec nx build web --configuration=production --skip-nx-cache
```

## Verify artifacts BEFORE deploying

The deploy's predeploy hooks rebuild — but never trust them. Prove freshness first:

```bash
ls -l dist/apps/api/main.js dist/apps/web/browser/main-*.js   # mtimes = just now
grep -c "<new-feature-marker>" dist/apps/api/main.js           # e.g. a new route path — must be ≥1
```

A stale `dist/` also poisons the "live hash matches dist" check later — both copies are the same stale build.

## Deploy

```bash
NX_DAEMON=false pnpm deploy:prod    # firebase deploy --config firebase.deploy.json -P production
```

(`pnpm deploy` is a pnpm builtin — it never runs firebase. `deploy:preview` = everything except hosting.)

## Verify AFTER deploying

```bash
curl -s https://learn-wren.web.app | grep -o "main-[A-Z0-9]*\.js"   # == dist hash
curl -s https://learn-wren.web.app/api/health                        # 200
curl -s https://learn-wren.web.app/api/<new-route>                   # guarded route: expect 401/403 — 404 means stale function
```

A guarded admin route returning **404 means the deploy shipped stale code** — do not rationalize it as an auth quirk.

## Env / secrets gotchas

- `.env.learn-wren` (gitignored) is the ONLY env mechanism for gen2 functions; predeploy copies it into `dist/apps/api` (fatal if missing). Render via `pnpm secrets:render:deploy`; re-render only when vars change.
- The 1Password `prod` item has historically held multi-line PROSE in fields (SMTP_USER) → firebase's strict dotenv parser aborts. Lint after any render:
  `grep -nvE '^[[:space:]]*$|^[[:space:]]*#|^[A-Z_][A-Z0-9_]*=' .env.learn-wren` (any output = broken line).
- Never `firebase functions:config:set`, never set env vars in the Cloud console (deploy wipes them). `SMTP_PASS` lives in Secret Manager; rotation requires redeploy.
- `LEARNWREN_STORAGE_QUOTA_GB` is intentionally unset (health dashboard shows raw usage); set it in the 1Password item + redeploy when a quota is chosen.

## Common mistakes

| Mistake | Reality |
|---|---|
| "nx reset cleared the cache" | It has shipped stale builds twice. Use `--skip-nx-cache`. |
| "Live hash matches dist, so it's fresh" | Only meaningful if dist itself was verified fresh first. |
| "404 on the new admin route = auth issue" | Guards return 401/403. 404 = the route isn't in the deployed bundle. |
| "I'll re-render secrets to be safe" | Re-rendering can reintroduce 1Password prose breakage. Render only on var changes, then lint. |
