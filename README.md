# wallet-test-x402

QA matrix-test endpoint that exercises **Wallet Test** PoS (a Prism merchant) Payment Settings via the x402 protocol.

## What this is

A small Express app deployed on Vercel that exposes:

| Route | Purpose |
|---|---|
| `GET /` | Landing page (HTML) |
| `GET /health` | Health check |
| `GET /fdx-test` | **Full E2E paid endpoint** ($0.02 USD via the `@1stdigital/prism-express` SDK). Settles end-to-end. |
| `GET /usd` | Phase-1-only 402 challenge for **USD** $5.00 — calls `prism-gw /checkout-prepare` directly |
| `GET /eur` | Phase-1-only 402 challenge for **EUR** $5.00 |
| `GET /hkd` | Phase-1-only 402 challenge for **HKD** $5.00 |

The matrix routes (`/usd`, `/eur`, `/hkd`) **bypass the SDK middleware** because the SDK's `RoutePaymentConfig` only accepts a numeric `price` — no currency field — and assumes USD. They call `prism-gw /api/v2/merchant/checkout-prepare` directly with the desired currency, so the response reflects whatever Cross-currency / FX-buffer settings are currently saved on the Wallet Test PoS in the Prism Console UI.

The `/fdx-test` route uses the SDK and supports the full payment cycle (Phase 1 + Phase 2 + on-chain settlement) for actual end-to-end validation.

## Local dev

```bash
# 1. Install (you need a GitHub token with read:packages scope to pull @1stdigital/* from GHPR)
export GITHUB_TOKEN=<your-token-with-read:packages-scope>
npm install

# 2. Set env
cp .env.example .env
# edit .env: PRISM_API_KEY=<wallet-test-pos-api-key>

# 3. Run
npm run dev
# → http://localhost:3000
```

## Deploy to Vercel

```bash
# 1. Push this repo to GitHub
git init
git add .
git commit -m "wallet-test-x402: matrix-test endpoint"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main

# 2. In Vercel:
#    a. Import this GitHub repo as a new project
#    b. Framework preset: "Other" (Vercel auto-detects vercel.json)
#    c. Set environment variables:
#       PRISM_API_KEY    = <wallet-test-pos-api-key>
#       PRISM_BASE_URL   = https://prism-gw.test.1stdigital.tech
#       GITHUB_TOKEN     = <your-token-with-read:packages-scope>   ← needed at install time
#    d. Deploy
```

After deploy, your endpoint will be at:
`https://wallet-test-x402.vercel.app/`

## How to use the matrix routes

Each matrix route always returns **HTTP 402** with a JSON body containing the gateway's `accepts[]` array. Toggle Cross-currency / FX-buffer in the Prism Console UI (Wallet Test PoS → Payment Settings) and re-call the route — the `accepts[]` will change accordingly.

```bash
curl https://wallet-test-x402.vercel.app/usd
# → 200 with x402 challenge body when you save Cross=ON
# → 200 with peg-only USD when you save Cross=OFF
# → 503 with fx_unavailable for /hkd when Cross=OFF
```

## How to use /fdx-test

Run via the FDX CLI for full settlement:

```bash
fdx wallet getX402Content --url https://wallet-test-x402.vercel.app/fdx-test
# → CLI signs an EIP-3009 authorization, settles 0.02 USD worth of stablecoin on-chain
# → Wallet Test PoS sees the new payment in listPayments / getEarnings
```

## Files

| File | Purpose |
|---|---|
| `server.ts` | The Express app (4 paid routes + health + landing) |
| `package.json` | Dependencies (Express + `@1stdigital/prism-express` SDK) |
| `tsconfig.json` | TypeScript config (NodeNext, ES2022) |
| `vercel.json` | Vercel build config (single serverless function) |
| `.env.example` | Template for `PRISM_API_KEY` + `PRISM_BASE_URL` |
| `.npmrc` | Registry auth for `@1stdigital/*` scoped packages |
| `.gitignore` | Excludes `node_modules`, `.env`, etc. |

## Notes

- The `.npmrc` reads `${GITHUB_TOKEN}` from env. Do not commit a token. Vercel's build needs `GITHUB_TOKEN` in env vars to install `@1stdigital/prism-express`.
- `PRISM_API_KEY` must be a key generated for the **Wallet Test** PoS (`f04ec875-cb25-4dbb-be93-33ca735fdca8`). The gateway uses the API key to look up which merchant config to apply.
- The `_meta` block in matrix-route responses is non-spec test instrumentation (echoes the requested currency/amount). Strip it if you want strict x402 spec compliance for clients.
