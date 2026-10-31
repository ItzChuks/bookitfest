# Bookitfest

Multivendor event ticketing + Lucky 5 draw. HTML, CSS, Tailwind (CDN), JavaScript (ES modules) and PocketBase.
Frontend is plain static files at the project root. PocketBase lives in `backend/`.

## Structure

```
index.html events.html event.html lucky.html wallet.html vendor.html admin.html 404.html   one file per page
assets/
  css/app.css            extra styles
  img/                   logos (logo.png, logo-icon.png), favicons, placeholder image
  js/
    config.js            PocketBase URL + NGN rate  <- the only file you edit to deploy
    tailwind.config.js   Tailwind theme
    app.js               entry: loads pages/<data-page>.js, gates by role, renders
    pb.js state.js ui.js components.js layout.js audio.js    shared modules
    pages/               home, events, event, lucky, wallet, vendor, admin, notfound
backend/
  pb_hooks/              server logic (tickets, wallet, Lucky 5, draw, check-in)
  pb_migrations/         schema + access rules
  start-demo.bat / .sh   start PocketBase with demo data
```

Links are plain relative files (`events.html`, `event.html?id=...`), so there is no router and no server rewrite.

## Run locally (Live Server)

1. Download PocketBase 0.23+ from https://pocketbase.io/docs and put the executable in `backend/`.
2. In `backend/`: `./pocketbase superuser upsert you@example.com a-long-password`
3. Start it with demo data: `start-demo.bat` (Windows) or `./start-demo.sh`. It runs on http://127.0.0.1:8090
4. Open the project root in VS Code and click **Go Live**. Open `index.html`.

`config.js` uses `http://127.0.0.1:8090` automatically on localhost.

Demo logins (password `Passw0rd!demo`): `user@bookitfest.test` (has $1,250), `vendor@bookitfest.test`, `admin@bookitfest.test`.

## Deploy

**Frontend (Vercel):** import the repo, framework preset "Other", no build command, output directory = project root. Nothing else needed.

**Backend:** Vercel cannot run PocketBase. Host it on a VPS, Fly.io, Railway or similar (needs a persistent disk), upload `backend/pb_hooks` and `backend/pb_migrations`, and start it **without** `BKF_DEMO` / `BKF_SIMULATE_PAYMENTS`.
Then set `PROD_PB_URL` in `assets/js/config.js` to that HTTPS URL. PocketBase allows cross-origin requests by default; restrict origins with `--origins` once you know your Vercel domain.

To make someone an admin, open `<your-pocketbase>/_/` > users and set `role` to `admin`.

## Notes

- Event cover images are uploaded from the vendor's device (max 5 MB, JPG/PNG/WebP/GIF) and stored by PocketBase in `pb_data/storage`. On Railway keep the volume mounted at `/pb/pb_data` or uploads are lost on redeploy.

- Money logic (balances, tickets, Lucky 5, draws, check-in) is server-side only, in `backend/pb_hooks/`. Browser writes to those collections are rejected by the rules.
- **Flutterwave is live** (hosted checkout, see below). Paystack is still simulated only when `BKF_SIMULATE_PAYMENTS=1`; it gets wired in next.
- Before launch: HTTPS, SMTP in the PocketBase settings, review rate limits. Check that a paid prize draw is legal where you operate.

## Flutterwave setup

Ticket purchases and wallet top-ups use Flutterwave's hosted checkout (cards, bank transfer, USSD). The amount is calculated on the server, and tickets / balance are only credited after the server verifies the transaction with Flutterwave (webhook, with a return-page check as backup). The secret key never goes in the frontend or the repo.

**1. Railway variables** (service > Variables), then redeploy:

| Variable | Value |
|---|---|
| `FLW_SECRET_KEY` | your Flutterwave secret key (`FLWSECK_TEST-...` to test, `FLWSECK-...` live) |
| `FLW_SECRET_HASH` | any long random string you invent; use the same value in the dashboard |
| `BKF_FRONTEND_URL` | your site URL, e.g. `https://your-site.vercel.app` (no trailing slash) |
| `FLW_CURRENCY` | optional, default `NGN` (use `USD` only if USD is enabled on your account) |
| `FLW_NGN_RATE` | optional, default `1500`; keep equal to `NGN_RATE` in `assets/js/config.js` |

**2. Flutterwave Dashboard > Settings > Webhooks**

- URL: `https://bookitfest-production.up.railway.app/api/bkf/flw/webhook`
- Secret hash: the same value as `FLW_SECRET_HASH`
- Enable the charge/transaction completed events.

**3. Push** the new files. The migration `1760000001_payments.js` creates a `payments` collection automatically on boot (server-only, no public access).

Prices are stored in USD and charged in NGN at `FLW_NGN_RATE` by default. Test first with test keys, then switch to live keys.
