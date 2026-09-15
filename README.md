# ParkSpot — Car Parking Guidance System

Find, reserve, pay for, and navigate to parking spots. Includes a Next.js web
app (PWA) and a React Native (Expo) mobile app sharing the same API.

## Web app

Prerequisites: Node 20+, SQLite.

```bash
npm install
npm run db:migrate       # apply migrations (non-interactive: --skip-generate)
npm run db:seed          # seed lots, zones, spots, demo users, pricing rules
npm run dev              # http://localhost:4000
```

Production:

```bash
npm run build && npm run start   # listens on port 4000
```

Demo accounts:

| Role    | Email                | Password |
| ------- | -------------------- | -------- |
| Admin   | admin@parking.com    | admin123 |
| Operator| operator@parking.com | user123  |
| User    | user@parking.com     | user123  |

Key routes:

- `/` — find parking, live availability
- `/reservations` — my bookings + QR gate pass
- `/notifications` — notification center (emails use nodemailer; without
  `SMTP_HOST` they are logged to the console as `[email:disabled]`)
- `/admin` — operator dashboard (revenue, occupancy, 7-day trend, CSV export)
  + tunable automation policy panel
- `/admin/operations` — live ops board: on-site & arriving cars, overstays,
  per-lot occupancy, activity feed (polls every 30s)
- `/admin/gate` — QR entry/exit console + license-plate lookup
  (`GET /api/admin/gate/lookup?plate=ABC` finds PENDING/CONFIRMED/ACTIVE
  bookings by plate for gate check-in/out)
- `/admin/pricing` — dynamic pricing rules (zone/day/hour multipliers) +
  demand-based auto-surge preview / apply / rollback (`/api/admin/pricing/auto`)
- `/admin/refunds` — payments, full/partial admin refunds, and the operator
  audit trail (`/api/admin/audit`)
- `POST /api/cron/maintenance` — no-show & release automation sweep
  (auto-cancels unpaid PENDING reservations, releases no-show CONFIRMED spots
  with an automatic refund, auto-completes finished ACTIVE sessions) + sends
  the nightly ops report once per day (`/api/admin/settings` policy gates
  sweep timings). Call it with `x-cron-secret` matching `CRON_SECRET`, or let
  the lots/spots endpoints trigger it opportunistically (throttled to once per
  minute).
- `POST /api/webhooks/stripe` — Stripe checkout webhook (confirm + notify)

### Automation policy

Defaults in `src/lib/booking-policy.ts`; the whole table is tunable at runtime
by admins/operators via `GET`/`PUT /api/admin/settings` (web UI: the policy
panel on `/admin`):

| Setting                | Default | Meaning                                             |
| ---------------------- | ------- | --------------------------------------------------- |
| `pendingCancelMinutes` | 10      | unpaid PENDING reservations are expired             |
| `noShowGraceMinutes`   | 30      | CONFIRMED with no check-in past start+grace         |
| `autoCompleteMinutes`  | 30      | ACTIVE past end+grace is auto-completed             |
| `freeCancelMinutes`    | 15      | cancel within this window of start = full refund    |
| `partialRefundEnabled` | true    | prorated refunds for early exit past free window    |
| `surgeHighOccupancy`   | 85      | lot occupancy % that triggers auto-surge            |
| `surgeMinMultiplier`   | 1.0     | auto-surge floor                                    |
| `surgeMaxMultiplier`   | 2.5     | auto-surge ceiling                                  |

### Real payments (Stripe) — opt-in

When `STRIPE_SECRET_KEY` is unset the app runs an in-memory **demo payment**
(instantly confirms). Set the env vars below to enable real checkout:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

- `POST /api/payments/checkout` creates a Stripe Checkout Session and returns
  `{ sessionUrl }` (web client redirects the user there; the mobile app opens
  it via `Linking` and falls back to the demo flow when Stripe is unset).
- Cancelling a paid reservation within the free-cancel window refunds in full;
  later early exits get a prorated refund when `partialRefundEnabled`. Refunds
  are recorded on the `Payment` (`REFUNDED`/`PARTIALLY_REFUNDED`) and logged
  to the audit trail. Admin refunds/partials are available at `/admin/refunds`.
- Configure the webhook endpoint in the Stripe dashboard at
  `<your-origin>/api/webhooks/stripe` with events:
  `checkout.session.completed`.

### Mobile + desktop push notifications

- Web/mobile apps store a device token via `PUT /api/push-tokens`
  (`expo-notifications` on the phone). Notifications are sent to registered
  devices from `src/lib/push.ts`. Without an authenticated Expo project,
  delivery requires `EXPO_ACCESS_TOKEN` (see `.env`), otherwise pushes are
  attempted but fail gracefully (demo mode, same as email).

### Outbound email

Set in `.env` to enable delivery (otherwise demo console logging):

```
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM="ParkSpot <noreply@parkspot.local>"
```

## Mobile app (Expo / React Native)

Lives in [`mobile/`](./mobile). Same accounts and API as the web app; auth
uses a bearer JWT stored in the device keychain (SecureStore).

### Run

```bash
cd mobile
npm install
npm start                 # starts Expo dev server (Metro)
```

- **Phone with Expo Go** — scan the QR code. The app auto-detects your PC's
  LAN IP from the Expo dev server and connects to port 4000, so your PC and
  phone must be on the same network. Override with
  `EXPO_PUBLIC_API_URL=http://<pc-ip>:4000` in `mobile/.env`.
- **Android emulator** — falls back to `http://10.0.2.2:4000` automatically.
- **iOS simulator** — macOS required; uses `http://localhost:4000`.

### Features (milestone 1)

- Find & book parking — browse lots, live availability, reserve a spot with
  start/duration presets (native datetime pickers can be added later).
- License-plate booking — store a plate per reservation; gate staff can look
  it up at `/admin/gate` to check in/out.
- EV charging add-on — EV spots price in the lot's hourly charging rate
  (`ParkingLot.evChargingRate`, default 0.50/hr), shown in the price estimate.
- Pay & QR gate pass — Stripe checkout (demo-mode fallback) followed by the
  gate-pass QR shown in the booking (scanned at `/admin/gate`).
- My bookings + notifications — booking list, cancel, pay, mark alerts read.
- Turn-by-turn navigation — "Navigate" deep-links to Google Maps (Android) or
  Apple Maps (iOS) at the lot's coordinates. No maps API keys required.

## API auth

- Web: httpOnly cookie `session`.
- Mobile: `Authorization: Bearer <jwt>`; obtain the JWT from `POST /api/auth/login`
  (response includes `token`).

## Scripts

| Script            | Purpose                                    |
| ----------------- | ------------------------------------------ |
| `dev`             | Next dev server on port 4000               |
| `build` / `start` | Production build / server on port 4000     |
| `lint`            | ESLint                                     |
| `db:migrate`      | `prisma migrate dev --skip-generate`       |
| `db:migrate:new`  | `prisma migrate dev --name <name>`         |
| `db:seed`         | Seed demo data                             |
| `db:reset`        | Reset + reseed (Prisma 7 requires `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`) |