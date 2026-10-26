# QR Menu - restaurant ordering system

Customers scan a table QR code, browse the menu, order from their phone and track the order live. Staff work from a live dashboard; owners/managers manage menu, tables/QR codes, settings and reports.

**Stack:** Next.js 14 (App Router) + TypeScript, Tailwind CSS, Supabase (Postgres, Auth, Realtime, Storage, RLS), optional Razorpay.

## How it works (security model)
* Customers are anonymous. They can only **read** the public menu. All writes go through `/api/orders`, which calls the SQL function `place_order` with the **service-role key (server only)**.
* `place_order` / `price_order` (in `supabase/migrations/0003_functions.sql`) validate restaurant, table (active + belongs to restaurant), item availability, variants, add-on rules, promo codes and compute **every price from database rows**. Prices sent by the browser are ignored.
* Duplicate protection: the browser sends one `idempotencyKey` per cart; a unique DB index + the function make retries and double-taps return the same order.
* Order tracking uses a random 256-bit token generated in the browser; only its SHA-256 hash is stored. `/api/track/[token]` is read-only.
* Staff actions (`update_order_status`, `mark_payment_received`, reports, team) are `SECURITY DEFINER` functions that check `auth.uid()` membership and allowed transitions. RLS limits every staff read/write to restaurants they belong to; direct INSERT/UPDATE/DELETE on orders is revoked from browser roles.
* Online payment becomes "paid" **only** in the signature-verified Razorpay webhook.

Roles: **owner** (everything + team), **manager** (menu, tables, settings, reports, orders), **staff** = kitchen/counter (orders only).

## Setup from scratch
1. **Create a Supabase project** (supabase.com). Copy Project URL, anon key and service-role key (Settings -> API).
2. **Run the migrations** in order in the SQL editor (or `supabase db push`):
   `supabase/migrations/0001_schema.sql`, `0002_rls.sql`, `0003_functions.sql`, `0004_storage_realtime.sql`.
3. **Auth:** Authentication -> Providers -> Email. For quick testing disable "Confirm email"; in production keep it on and set the Site URL to your domain.
4. **Configure env:** `cp .env.example .env.local` and fill it in. Never commit it; never expose the service-role key.
5. `npm install && npm run dev` -> http://localhost:3000
6. **Deploy** (e.g. Vercel): set the same env vars (use your real https domain for `NEXT_PUBLIC_SITE_URL`), deploy.

### Environment variables
| Variable | Needed | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | public |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **server only** |
| `NEXT_PUBLIC_SITE_URL` | yes for printing QR | base URL inside QR codes |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID` | optional | leave blank = online payments disabled, everything else works |

### Razorpay (optional)
Dashboard -> Webhooks -> add `https://yourdomain.com/api/payments/razorpay/webhook`, events `payment.captured`, `order.paid`, `payment.failed`, with the same secret as `RAZORPAY_WEBHOOK_SECRET`. Then enable "Online payment" in Admin -> Settings. Test in Razorpay test mode first.

## First-run walkthrough
1. Open `/signup`, create an account (confirm email if required), then you land on **Set up your restaurant** -> name + web address (`/menu/<slug>`).
2. **Admin -> Menu:** add categories, then items (photo, price, veg/non-veg, variants such as sizes, add-on groups with min/max and required flags).
3. **Admin -> Settings:** tax %, service charge, payment options, workflow end (Ready / Served / Completed), promo codes, upload logo. Add kitchen staff under *Team* (they must sign up first).
4. **Admin -> Tables & QR:** add tables (or "Create T01, T02..."), download PNG/SVG, a printable PDF sheet, or print labels.
5. Scan a QR -> menu opens with the table identified -> order. The order appears on **Live orders** instantly (sound alert - tap "Enable sound" once per session). Accept -> Preparing -> Ready; the customer's phone updates.
6. **Reports** and **History** show database-backed numbers; CSV export is available.

`supabase/seed.sql` adds demo tables/items to an existing restaurant (edit the slug first).

## Tests
* `npm test` - unit tests: workflow transitions, cart pricing, validation, rate limiting, webhook signature.
* `supabase/tests/rls_and_orders.sql` - 60+ database assertions (pricing, idempotency, table/restaurant isolation, RLS, workflow, snapshots, reports). Run locally with `supabase/tests/run_local.sh` (needs a local Postgres) - it stubs the Supabase auth schema.
* `npm run typecheck`, `npm run build`.

## Known limits / production notes
* The in-memory rate limiter is per server instance; for multi-instance deployments swap `src/lib/ratelimit.ts` for Upstash/Redis.
* Customer tracking polls every 4 s (works everywhere, no extra infra). The staff dashboard uses Supabase Realtime plus a 20 s polling fallback.
* Menu edits in the admin (item + variants + add-ons) are saved as several requests, not one transaction.
* "Opening hours" is a free-text display field; ordering on/off is controlled by the *Accepting orders* switch.
* PWA: a web app manifest is included (installable); there is no offline service worker.
* Not tested against a real Supabase project or real Razorpay account from this environment - run the walkthrough above on your project before going live.
