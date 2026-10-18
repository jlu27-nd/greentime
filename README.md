# GreenTime v2

A standalone family chore and screen-time MVP, rebuilt from an authenticated audit of the Lovable reference. Vanilla JavaScript frontend, Node.js API, PostgreSQL for Vercel, and SQLite for local development. No Lovable runtime or project dependency.

## Run locally

Requires Node.js 24+ and pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:4174. Choose **Try kid view** or **Try parent view** for the isolated sample family. Local data persists in `.data/greentime.sqlite` (ignored by Git). Demo switching is disabled on Vercel and in production. The original Lovable credentials and data are not copied into this project.

## Implemented

- Parent and kid signup/sign-in with hashed passwords and HTTP-only session cookies.
- One-time, 15-minute child linking codes.
- Chore creation/editing/archiving, icons, categories, child assignment, instructions, photo requirements, AI criteria, and daily recurrence.
- Child photo/note submissions, review status, and completed work.
- Parent approval/concurrence, denial, return with feedback, revocation, and discard.
- A transaction-protected ledger used by both dashboards. Repeated approvals do not duplicate minutes. Revocations reverse original credit; already-spent credit becomes a visible repayment balance.
- Parent-controlled screen-time requests and a recorded session end time.
- First Little Win, Helping Hand, and Family Teammate milestone badges.
- Event log and per-child app rules.
- Optional Greenie photo assessment. AI advice never changes credits; parents make every final decision.

## Vercel setup

1. Import `jlu27-nd/greentime` into Vercel. The project display name is GreenTime; Vercel may normalize its slug to `greentime`.
2. Framework preset: Other. Build: `node scripts/migrate.js && node scripts/build.js`. Output: `dist`. Node.js: 24.x. API entrypoint: `api/index.js`.
3. Provision PostgreSQL in the intended environment and set `DATABASE_URL` using the provider's TLS-enabled connection string. Do not disable certificate verification.
4. The Vercel build applies the additive, idempotent schema to its connected database before building the frontend. A failed migration blocks the release. For a manual migration use `node --env-file=.env.local scripts/migrate.js` only after confirming the target database.
5. For Vercel AI Gateway, set `AI_GATEWAY_MODEL=openai/gpt-4.1-mini`; project OIDC authenticates requests without a stored API key. AI Gateway credits/account verification must be enabled. For direct OpenAI access instead, set `OPENAI_API_KEY` and `OPENAI_MODEL` to an image-capable Responses API model available in your account. These stay server-side. Without either configuration, Greenie explicitly says it is unavailable; manual photo review works.
6. Leave `DEMO_MODE=false` for production. No demo account shortcut is exposed on Vercel.
7. Deploy, create fresh parent and child accounts, generate/link a child code, and verify a photo submission and approval from separate devices.

## Tests

```sh
pnpm test
pnpm build
```

Nine tests cover real HTTP signup/linking/session flows, role and household isolation, duplicate approval, concurrent approval, return/resubmission, revocation, balance deductions, badges, and photo requirements. Local browser verification also confirmed that parent approval updates both balances to the same amount and unlocks the first badge.

## Boundaries and remaining deployment validation

- Vercel/PostgreSQL execution and a live Greenie API call have not been tested because cloud resources and API credentials are not configured yet. Local SQLite tests do not establish production PostgreSQL behavior.
- App rules are a family policy list, not operating-system app blocking. Actual enforcement requires a separate native/device-management integration.
- Daily recurring chores reset at midnight UTC (shown in the editor).
- Photo data is restricted by session/family membership and stored inside the family state for this small MVP. Photos are limited to 2 MB. Before substantial growth, move uploads to private object storage and normalize the family state into individual records.
- If a parent chooses Ask Greenie, that submission photo and task criteria are sent to OpenAI, through Vercel AI Gateway when configured. Responses are requested with `store:false`; this is not a claim of zero provider retention.
- No email delivery, email verification, password recovery, native device controls, or production observability is configured. Add and validate these before a broader family rollout.
- Credit reversals can create debt after minutes have already been used. Available screen time is zero until future earnings repay the debt; the underlying ledger remains auditable.

## Layout

- `public/`: accessible responsive interface and original brand images
- `api/index.js`: authenticated JSON endpoint
- `server/domain.js`: permissions, credit state transitions, and badge rules
- `server/db.js`: PostgreSQL transactions / local SQLite adapter
- `server/greenie.js`: optional photo-assessment integration
- `test/`: domain and HTTP integration checks
- `docs/reference-audit.md`: observed reference behavior and deliberate v2 changes

## Documentation consulted

- https://node-postgres.com/features/transactions
- https://developers.openai.com/api/docs/guides/images-vision
