> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# US-09-04: Self-Hosting — Slice D Design (self-hosted auth and data)

**Date:** 2026-10-01
**Story:** [US-09-04](../../epics/09-non-functional-requirements.md#us-09-04-open-source-and-self-hosting) (EP-09, Non-Functional Requirements)
**Builds on:** [Slice A](./2026-09-25-us-09-04-self-hosting-design.md) (Compose), [Slice B](./2026-09-25-us-09-04-slice-b-ffmpeg-video-design.md) (ffmpeg video), [Slice C](./2026-09-26-us-09-04-slice-c-object-storage-design.md) (object storage)
**Status:** Design approved 2026-10-01. D0 (design), D1 (DocumentStore port, Firestore + in-memory adapters), D2 (PostgreSQL adapter, `LEARNWREN_DATA_STORE`) and D3a (IdentityProvider port, Firebase + in-memory adapters) shipped 2026-10-01; D3b and D3c not built.

---

## 1. Goal and scope

After Slice C the self-hosted stack still runs Firebase Authentication and
Firestore in the Firebase Emulator Suite, a development tool with no
authentication of its own and single-process durability. That is the last
reason US-09-04's "no proprietary services" criterion is only partially met.
Slice D closes it.

Decisions taken with the user:

| Question | Options | Decision |
| :--- | :--- | :--- |
| Strategy | Two backends behind ports · replace Firebase everywhere · self-hosted only in Compose | **Two backends.** learnwren.com stays on Firebase; Compose runs the self-hosted backend. Same pattern as Slice C. |
| Data port | Document port on Postgres · per-aggregate repositories with a relational schema · document port on SQLite | **Document port on PostgreSQL.** |
| Auth | Built-in auth in the api · external OIDC identity server (Keycloak, Authentik) | **Built-in auth in the api.** |

**Out of scope, deliberately:**

- Migrating data from an existing Compose install (emulator export → Postgres).
  The stack is days old; the guide says "fresh install".
- More than one api replica. Several in-memory ceilings from Slices B and C
  already pin the api to one process.
- A relational schema redesign. Postgres serves as a document store.
- Web changes beyond one page. Local identity needs a single email-action
  page (§3.4); nothing else in the web app changes.

## 2. Constraints found in the code (surveyed at `035ef4e`)

- **The browser never talks to Firebase.** The web app has no Firebase SDK.
  Login, registration and every auth flow post to the api, which sets an
  HttpOnly session cookie, valid 5 days (`SESSION_COOKIE_EXPIRES_IN_MS`).
  Replacing the identity provider is an api change with one exception:
- **Firebase's email links land on Firebase's hosted action page**, which applies
  a verify or change-email action and, for a password reset, collects the new
  password, before redirecting to the `continueUrl` built from
  `LEARNWREN_PUBLIC_URL`. The web app has no page of its own for these. The
  account-unlock flow is the precedent for doing it ourselves: the web page
  `/auth/unlock?token=` posts the token to `POST /api/auth/unlock`.
- **Firebase Auth surface:** `updateUser` (8 call sites), `getUser` (7),
  `verifySessionCookie` (5), `setCustomUserClaims` (5), `revokeRefreshTokens`
  (5), `deleteUser` (5), `verifyIdToken` (3), `getUserByEmail` (2),
  `generateEmailVerificationLink` (2), `generateVerifyAndChangeEmailLink` (1),
  `generatePasswordResetLink` (1), `createUser` (1), `createSessionCookie` (1),
  plus one REST call, `accounts:signInWithPassword`, in
  `firebase-auth-rest-client.ts`.
- **Existing auth seams** already funnel most of that: `PasswordVerificationService`,
  `revokeAllUserSessions` (`revoke-sessions.ts`), `SessionCookieService`,
  `FirebaseSessionGuard`.
- **Firestore surface:** about 45 non-test files inject the `FIRESTORE` handle
  directly; there is no repository port. The features used are a small subset:
  `where` with `==` (23) and `in` (1), `orderBy` (7), `limit` (5), `count()` (3),
  `batch()` (3), `recursiveDelete` (2), one `collectionGroup('lessons')`,
  one `FieldPath.documentId`, `FieldValue.delete` (14), and transactions in 16
  files through `runTransactionWithRetry`.
- **Nested subcollections** are in use: `courses/{cid}/modules/{mid}/lessons/{lid}`.
- **All stored values are plain JSON.** Dates are ISO strings; video keys are
  base64. No `Timestamp`, `GeoPoint` or byte fields.
- `libs/api-courses/src/lib/testing/fake-firestore.ts` already reimplements the
  used subset in memory for unit tests.

## 3. Design

### 3.1 Two ports, two backends, one selector each

| Port | Cloud adapter (default) | Self-hosted adapter | Selector |
| :--- | :--- | :--- | :--- |
| `DocumentStore` (new lib `libs/api-document-store`) | Firestore Admin | PostgreSQL | `LEARNWREN_DATA_STORE=firestore\|postgres` |
| `IdentityProvider` (in `libs/api-auth`) | Firebase Authentication | Built-in (`local`) | `LEARNWREN_IDENTITY=firebase\|local` |

Defaults are `firestore` and `firebase`, so learnwren.com and emulator-mode
development do not change. The Compose stack sets `postgres` and `local`, adds a
`postgres:17` container, and **drops the Firebase emulator container**. The api's
`network_mode: service:emulators` goes with it; the api gets its own network
identity again.

`local` identity requires `postgres` data: the selector refuses
`LEARNWREN_IDENTITY=local` with `LEARNWREN_DATA_STORE=firestore` at boot, with a
clear message. Firebase identity on Postgres data is allowed but untested.

### 3.2 `DocumentStore` port

Shaped like Firestore on purpose. It is exactly the subset the code already
speaks, so moving the call sites is import and type changes, not rewrites.

```
store.collection(name) → CollectionRef
store.collectionGroup(name) → Query
CollectionRef.doc(id?) → DocRef            // no id = generated id
DocRef.collection(name) → CollectionRef
DocRef.get() → DocSnap { exists, id, ref, data() }
DocRef.set(data, { merge? }) / update(patch) / delete()
Query.where(field | DOCUMENT_ID, '==' | 'in', value)
Query.orderBy(field, 'asc' | 'desc') / limit(n) / count().get() / get()
store.batch() → { set, update, delete, commit }
store.runTransaction(fn(txn)) → txn.get(DocRef | Query), set, update, delete
store.recursiveDelete(DocRef)
DELETE_FIELD                                // replaces FieldValue.delete()
```

Not in the port, because nothing uses it: `!=`, range operators, `array-contains`,
cursors, listeners, server timestamps. Adding any of them later means adding it
to both adapters and the contract suite.

`update` on a missing document fails with the port's `DocumentNotFound`, matching
Firestore. `runTransactionWithRetry` moves into the new lib and retries on the
port's `TransactionConflict`; each adapter maps its own transient errors to it
(Firestore: gRPC 10, and gRPC 3 "Transaction is invalid or closed"; Postgres:
SQLSTATE `40001` and `40P01`).

### 3.3 PostgreSQL adapter

One table for every collection:

```sql
CREATE TABLE IF NOT EXISTS documents (
  path       text COLLATE "C" PRIMARY KEY,  -- 'courses/c1/modules/m1'
  parent     text NOT NULL,     -- 'courses/c1/modules'  (collection path)
  collection text NOT NULL,     -- 'modules'             (for collectionGroup)
  id         text NOT NULL,     -- 'm1'                  (the DOCUMENT_ID column)
  data       jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS documents_parent ON documents (parent);
CREATE INDEX IF NOT EXISTS documents_collection ON documents (collection);
```

`path` is `COLLATE "C"` so its primary-key index matches `recursiveDelete`'s
`path = $1 OR path LIKE $2`: under the database's default collation (e.g.
`en_US.utf8`), a leading-constant LIKE pattern can't use a non-C index and
falls back to a sequential scan.

No GIN index: no query uses `@>` containment. (ponytail: no index on `data`;
add expression indexes per hot field if a collection grows large enough for
the parent scan to matter.)

| Port operation | SQL |
| :--- | :--- |
| `where(a, '==', v)` | `data -> $field::text = $v::jsonb` — field names are cast to `text` since `->` also takes an integer |
| `where(a, 'in', vs)` | `data -> $field::text = ANY($vs::jsonb[])` |
| `where(DOCUMENT_ID, …)` | on the `id` column |
| `orderBy(a)` | numbers sort numerically, then text `COLLATE "C"` (bytewise, matching Firestore's UTF-8-byte string order), then `path COLLATE "C"` in the last clause's direction; documents lacking the field are excluded (`WHERE data ? 'a'`), as Firestore does |
| `count()` | `SELECT count(*)` |
| `set(merge)` / `update` | `data \|\| $patch`, minus `DELETE_FIELD` keys via `data - 'k'` |
| `recursiveDelete(ref)` | `DELETE … WHERE path = $1 OR path LIKE $1 \|\| '/%'` ($1 with `%`, `_` and `\` escaped, and the LIKE clause's own `ESCAPE` character set, so an id containing `_` cannot match an unrelated sibling) |
| transaction | `BEGIN ISOLATION LEVEL SERIALIZABLE` … `COMMIT`; retries internally up to 5 attempts on SQLSTATE `40001`/`40P01`, then raises `TransactionConflictError` |
| batch | runs `READ COMMITTED` in one transaction (no retry — a batch call site decides how to retry) |

- Driver: `pg` (node-postgres), the one new runtime dependency.
- The schema is created on boot with `CREATE … IF NOT EXISTS`, taking a
  `pg_advisory_xact_lock` first so concurrent `ensureSchema` calls don't race
  on `CREATE … IF NOT EXISTS` — the same idea as `ensureBucket` in Slice C. A
  migration tool waits until a second schema version exists.
- Generated ids use the same 20-character alphabet as Firestore auto-ids, so ids
  look the same in both backends.
- Configuration: `LEARNWREN_POSTGRES_URL` (required when `postgres`), documented
  in `.env.example`.

### 3.4 `IdentityProvider` port

The port as built (`libs/api-auth/src/lib/identity/identity-provider.port.ts`),
named for what each operation does rather than for Firebase:

```ts
export const IDENTITY_PROVIDER = Symbol.for('learnwren.api-auth.identity-provider');
export const SESSION_MAX_AGE_SECONDS = 5 * 24 * 60 * 60;

export interface IdentityUser {
  readonly uid: string;
  readonly email: string;
  readonly emailVerified: boolean;
}

export interface SessionClaims {
  readonly uid: string;
  readonly email: string;
  readonly role: UserRole | undefined;
  readonly emailVerified: boolean;
}

export interface PasswordProof {
  readonly uid: string;
}

export interface MintedSession {
  readonly token: string;
  readonly maxAgeSeconds: number;
}

export type EmailActionKind = 'verify-email' | 'reset-password' | 'change-email';

export interface IdentityProvider {
  createUser(input: { email: string; password: string; displayName: string }): Promise<string>;
  getUser(uid: string): Promise<IdentityUser | null>;
  getUserByEmail(email: string): Promise<IdentityUser | null>;
  updateUser(uid: string, changes: { password?: string; disabled?: boolean; emailVerified?: boolean }): Promise<void>;
  deleteUser(uid: string): Promise<void>;
  setRole(uid: string, role: UserRole): Promise<void>;
  verifyPassword(email: string, password: string): Promise<PasswordProof>;
  createSession(proof: PasswordProof): Promise<MintedSession>;
  verifySession(token: string): Promise<SessionClaims | null>;
  endSession(token: string): Promise<void>;
  revokeAllSessions(uid: string): Promise<void>;
  createEmailActionLink(kind: EmailActionKind, email: string, continuePath: string, newEmail?: string): Promise<string>;
}
```

`verifyPassword` returns an opaque `PasswordProof` rather than a uid because
the Firebase adapter cannot mint a session cookie from a uid alone — only
`createSessionCookie` can, and it needs the ID token `signInWithPassword`
returned, so the proof carries whatever each adapter needs to finish the
sign-in (today, that token) without leaking it into the port's shape.
`endSession` and `revokeAllSessions` own the same-second retry
(`sleepPastNextSecond`, §1 of the auth inventory): that race is Firebase's
whole-second `tokensValidAfterTime`-vs-cookie-`iat` comparison, not a
property of sessions in general, so it lives entirely inside the Firebase
adapter and a local adapter's own session table has no reason to repeat it.

**Firebase adapter:** a thin wrapper over today's calls. `createSession` mints
the ID token through `signInWithPassword` then `createSessionCookie`, as the
login flow does now. Email-action links are the Firebase-generated ones, as today.

**Local adapter**, everything stored through `DocumentStore`:

- `authUsers/{uid}`: email (lower-cased, unique by an `authEmails/{email}` →
  uid index doc written in the same transaction), `passwordHash`, `salt`,
  `emailVerified`, `disabled`, `role`, `createdAt`.
- Password hashing: Node's built-in `crypto.scrypt`, N=2^15, r=8, p=1, 16-byte
  salt, 64-byte key, parameters stored with the hash so they can be raised later.
  Comparison with `crypto.timingSafeEqual`.
- Sessions: `sessions/{sha256(token)}` → `{ uid, expiresAt }`. The cookie holds a
  random 32-byte token; only its hash is stored. Lifetime 5 days, as today. `revokeSessions` deletes every session for the uid.
- Email actions: `emailActions/{sha256(token)}` → `{ uid, kind, newEmail?,
  expiresAt }`, single use (deleted inside the transaction that applies it),
  one hour TTL for reset and change-email, 24 hours for verify.
- Links point at a new web page, `${LEARNWREN_PUBLIC_URL}/auth/action?mode=verify|reset|change-email&token=…`,
  built on the unlock page's pattern. For `verify` and `change-email` it posts
  the token to `POST /api/auth/email-action` on load and then routes to the same
  destination the Firebase flow reaches today (`/login`, or
  `/settings/profile/email-changed`, which then calls the existing confirm
  endpoint). For `reset` it shows a new-password form (the registration
  password policy applies, through `evaluatePasswordPolicy()`) and posts token
  plus password. The endpoint is public, rate-limited like `/api/auth/unlock`,
  and joins `PUBLIC_ALLOWLIST`. In Firebase mode the page is never linked to and
  the endpoint answers `TOKEN_INVALID_OR_EXPIRED`.
- Expired sessions and tokens are rejected on read; a sweep is not needed for
  correctness and is left out.

**Roles:** both adapters return the role in `verifySession`. The users document
keeps mirroring it, as now.

### 3.5 Errors

The ports own the error vocabulary; adapters translate their own codes into it,
and nothing outside an adapter imports `firebase-error.util`.

- Identity: credential failures (wrong password, unknown email, disabled
  account) reuse the existing `InvalidCredentialsException` — no new error
  type for that case. The only new error is `EmailInUseError`, thrown by
  `createUser` and by a change-email link to a taken address. `getUser` and
  `getUserByEmail` resolve `null` for an unknown user rather than throwing;
  `deleteUser` is idempotent and `verifySession` resolves `null` for any
  invalid, expired or revoked token.
- Store: `DocumentNotFound`, `TransactionConflict` (seen only by the retry helper).

The api's public error codes and HTTP statuses do not change; the existing
api-e2e suite locks that.

Security properties of the local adapter:

- Unknown email and wrong password both return `INVALID_CREDENTIALS`, and an
  unknown email still runs scrypt against a fixed dummy hash, so response time
  does not reveal whether an account exists.
- Brute-force lockout stays in `auth-attempts.repository` (moved onto
  `DocumentStore`), so both backends keep it.
- Session cookie flags are unchanged: `HttpOnly`, `Secure`, `SameSite`.
- Tokens are compared only by hash lookup; raw tokens are never stored or logged.

### 3.6 Delivery: four slices

Each slice merges to `main` on its own with every suite green.

| Slice | Content | Behaviour change |
| :--- | :--- | :--- |
| **D0** | This design and the `TECHNICAL_ARCHITECTURE.md` update (two-backend diagram, stack table, Deployment Backends section). | None. |
| **D1** | New lib `api-document-store`: port, Firestore adapter, in-memory adapter (grown from `fake-firestore.ts`), contract suite. Move all ~45 call sites and `runTransactionWithRetry` onto the port. | None. The existing unit, api-e2e and web-e2e suites pass unchanged. |
| **D2** | PostgreSQL adapter; contract suite runs against it; Postgres service in CI. | None by default. |
| **D3a** | `IdentityProvider` port, errors, `publicUrl`, contract suite and in-memory adapter (this doc, §3.4–3.6); Firebase adapter; every call site moved onto the port. | None, with one deliberate exception: admin suspend and delete now call `revokeAllSessions`, which double-revokes in production (the same-second retry, §3.4) where today they revoke once — closing the same-second gap password-change and demote already close. The emulator, which covers dev and e2e, stays a single revoke. |
| **D3b** | Local adapter (scrypt password hashing, `sessions/`/`emailActions/` on `DocumentStore`), `LEARNWREN_IDENTITY` selector, new web page `/auth/action` and public `POST /api/auth/email-action`. | One new web page and endpoint, reachable only from local-identity emails; Firebase mode is unaffected. |
| **D3c** | api-e2e and `tools/*` moved onto the port or a test seam; api-e2e runs on `postgres` + `local` in CI; Compose switches to `postgres` + `local` and drops the emulators; `self-hosting.md` rewritten for the local first-admin flow; the US-09-04 criterion amended to **met**. | Compose only. |

## 4. Ceilings, recorded on purpose

- Postgres is used as a document store: no foreign keys, no relational
  constraints beyond the primary key. Integrity rules stay in the api, as with
  Firestore.
- `orderBy` sorts numbers numerically, before everything else, then text
  bytewise (`COLLATE "C"`, matching Firestore's UTF-8-byte string order). No
  field in the code mixes types within one orderBy clause.
- A field holding JSON `null` passes the `WHERE data ? 'a'` existence filter
  (the key exists even though its value is null) and sorts LAST ascending in
  Postgres (`NULLS LAST` is the default), but FIRST in Firestore. No call
  site orders on a nullable field, so this never bites in practice.
- All collections share one table, so broad SERIALIZABLE reads can escalate
  to relation-level SIRead locks and conflict across unrelated collections;
  the internal transaction retry absorbs it at single-process scale. The
  upgrade path is expression indexes on hot fields.
- One api process (inherited from Slices B and C).
- No data migration from emulator-backed installs.
- Expired sessions and email tokens stay in the table until read.
- `jsonb` does not preserve object key order, so `data()` returns keys in
  Postgres's order; nothing in the code depends on key order.
- `NaN` and `Infinity` cannot be stored (JSON has no representation for
  them), and nothing in the code stores them.

## 5. Verification

1. **Contract suites, one per port, run against every adapter.** DocumentStore:
   in-memory, the Firestore emulator, Postgres. IdentityProvider: Firebase
   against the Auth emulator, local on the in-memory store. They cover every port
   operation and the edges the code relies on: `update` on a missing document,
   `DELETE_FIELD`, `recursiveDelete` depth, `collectionGroup`, `in`, ordering,
   and a conflicting transaction that retries and then succeeds.
2. **Postgres in CI** as a service beside the existing `emulators:exec` one-shot;
   locally through the Compose stack. No Testcontainers dependency.
3. **D1 refactor safety:** the full existing suite passes unchanged on the
   defaults.
4. **Full-stack acceptance (D3):** api-e2e runs a second time with
   `LEARNWREN_DATA_STORE=postgres` and `LEARNWREN_IDENTITY=local`, the same specs
   against a different backend. Then a Compose smoke: register → verify email →
   log in → reset password → create course → upload → play. A web-e2e spec
   covers the `/auth/action` page in all three modes, and the a11y and
   responsive gates pick it up through the route inventory.
5. **Mutation testing:** Stryker scoped to the new adapters and the local
   identity code, held at the repo's 100% bar.
6. **Security review** of the local identity adapter before D3 merges.
