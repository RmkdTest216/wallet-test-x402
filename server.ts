/**
 * wallet-test-x402 — QA matrix-test endpoint
 *
 * Exercises the Wallet Test PoS (Prism merchant) Payment Settings via x402.
 *
 * Routes:
 *   GET /                — landing page
 *   GET /health          — server health
 *   GET /fdx-test        — full E2E paid endpoint via @1stdigital/prism-express SDK
 *                          ($0.02 USD; settles end-to-end)
 *   GET /usd             — Phase-1-only 402 challenge for USD currency
 *   GET /eur             — Phase-1-only 402 challenge for EUR currency
 *   GET /hkd             — Phase-1-only 402 challenge for HKD currency
 *
 * The matrix routes (/usd, /eur, /hkd) bypass the SDK middleware because the
 * SDK accepts only a numeric `price` (no currency field) and assumes USD.
 * They call `prism-gw /api/v2/merchant/checkout-prepare` directly with the
 * specified currency so the response reflects whatever Cross-currency / FX
 * buffer is currently configured on the Wallet Test PoS.
 */

import { config } from "dotenv";
import express, { type Request, type Response } from "express";
import { prismPaymentMiddleware } from "@1stdigital/prism-express";

config();

// -- Environment --------------------------------------------------------------

const prismApiKey = process.env.PRISM_API_KEY ?? "";
const prismBaseUrl = (process.env.PRISM_BASE_URL || "https://prism-gw.test.1stdigital.tech")
  .trim()
  .replace(/\/$/, "");
const port = parseInt(process.env.PORT || "3000", 10);

if (!prismApiKey) {
  console.warn("[startup] PRISM_API_KEY is not set — paid routes will fail until configured.");
}

// -- App setup ----------------------------------------------------------------

const app = express();

app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-PAYMENT, PAYMENT-SIGNATURE");
  res.setHeader(
    "Access-Control-Expose-Headers",
    "X-PAYMENT-RESPONSE, X-PAYMENT-REQUIRED, X-PAYMENT-REQUIREMENTS, PAYMENT-RESPONSE",
  );
  if (_req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// -- Landing page -------------------------------------------------------------

app.get("/", (_req, res: Response) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>wallet-test-x402 — QA Matrix Endpoint</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 24px;color:#1a1a1a;background:#fafafa}
  h1{margin:0 0 4px}
  .sub{color:#555;margin:0 0 28px}
  table{width:100%;border-collapse:collapse;font-size:.9rem;background:#fff}
  th{text-align:left;padding:8px 12px;background:#f0f0f0;border-bottom:2px solid #ddd}
  td{padding:8px 12px;border-bottom:1px solid #eee;vertical-align:top}
  td:first-child{font-family:monospace;white-space:nowrap}
  .badge{display:inline-block;font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:99px}
  .free{background:#d1fae5;color:#065f46}
  .paid{background:#fef3c7;color:#92400e}
  .matrix{background:#dbeafe;color:#1e3a8a}
  footer{margin-top:32px;font-size:.8rem;color:#888}
  code{background:#f1f5f9;padding:2px 7px;border-radius:4px;font-family:monospace}
</style></head><body>
<h1>wallet-test-x402</h1>
<p class="sub">QA matrix endpoint for the Wallet Test PoS · gateway: <code>${prismBaseUrl}</code></p>
<table>
  <tr><th>Endpoint</th><th>Description</th><th>Type</th></tr>
  <tr><td>GET /health</td><td>Server health</td><td><span class="badge free">FREE</span></td></tr>
  <tr><td>GET /fdx-test</td><td>Full E2E paid endpoint ($0.02 USD via SDK)</td><td><span class="badge paid">PAID E2E</span></td></tr>
  <tr><td>GET /usd</td><td>FX-aware paid endpoint, USD ($1.00 default; override with ?amount=N). Full E2E via direct prism-gw checkout-prepare + verify + settle.</td><td><span class="badge paid">PAID E2E</span></td></tr>
  <tr><td>GET /eur</td><td>FX-aware paid endpoint, EUR ($1.00 default; override with ?amount=N).</td><td><span class="badge paid">PAID E2E</span></td></tr>
  <tr><td>GET /hkd</td><td>FX-aware paid endpoint, HKD ($1.00 default; override with ?amount=N).</td><td><span class="badge paid">PAID E2E</span></td></tr>
</table>
<footer>The matrix routes call <code>checkout-prepare</code> directly so they reflect the current Cross-currency + FX-buffer settings on the Wallet Test PoS.</footer>
</body></html>`);
});

// -- /health ------------------------------------------------------------------

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    server: "wallet-test-x402",
    gateway: prismBaseUrl,
    apiKeyConfigured: !!prismApiKey,
    routes: [
      "GET /             — landing",
      "GET /health       — this",
      "GET /fdx-test     — paid via SDK ($0.02 USD)",
      "GET /usd          — Phase-1-only 402 challenge for USD ($1.00 default; override with ?amount=N)",
      "GET /eur          — Phase-1-only 402 challenge for EUR ($1.00 default; override with ?amount=N)",
      "GET /hkd          — Phase-1-only 402 challenge for HKD ($1.00 default; override with ?amount=N)",
    ],
  });
});

// -- /fdx-test (full E2E via SDK) --------------------------------------------

const fdxTestGuard = prismPaymentMiddleware(
  { apiKey: prismApiKey, baseUrl: prismBaseUrl },
  { "/fdx-test": { price: 1.00, description: "QA Test Endpoint — full E2E paid route" } },
);

app.get("/fdx-test", fdxTestGuard, (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Payment verified — welcome to wallet-test-x402",
    route: "/fdx-test",
    pricing: { amount: "0.02", currency: "USD" },
    payer: res.locals["payer"],
    timestamp: new Date().toISOString(),
  });
});

// -- /usd /eur /hkd (matrix routes — Phase 1 only) ---------------------------

async function buildMatrixChallenge(
  resourceUrl: string,
  currency: string,
  amount: string = "1.00",
): Promise<unknown> {
  if (!prismApiKey) {
    throw new Error("PRISM_API_KEY is not configured");
  }

  const res = await fetch(`${prismBaseUrl}/api/v2/merchant/checkout-prepare`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": prismApiKey,
    },
    body: JSON.stringify({
      amount,
      currency: currency.toUpperCase(),
      resource: {
        url: resourceUrl,
        description: `wallet-test-x402 matrix probe (${currency.toUpperCase()})`,
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    return {
      proxiedStatus: res.status,
      proxiedBody: tryJson(errBody) ?? errBody,
      gateway: prismBaseUrl,
      requestedCurrency: currency.toUpperCase(),
      requestedAmount: amount,
    };
  }

  const data = (await res.json()) as Record<string, unknown>;
  const PRISM_NAMESPACE = "xyz.fd.prism_payment";
  const handlers = (data[PRISM_NAMESPACE] ?? Object.values(data)[0]) as
    | Array<{ id?: string; version?: string; config?: { x402Version?: number; resource?: object; accepts?: unknown[] } }>
    | undefined;

  const handler = handlers?.[0];
  if (!handler?.config?.accepts) {
    return {
      proxiedStatus: 502,
      proxiedBody: { error: "no_handler_in_response", raw: data },
      gateway: prismBaseUrl,
      requestedCurrency: currency.toUpperCase(),
      requestedAmount: amount,
    };
  }

  return {
    x402Version: handler.config.x402Version ?? 2,
    error: "Payment required to access this resource",
    resource: handler.config.resource ?? {
      url: resourceUrl,
      description: `wallet-test-x402 matrix probe (${currency.toUpperCase()})`,
      mimeType: "application/json",
    },
    accepts: handler.config.accepts,
    extensions: null,
    /* test instrumentation */
    _meta: {
      requestedCurrency: currency.toUpperCase(),
      requestedAmount: amount,
      gateway: prismBaseUrl,
      handlerId: handler.id,
      handlerVersion: handler.version,
    },
  };
}

function tryJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Phase 2 — verify + settle the customer's signed authorization via prism-gw.
 *
 * Flow:
 *   1. Re-fetch current requirements (so we have an authoritative accept list)
 *   2. Match the customer's payload (by scheme + network) to one of those accepts
 *   3. Call POST /api/v2/payment/verify with {paymentPayload, paymentRequirements}
 *   4. If valid, call POST /api/v2/payment/settle to push to facilitator + on-chain settle
 */
async function settleMatrixPayment(
  paymentPayload: any,
): Promise<{ success: boolean; transaction?: string; payer?: string; network?: string; error?: string }> {
  // x402 v2 PaymentPayload includes `accepted` — the requirement the customer chose.
  // We pass it directly to verify/settle (gateway will validate it server-side).
  const paymentRequirements = paymentPayload?.accepted;
  if (!paymentRequirements) {
    return { success: false, error: "paymentPayload.accepted is missing (expected x402 v2 structure)" };
  }

  // 1. Verify the customer's signed authorization
  const verifyRes = await fetch(`${prismBaseUrl}/api/v2/payment/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": prismApiKey },
    body: JSON.stringify({ paymentPayload, paymentRequirements }),
  });
  if (!verifyRes.ok) {
    return { success: false, error: `verify HTTP ${verifyRes.status}: ${await verifyRes.text().catch(() => "")}` };
  }
  const verifyData = (await verifyRes.json()) as any;
  if (!verifyData?.isValid) {
    return { success: false, error: `verify rejected: ${verifyData?.error ?? "unknown"}` };
  }

  // 2. Settle on-chain via facilitator
  const settleRes = await fetch(`${prismBaseUrl}/api/v2/payment/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": prismApiKey },
    body: JSON.stringify({ paymentPayload, paymentRequirements }),
  });
  if (!settleRes.ok) {
    return { success: false, error: `settle HTTP ${settleRes.status}: ${await settleRes.text().catch(() => "")}` };
  }
  const settleData = (await settleRes.json()) as any;
  return {
    success: settleData?.success ?? false,
    transaction: settleData?.transaction,
    payer: settleData?.payer,
    network: settleData?.network,
    error: settleData?.errorReason,
  };
}

/** Build the absolute URL for the current request (Vercel-proxy-aware). */
function absoluteUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol ?? "https";
  const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.get("host") ?? "localhost";
  return `${proto}://${host}${req.url}`;
}

function makeMatrixHandler(currency: string) {
  return async (req: Request, res: Response) => {
    // Optional ?amount=N override (e.g. /usd?amount=10). Defaults to "1.00".
    const amountQ = (req.query["amount"] as string | undefined)?.trim();
    const amount = amountQ && /^[0-9]+(\.[0-9]+)?$/.test(amountQ) ? amountQ : "1.00";

    const xPayment = (req.headers["x-payment"] as string | undefined)?.trim();

    if (xPayment) {
      // Phase 2 — verify + settle
      let rawDecoded: any = null;
      try {
        const decoded = Buffer.from(xPayment, "base64").toString("utf-8");
        rawDecoded = JSON.parse(decoded);
        let paymentPayload: any = rawDecoded;

        // The CLI may wrap the payload as { x402Version, paymentPayload, paymentRequirements }.
        // Unwrap if so.
        if (paymentPayload?.paymentPayload && !paymentPayload?.accepted) {
          paymentPayload = paymentPayload.paymentPayload;
        }

        const result = await settleMatrixPayment(paymentPayload);
        if (result.success) {
          const responseHeader = Buffer.from(JSON.stringify(result)).toString("base64");
          res.setHeader("X-PAYMENT-RESPONSE", responseHeader);
          res.json({
            success: true,
            message: `Payment verified — ${currency.toUpperCase()} matrix route (FX-aware)`,
            route: req.path,
            pricing: { amount, currency: currency.toUpperCase() },
            payer: result.payer,
            transaction: result.transaction,
            network: result.network,
            timestamp: new Date().toISOString(),
          });
        } else {
          res.status(402).json({
            error: "settlement_failed",
            detail: result.error,
            debug: {
              rawDecodedTopKeys: Object.keys(rawDecoded || {}),
              rawDecodedPreview: JSON.stringify(rawDecoded).slice(0, 500),
              afterUnwrapKeys: Object.keys(paymentPayload || {}),
              hasAccepted: !!paymentPayload?.accepted,
              acceptedScheme: paymentPayload?.accepted?.scheme,
              acceptedNetwork: paymentPayload?.accepted?.network,
              acceptedAsset: paymentPayload?.accepted?.asset,
              x402Version: paymentPayload?.x402Version,
            },
          });
        }
      } catch (err) {
        res.status(400).json({
          error: "invalid_x_payment_header",
          detail: String(err),
          debug: {
            rawDecodedTopKeys: Object.keys(rawDecoded || {}),
            rawDecodedPreview: JSON.stringify(rawDecoded).slice(0, 500),
          },
        });
      }
      return;
    }

    // Phase 1 — return 402 challenge with FX-aware accepts
    // Use the absolute URL so the CLI can match resource.url to the request it made.
    // Also set Payment-Required / X-Payment-Requirements headers (base64-encoded clean
    // challenge) because the FDX CLI reads payment requirements from headers, not body.
    try {
      const challenge = await buildMatrixChallenge(absoluteUrl(req), currency, amount) as Record<string, unknown>;
      // Strip _meta for the header — must be spec-compliant x402 JSON for the CLI
      const { _meta: _stripped, ...cleanChallenge } = challenge;
      const encodedChallenge = Buffer.from(JSON.stringify(cleanChallenge)).toString("base64");
      res
        .status(402)
        .setHeader("Content-Type", "application/json")
        .setHeader("Payment-Required", encodedChallenge)
        .setHeader("X-Payment-Requirements", encodedChallenge);
      res.json(challenge); // body keeps _meta for human curl debugging
    } catch (err) {
      res.status(503).json({
        error: "matrix_challenge_failed",
        detail: String(err),
      });
    }
  };
}

// -- /debug-payment — decode X-PAYMENT without settling (diagnostic only) ------
// Phase 1: returns a real 402 challenge (USD $0.01) so the CLI can sign it.
// Phase 2: decodes the X-PAYMENT header and returns the raw structure as 200 JSON
//          WITHOUT calling verify/settle — lets us see exactly what the CLI sends.

app.get("/debug-payment", async (req: Request, res: Response) => {
  const xPayment = (req.headers["x-payment"] as string | undefined)?.trim();

  if (!xPayment) {
    try {
      const challenge = await buildMatrixChallenge(absoluteUrl(req), "USD", "0.01") as Record<string, unknown>;
      const { _meta: _stripped, ...cleanChallenge } = challenge;
      const encodedChallenge = Buffer.from(JSON.stringify(cleanChallenge)).toString("base64");
      return void res
        .status(402)
        .setHeader("Content-Type", "application/json")
        .setHeader("Payment-Required", encodedChallenge)
        .setHeader("X-Payment-Requirements", encodedChallenge)
        .json(challenge);
    } catch (err) {
      return void res.status(503).json({ error: String(err) });
    }
  }

  try {
    const decoded = Buffer.from(xPayment, "base64").toString("utf-8");
    const rawDecoded = JSON.parse(decoded);
    let unwrapped: any = rawDecoded;
    if (unwrapped?.paymentPayload && !unwrapped?.accepted) {
      unwrapped = unwrapped.paymentPayload;
    }
    return void res.json({
      _debug: true,
      rawTopKeys: Object.keys(rawDecoded),
      rawDecoded,
      unwrappedTopKeys: Object.keys(unwrapped),
      unwrapped,
      hasAccepted: !!unwrapped?.accepted,
      acceptedNetwork: unwrapped?.accepted?.network,
      acceptedAsset: unwrapped?.accepted?.asset,
      resourceUrl: unwrapped?.resource?.url,
    });
  } catch (err) {
    return void res.status(400).json({ error: "decode_failed", detail: String(err) });
  }
});

app.get("/usd", makeMatrixHandler("USD"));
app.get("/eur", makeMatrixHandler("EUR"));
app.get("/hkd", makeMatrixHandler("HKD"));

// -- Error handler ------------------------------------------------------------

app.use(
  (
    err: Error,
    _req: Request,
    res: Response,
    _next: express.NextFunction,
  ) => {
    console.error("[wallet-test-x402 error]", err?.message);
    res.status(500).json({ error: err?.message || "Internal Server Error" });
  },
);

// -- Export for Vercel + start for local --------------------------------------

export default app;

if (!process.env.VERCEL) {
  app.listen(port, "0.0.0.0", () => {
    console.log(`\nwallet-test-x402 running on http://localhost:${port}`);
    console.log(`  GET /health     — health check`);
    console.log(`  GET /fdx-test   — paid via SDK ($0.02 USD)`);
    console.log(`  GET /usd        — matrix probe USD`);
    console.log(`  GET /eur        — matrix probe EUR`);
    console.log(`  GET /hkd        — matrix probe HKD`);
    console.log(`Prism gateway: ${prismBaseUrl}\n`);
  });
}
