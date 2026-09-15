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
- `/admin/gate` — QR entry/exit console
- `/admin/pricing` — dynamic pricing rules (zone/day/hour multipliers)

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
- Pay & QR gate pass — demo payment followed by the gate-pass QR shown in the
  booking (scanned at `/admin/gate`).
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