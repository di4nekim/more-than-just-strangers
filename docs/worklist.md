# Worklist

Status of the items surfaced by the 2026-09-14 audit (`docs/mtjs-audit-report.html`)
and the work that followed. Branch: `frontend-prod-deployment`.

Legend: ✅ done · 🔄 in progress · 🟡 partial / needs verification · ⬜ open
Effort: **XS** < 30 min · **S** 1–2 h · **M** half a day · **L** multi-day

## Done ✅

| Commit | What |
|---|---|
| `1486b73` | Blockers: `endConversation` handler + state clearing, messages-route IDOR + limit clamp, `/api/debug` gated in prod, type-checking re-enabled, `.env.example` |
| `714105a` | Participant authorization in `sendMessage` and `syncConversation` |
| `4bb0287` | Audit worklist: `updatePresence` response, `fetchChatHistory` clamp, duplicate-messageId 409, `onDisconnect` by connectionId, atomic question advance, create-once matchmaking, direct-path guards, merged `'error'` handler, `conversationMetadata` populated, send button clears, Q36 completion, a11y basics, CORS allowlist, `unsafe-eval` removed |
| `7456400` | Test suite repaired and rebuilt (249 → green); obsolete v2-mock suites removed |
| `e0c5e75` | Gated-suite audit: dead suites replaced/removed, e2e + HTTP suites repaired and token-gated |
| `d8fd3fe` | `onDisconnect` / `syncConversation` / `updatePresence` unit suites, deploy smoke test, real-handler messages-route suite, ratcheting coverage gate + GitHub Actions |

| 2026-09-16 | Tier 1 (below): payload-verified `conversationMetadata` + new `conversationSync` / `conversationEnded` handlers, `endConversation` payload-shape bug, matchmaking Cancel + soft timeout, token redaction in every lambda log, dependency cleanup, README accuracy, `.DS_Store` untracked, stray files removed |

| 2026-09-21 | Items 6, 12, 13, 14: real identities via `partnerProfile` / `displayNameFor`, connection banner + presence dot (typing UI removed — server deprecated it), one canonical `/signin` with `/firebase-signin` redirecting and post-login → `/home`, single-column phone layouts on chat / home / congrats / sign-in; +40 tests |

Suite: **365 passing / 0 failing / 32 gated · 27 of 27 suites · 40.2% stmts / 45.7% lines.**

## Tier 1 — high importance, low effort ✅ (done 2026-09-16)

| # | Item | Effort | Outcome |
|---|---|---|---|
| 1 | ✅ `conversationMetadata` field names verified against the lambdas' source | XS–S | `currentState` carries **no** conversation fields (the old code read them anyway); the client now requests `conversationSync` when a chatId is known and has new `conversationSync` + `conversationEnded` handlers populating the metadata. Found and fixed along the way: **`endConversation` read `chatId` from the body root while the client sends `data.chatId` — ending a chat over the socket could never succeed.** |
| 2 | ✅ Token redaction in lambda logs | S | `shared/logging.js` (`redactEvent` / `redactBody` / `redactString`, 16 tests) applied to 20 log sites in 11 files; `setReady`'s 400 response no longer echoes the raw payload |
| 3 | ✅ Cancel + soft timeout on "Finding a match…" | S | `cancelMatchmaking()` on the context (leaves the queue via `setReady({ ready: false })`, rejects the pending search); CANCEL SEARCH button; 60 s "still looking" notice with KEEP WAITING — never auto-cancels |
| 4 | ✅ Dependency cleanup | S | `aws-cdk-lib`, `constructs`, `react-devtools`, `wscat`, `process` → devDependencies; `boto3`/`wscat` dropped from `serverExternalPackages`; lockfile resynced; production build passes |
| 5 | ✅ Housekeeping | XS | README claims corrected (tests, coverage gate, 10 lambdas, `cp .env.example`); `.DS_Store` ignored and untracked; empty, unreferenced `server/index.js` deleted. `server/lambdas/onDisconnect/package.json` is **tracked**, so it and its untracked lockfile were left — see item 27 |

## Tier 2 — high importance, medium effort ⬜

| # | Item | Effort | Notes |
|---|---|---|---|
| 6 | ✅ Placeholder identities → real profile data | M | Done 2026-09-21: message labels, home greeting/partner line, congrats names all come from `displayNameFor` (self → profile name → "You"; partner → `partnerProfile` → "Your match"; never a fake name); the fabricated "5* NEW MESSAGES" is now a truthful last-message preview. **But see 6a** — the data behind it is mostly missing today. |
| 6a | Store and return real display names server-side. `/api/user/[userId]/profile` returns only `{ userId, displayName }` and defaults `displayName` to the literal `'Anonymous'`, so `partnerProfile.name`/`email` are always null and most users currently see "Your match" | S–M | Without this, item 6 is wired but shows fallbacks; the client already treats `'Anonymous'` as "no name" |
| 7 | Run the two gated suites with a real token: `ENABLE_INTEGRATION_TESTS=true FIREBASE_TEST_ID_TOKEN=<id token> npx jest server/lambdas/endConversation __tests__/api/integration` | S + infra | Only way to prove the e2e / HTTP contracts |
| 8 | Profile the post-chat-start effect loop (`act()` never settles in tests) | M | May be real CPU burn in the browser |
| 9 | Move the WS token off the query string (header / first authenticated message) | M | Companion to #2; touches client + `shared/auth` |
| 10 | Rate limiting on a shared store (KV/Upstash); rewire or delete the CSRF module | M | Both are no-ops on serverless today |
| 11 | Real-handler tests for the remaining Next.js API routes (`__tests__/api/messages-route.test.js` is the template) | M | Replaces the canned-data suites |
| 12 | ✅ Sign-in flow | M | Done 2026-09-21. The premise was half-right: `/signin` was already a stub redirecting to `/firebase-signin`; the real bug was *inside* the page (signed-in effect → `/home`, submit handler → `/`). Now `/signin` is canonical (it's what `requireAuth`, ChatRoom and not-found link to), `/firebase-signin` redirects (page + middleware 307, query preserved), post-login uses `router.replace('/home')` or a validated `?next=`, and the landing page bounces signed-in users to `/home` (was a 4-hop redirect chain for START). 16 new tests. |
| 12a | Decide whether `conversationEnded` should also clear `hasActiveChat` / `userMetadata.chatId` on the partner's client (the server already clears both users' `chatId`) | S | Surfaced by item 1; changes the partner's happy path, so left as a decision |
| 12b | Rebuild `.aws-sam/build` before the next deploy — it still holds pre-redaction copies of the lambdas | XS | Build output, not source; stale until `sam build` |
| 12c | Demote the full-event INFO dumps in every lambda to a `LOG_LEVEL`-gated debug path | S | Redaction removed the credentials, but emails, userIds and message bodies still land in CloudWatch on every call |

## Tier 3 — lower importance or high effort ⬜

| # | Item | Effort |
|---|---|---|
| 13 | ✅ Connection feedback — done 2026-09-21: `connectionStatus` (`connected/connecting/reconnecting/offline`) on the context, a `role="status"` banner in ChatRoom when not connected, composer disabled with a hint, partner online/offline dot rendered from `otherUserPresence`; typing UI removed from ChatRoom (server no-ops `typingStatus`) | M |
| 14 | ✅ Phone widths — done 2026-09-21: chat stacks to one column below `md` (nav rail becomes a top bar, controls visible without hover, `100dvh` sticky composer), congrats panels stack, home action rows stack with 44px tap targets and a real side gutter, sign-in columns stack with 16px inputs (no iOS zoom). Desktop unchanged. Not visually verified on a device | M |
| 15 | Modal focus trap + Escape on the end-conversation dialog | S |
| 16 | Dead code — empty API route dirs, test-only lib modules, api-client methods hitting missing routes, ~30 npm scripts pointing at a missing `scripts/` dir, duplicate `useDebounce` | M |
| 17 | `next.config.mjs` `DefinePlugin` replaces `process.env` wholesale on the client; `vercel.json` pins `NODE_ENV` | S |
| 18 | Confirm `onDisconnect`'s `presence: 'offline'` has no downstream expectation of `'disconnected'` | XS |
| 19 | CSP `'unsafe-inline'` → nonce/hash pipeline | L |
| 20 | Split `WebSocketContext.jsx` (1,600+ lines) into hooks; invert its imports from `src/app` | L |
| 21 | DynamoDB-backed concurrency harness for matchmaking / `setReady` | L |
| 22 | Raise the coverage ratchet in `jest.config.js` (now 29 / 20 / 24 / 33; measured 37.6 / 28.3 / 28.4 / 42.9) as coverage grows | ongoing |
| 23 | Remove `aws-cdk-lib`, `constructs`, `react-devtools`, `wscat` entirely — nothing in the repo uses them even as dev tools (no CDK app, no scripts); `aws-cdk-lib` alone is most of the lockfile | XS |
| 24 | `npm audit` reports 81 vulnerabilities (5 critical, 27 high) — triage | M |
| 25 | The 60 s matchmaking soft-timeout path has no test (needs fake timers inside the HomeContent render setup) | S |
| 26 | Direct (non-matchmaking) `conversationStarted` responses set neither `matched` nor `queued`, so the client's matchmaking promise never resolves on that branch — unreachable from the UI today | XS |
| 27 | Decide `server/lambdas/onDisconnect/package.json` (+ untracked `package-lock.json`, `node_modules`): a per-function package pinning **aws-sdk v2** that the v3 lambda never uses; SAM packages from `server/lambdas` (`CodeUri: ./`), so it only adds weight. Recommendation: delete all three | XS |
| 28 | HomeContent keeps its own `userProfile` fetch (`getCurrentUserProfile`) that shadows the context's — home and congrats read the same name from two sources | S |
| 29 | ChatRoom/[chatId] tests select the End-conversation button positionally (`getAllByRole('button')[2]`); switch to the existing aria-labels before adding any button | XS |
| 30 | The middleware `/firebase-signin` → `/signin` redirect has no test and sits before the rate-limit check (the client-side redirect page *is* tested); bump 307 → 308 once the mapping is final | XS |
| 31 | Sign-in page still uses `window.alert()` for sign-up / password-reset confirmations — poor on mobile; fold into the inline `ErrorDisplay` | S |
| 32 | `?next=` return-path support exists on `/signin` (validated, same-origin only) but nothing produces it yet — `requireAuth`, ChatRoom and not-found link to a bare `/signin` | XS |
| 33 | Reconnects driven by `useReconnectionHandler` / the client's internal retries show as "Connecting…" not "Reconnecting…" (the provider only tracks its own `online`-event reconnect) | S |

**Suggested order:** 1–5 in one sitting, then 6 + 8 (most user-visible payoff), then 9 + 10 + 19 as one security-hardening pass.
