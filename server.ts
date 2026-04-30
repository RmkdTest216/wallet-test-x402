/**
 * wallet-test-x402 — QA matrix-test endpoint
 *
 * Exercises the Wallet Test PoS (Prism merchant) Payment Settings via x402.
 *
 * Routes (test env, default — Wallet Test PoS on prism-gw.test.1stdigital.tech):
 *   GET /                — landing page
 *   GET /health          — server health
 *   GET /fdx-test        — full E2E paid endpoint via @1stdigital/prism-express SDK ($0.10 USD)
 *   GET /usd             — FX-aware paid endpoint, USD ($1.00 default; ?amount=N)
 *   GET /eur             — FX-aware paid endpoint, EUR
 *   GET /hkd             — FX-aware paid endpoint, HKD
 *   GET /gbp             — FX-aware paid endpoint, GBP
 *   GET /debug-payment   — decode X-PAYMENT without settling
 *
 * Routes (prod env — Default Project PoS on prism-gw.fd.xyz):
 *   Same set, prefixed with /prod, e.g. /prod/usd, /prod/fdx-test, /prod/health, etc.
 *
 * The matrix routes (/usd /eur /hkd /gbp and their /prod mirrors) bypass the SDK
 * middleware because the SDK accepts only a numeric `price` (no currency field) and
 * assumes USD. They call `prism-gw /api/v2/merchant/checkout-prepare` directly so the
 * response reflects whatever Cross-currency / FX buffer is currently configured on the
 * bound PoS for that environment.
 */

import { config } from "dotenv";
import express, { type Request, type Response } from "express";
import { prismPaymentMiddleware } from "@1stdigital/prism-express";

config();

// -- Environment --------------------------------------------------------------

type EnvKey = "test" | "prod";

interface EnvConfig {
  apiKey: string;
  baseUrl: string;
  label: EnvKey;
}

const ENVS: Record<EnvKey, EnvConfig> = {
  test: {
    apiKey: process.env.PRISM_API_KEY ?? "",
    baseUrl: (process.env.PRISM_BASE_URL || "https://prism-gw.test.1stdigital.tech")
      .trim()
      .replace(/\/$/, ""),
    label: "test",
  },
  prod: {
    apiKey: process.env.PRISM_API_KEY_PROD ?? "",
    baseUrl: (process.env.PRISM_BASE_URL_PROD || "https://prism-gw.fd.xyz")
      .trim()
      .replace(/\/$/, ""),
    label: "prod",
  },
};

const port = parseInt(process.env.PORT || "3000", 10);

if (!ENVS.test.apiKey) {
  console.warn("[startup] PRISM_API_KEY (test) is not set — test paid routes will fail until configured.");
}
if (!ENVS.prod.apiKey) {
  console.warn("[startup] PRISM_API_KEY_PROD is not set — prod paid routes will fail until configured.");
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
  body{font-family:system-ui,sans-serif;max-width:820px;margin:48px auto;padding:0 24px;color:#1a1a1a;background:#fafafa}
  h1{margin:0 0 4px}
  h2{margin:32px 0 8px;font-size:1.05rem}
  .sub{color:#555;margin:0 0 28px}
  table{width:100%;border-collapse:collapse;font-size:.9rem;background:#fff;margin-bottom:8px}
  th{text-align:left;padding:8px 12px;background:#f0f0f0;border-bottom:2px solid #ddd}
  td{padding:8px 12px;border-bottom:1px solid #eee;vertical-align:top}
  td:first-child{font-family:monospace;white-space:nowrap}
  .badge{display:inline-block;font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:99px}
  .free{background:#d1fae5;color:#065f46}
  .paid{background:#fef3c7;color:#92400e}
  .test{background:#dbeafe;color:#1e3a8a}
  .prod{background:#fee2e2;color:#991b1b}
  footer{margin-top:32px;font-size:.8rem;color:#888}
  code{background:#f1f5f9;padding:2px 7px;border-radius:4px;font-family:monospace}
</style></head><body>
<h1>wallet-test-x402</h1>
<p class="sub">QA matrix endpoint · test gateway: <code>${ENVS.test.baseUrl}</code> · prod gateway: <code>${ENVS.prod.baseUrl}</code></p>

<h2><span class="badge test">TEST</span> Wallet Test PoS — <code>${ENVS.test.baseUrl}</code></h2>
<table>
  <tr><th>Endpoint</th><th>Description</th><th>Type</th></tr>
  <tr><td>GET /health</td><td>Server health (both envs)</td><td><span class="badge free">FREE</span></td></tr>
  <tr><td>GET /fdx-test</td><td>Full E2E paid endpoint ($0.10 USD via SDK)</td><td><span class="badge paid">PAID E2E</span></td></tr>
  <tr><td>GET /usd</td><td>FX-aware paid endpoint, USD ($1.00 default; <code>?amount=N</code>)</td><td><span class="badge paid">PAID E2E</span></td></tr>
  <tr><td>GET /eur</td><td>FX-aware paid endpoint, EUR</td><td><span class="badge paid">PAID E2E</span></td></tr>
  <tr><td>GET /hkd</td><td>FX-aware paid endpoint, HKD</td><td><span class="badge paid">PAID E2E</span></td></tr>
  <tr><td>GET /gbp</td><td>FX-aware paid endpoint, GBP</td><td><span class="badge paid">PAID E2E</span></td></tr>
  <tr><td>GET /debug-payment</td><td>Decode X-PAYMENT without settling</td><td><span class="badge paid">DIAG</span></td></tr>
</table>

<h2><span class="badge prod">PROD</span> Default Project PoS — <code>${ENVS.prod.baseUrl}</code></h2>
<table>
  <tr><th>Endpoint</th><th>Description</th><th>Type</th></tr>
  <tr><td>GET /prod/fdx-test</td><td>Full E2E paid endpoint ($0.10 USD via SDK)</td><td><span class="badge paid">PAID E2E</span></td></tr>
  <tr><td>GET /prod/usd</td><td>FX-aware paid endpoint, USD</td><td><span class="badge paid">PAID E2E</span></td></tr>
  <tr><td>GET /prod/eur</td><td>FX-aware paid endpoint, EUR</td><td><span class="badge paid">PAID E2E</span></td></tr>
  <tr><td>GET /prod/hkd</td><td>FX-aware paid endpoint, HKD</td><td><span class="badge paid">PAID E2E</span></td></tr>
  <tr><td>GET /prod/gbp</td><td>FX-aware paid endpoint, GBP</td><td><span class="badge paid">PAID E2E</span></td></tr>
  <tr><td>GET /prod/debug-payment</td><td>Decode X-PAYMENT without settling</td><td><span class="badge paid">DIAG</span></td></tr>
</table>

<footer>Matrix routes call <code>checkout-prepare</code> directly so they reflect the current Cross-currency + FX-buffer settings on the bound PoS for that environment.</footer>
</body></html>`);
});

// -- /health ------------------------------------------------------------------

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    server: "wallet-test-x402",
    envs: {
      test: {
        gateway: ENVS.test.baseUrl,
        apiKeyConfigured: !!ENVS.test.apiKey,
        routes: ["GET /fdx-test", "GET /usd", "GET /eur", "GET /hkd", "GET /gbp", "GET /debug-payment"],
      },
      prod: {
        gateway: ENVS.prod.baseUrl,
        apiKeyConfigured: !!ENVS.prod.apiKey,
        routes: ["GET /prod/fdx-test", "GET /prod/usd", "GET /prod/eur", "GET /prod/hkd", "GET /prod/gbp", "GET /prod/debug-payment"],
      },
    },
  });
});

// -- /fdx-test (full E2E via SDK) — one middleware per env -------------------

const fdxTestGuardTest = prismPaymentMiddleware(
  { apiKey: ENVS.test.apiKey, baseUrl: ENVS.test.baseUrl },
  { "/fdx-test": { price: 0.10, description: "QA Test Endpoint (test) — full E2E paid route" } },
);

const fdxTestGuardProd = prismPaymentMiddleware(
  { apiKey: ENVS.prod.apiKey, baseUrl: ENVS.prod.baseUrl },
  { "/prod/fdx-test": { price: 0.10, description: "QA Test Endpoint (prod) — full E2E paid route" } },
);

app.get("/fdx-test", fdxTestGuardTest, (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Payment verified — welcome to wallet-test-x402 (test)",
    route: "/fdx-test",
    env: "test",
    pricing: { amount: "0.10", currency: "USD" },
    payer: res.locals["payer"],
    timestamp: new Date().toISOString(),
  });
});

app.get("/prod/fdx-test", fdxTestGuardProd, (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Payment verified — welcome to wallet-test-x402 (prod)",
    route: "/prod/fdx-test",
    env: "prod",
    pricing: { amount: "0.10", currency: "USD" },
    payer: res.locals["payer"],
    timestamp: new Date().toISOString(),
  });
});

// -- Matrix routes (Phase 1 challenge + Phase 2 settle) ----------------------

async function buildMatrixChallenge(
  env: EnvConfig,
  resourceUrl: string,
  currency: string,
  amount: string = "1.00",
): Promise<unknown> {
  if (!env.apiKey) {
    throw new Error(`PRISM_API_KEY${env.label === "prod" ? "_PROD" : ""} is not configured`);
  }

  const res = await fetch(`${env.baseUrl}/api/v2/merchant/checkout-prepare`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": env.apiKey,
    },
    body: JSON.stringify({
      amount,
      currency: currency.toUpperCase(),
      resource: {
        url: resourceUrl,
        description: `wallet-test-x402 matrix probe (${currency.toUpperCase()}, ${env.label})`,
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    return {
      proxiedStatus: res.status,
      proxiedBody: tryJson(errBody) ?? errBody,
      gateway: env.baseUrl,
      env: env.label,
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
      gateway: env.baseUrl,
      env: env.label,
      requestedCurrency: currency.toUpperCase(),
      requestedAmount: amount,
    };
  }

  return {
    x402Version: handler.config.x402Version ?? 2,
    error: "Payment required to access this resource",
    resource: handler.config.resource ?? {
      url: resourceUrl,
      description: `wallet-test-x402 matrix probe (${currency.toUpperCase()}, ${env.label})`,
      mimeType: "application/json",
    },
    accepts: handler.config.accepts,
    extensions: null,
    /* test instrumentation */
    _meta: {
      env: env.label,
      requestedCurrency: currency.toUpperCase(),
      requestedAmount: amount,
      gateway: env.baseUrl,
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
 */
async function settleMatrixPayment(
  env: EnvConfig,
  paymentPayload: any,
): Promise<{ success: boolean; transaction?: string; payer?: string; network?: string; error?: string }> {
  const paymentRequirements = paymentPayload?.accepted;
  if (!paymentRequirements) {
    return { success: false, error: "paymentPayload.accepted is missing (expected x402 v2 structure)" };
  }

  const verifyRes = await fetch(`${env.baseUrl}/api/v2/payment/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": env.apiKey },
    body: JSON.stringify({ paymentPayload, paymentRequirements }),
  });
  if (!verifyRes.ok) {
    return { success: false, error: `verify HTTP ${verifyRes.status}: ${await verifyRes.text().catch(() => "")}` };
  }
  const verifyData = (await verifyRes.json()) as any;
  if (!verifyData?.isValid) {
    return { success: false, error: `verify rejected: ${verifyData?.error ?? "unknown"}` };
  }

  const settleRes = await fetch(`${env.baseUrl}/api/v2/payment/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": env.apiKey },
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

function makeMatrixHandler(env: EnvConfig, currency: string) {
  return async (req: Request, res: Response) => {
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

        if (paymentPayload?.paymentPayload && !paymentPayload?.accepted) {
          paymentPayload = paymentPayload.paymentPayload;
        }

        const result = await settleMatrixPayment(env, paymentPayload);
        if (result.success) {
          const responseHeader = Buffer.from(JSON.stringify(result)).toString("base64");
          res.setHeader("X-PAYMENT-RESPONSE", responseHeader);
          res.json({
            success: true,
            message: `Payment verified — ${currency.toUpperCase()} matrix route (FX-aware, ${env.label})`,
            route: req.path,
            env: env.label,
            pricing: { amount, currency: currency.toUpperCase() },
            payer: result.payer,
            transaction: result.transaction,
            network: result.network,
            timestamp: new Date().toISOString(),
          });
        } else {
          res.status(402).json({
            error: "settlement_failed",
            env: env.label,
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
          env: env.label,
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
    try {
      const challenge = await buildMatrixChallenge(env, absoluteUrl(req), currency, amount) as Record<string, unknown>;
      const { _meta: _stripped, ...cleanChallenge } = challenge;
      const encodedChallenge = Buffer.from(JSON.stringify(cleanChallenge)).toString("base64");
      res
        .status(402)
        .setHeader("Content-Type", "application/json")
        .setHeader("Payment-Required", encodedChallenge)
        .setHeader("X-Payment-Requirements", encodedChallenge);
      res.json(challenge);
    } catch (err) {
      res.status(503).json({
        error: "matrix_challenge_failed",
        env: env.label,
        detail: String(err),
      });
    }
  };
}

// -- /debug-payment — decode X-PAYMENT without settling (diagnostic only) -----

function makeDebugHandler(env: EnvConfig) {
  return async (req: Request, res: Response) => {
    const xPayment = (req.headers["x-payment"] as string | undefined)?.trim();

    if (!xPayment) {
      try {
        const challenge = await buildMatrixChallenge(env, absoluteUrl(req), "USD", "0.01") as Record<string, unknown>;
        const { _meta: _stripped, ...cleanChallenge } = challenge;
        const encodedChallenge = Buffer.from(JSON.stringify(cleanChallenge)).toString("base64");
        return void res
          .status(402)
          .setHeader("Content-Type", "application/json")
          .setHeader("Payment-Required", encodedChallenge)
          .setHeader("X-Payment-Requirements", encodedChallenge)
          .json(challenge);
      } catch (err) {
        return void res.status(503).json({ error: String(err), env: env.label });
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
        env: env.label,
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
      return void res.status(400).json({ error: "decode_failed", env: env.label, detail: String(err) });
    }
  };
}

// -- Test env routes (default, no prefix) -------------------------------------

app.get("/usd", makeMatrixHandler(ENVS.test, "USD"));
app.get("/eur", makeMatrixHandler(ENVS.test, "EUR"));
app.get("/hkd", makeMatrixHandler(ENVS.test, "HKD"));
app.get("/gbp", makeMatrixHandler(ENVS.test, "GBP"));
app.get("/debug-payment", makeDebugHandler(ENVS.test));

// -- Prod env routes (under /prod) --------------------------------------------

app.get("/prod/usd", makeMatrixHandler(ENVS.prod, "USD"));
app.get("/prod/eur", makeMatrixHandler(ENVS.prod, "EUR"));
app.get("/prod/hkd", makeMatrixHandler(ENVS.prod, "HKD"));
app.get("/prod/gbp", makeMatrixHandler(ENVS.prod, "GBP"));
app.get("/prod/debug-payment", makeDebugHandler(ENVS.prod));

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
    console.log(`Test gateway: ${ENVS.test.baseUrl} (apiKey: ${ENVS.test.apiKey ? "set" : "MISSING"})`);
    console.log(`Prod gateway: ${ENVS.prod.baseUrl} (apiKey: ${ENVS.prod.apiKey ? "set" : "MISSING"})`);
    console.log(`  GET /health           — health check (both envs)`);
    console.log(`  GET /fdx-test         — paid via SDK ($0.10 USD, test)`);
    console.log(`  GET /usd /eur /hkd /gbp — matrix probes (test)`);
    console.log(`  GET /prod/fdx-test    — paid via SDK ($0.10 USD, prod)`);
    console.log(`  GET /prod/usd /eur /hkd /gbp — matrix probes (prod)\n`);
  });
}
