/**
 * thirdweb Pay → Meta Conversions API (server-side Purchase)
 *
 * Layer #2 of Purchase tracking. This is the reliable, authoritative source:
 * it fires even if the buyer closes the tab before the success redirect, is
 * immune to ad-blockers / iOS, and cannot be spoofed by hitting
 * /nft?purchase=success (that only fires the browser event).
 *
 * It sends a Meta `Purchase` with a DETERMINISTIC event_id = "purchase_<orderId>",
 * the SAME id the browser layer uses, so Pixel + browser-CAPI + this webhook
 * dedup into ONE Purchase.
 *
 * Env (Vercel → Project → Settings → Environment Variables):
 *   META_PIXEL_ID            — same Pixel ID as the browser (1871946304162262)
 *   META_CAPI_ACCESS_TOKEN   — Conversions API token (Events Manager → Settings)
 *   THIRDWEB_WEBHOOK_SECRET  — secret shown when you create the webhook in the
 *                              thirdweb dashboard (Payments/Pay → Webhooks)
 *   META_TEST_EVENT_CODE     — optional; set while QA-ing to route to Test Events
 *
 * thirdweb signs each webhook: header `x-payload-signature` = hex HMAC-SHA256 of
 * the RAW body using the secret, and `Authorization: Bearer <secret>`. We verify
 * both (timing-safe) and reject anything that fails. Ref: portal.thirdweb.com/pay/webhooks
 *
 * NOTE: thirdweb's exact JSON field names depend on your Payments setup. The
 * MAPPING block below tries the common shapes and logs the raw payload to Vercel
 * logs; confirm the field names against your first real/test webhook and tighten.
 */

const crypto = require('crypto');
const META_GRAPH = 'https://graph.facebook.com/v21.0';

function readRaw(req) {
  return new Promise((resolve, reject) => {
    // If a platform pre-parsed the body we cannot recompute the exact bytes the
    // signature was made over — fall back to a canonical stringify (best effort).
    if (req.body && typeof req.body === 'object') {
      resolve({ raw: JSON.stringify(req.body), parsed: req.body, preparsed: true });
      return;
    }
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) { reject(new Error('Body too large')); req.destroy(); } });
    req.on('end', () => { let p = {}; try { p = data ? JSON.parse(data) : {}; } catch (e) {} resolve({ raw: data, parsed: p, preparsed: false }); });
    req.on('error', reject);
  });
}

function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function verifySignature(raw, headers, secret) {
  const sig = headers['x-payload-signature'] || headers['x-pay-signature'];
  const auth = headers['authorization'] || '';
  const bearerOk = auth.startsWith('Bearer ') && timingSafeEqual(auth.slice(7), secret);
  if (sig) {
    const expected = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
    if (timingSafeEqual(sig, expected)) return true;
  }
  return bearerOk;
}

function sha256(v) {
  return crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');
}

// Fallback price by thirdweb Marketplace listingId (used only if the payload has
// no fiat amount). Ranges mirror COLLECTIONS in nft.html: coffee=$20, series2=$30,
// series5=$50 (series2 listingIds 51–110, series5 ≥111).
function priceFromListing(listingId) {
  const l = Number(listingId);
  if (!Number.isFinite(l)) return undefined;
  if (l >= 111) return 50;
  if (l >= 51) return 30;
  return 20;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });

  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  const secret = process.env.THIRDWEB_WEBHOOK_SECRET;
  const testCode = process.env.META_TEST_EVENT_CODE;
  if (!pixelId || !token) return json(res, 503, { ok: false, error: 'CAPI not configured (META_PIXEL_ID / META_CAPI_ACCESS_TOKEN)' });
  if (!secret) return json(res, 503, { ok: false, error: 'THIRDWEB_WEBHOOK_SECRET not set' });

  let raw, data, preparsed;
  try { ({ raw, parsed: data, preparsed } = await readRaw(req)); }
  catch (e) { return json(res, 400, { ok: false, error: e.message }); }

  // Reject anything we can't authenticate.
  if (!verifySignature(raw, req.headers, secret)) {
    return json(res, 401, { ok: false, error: 'Invalid signature' });
  }
  // Optional replay protection when thirdweb includes a timestamp header.
  const ts = Number(req.headers['x-timestamp'] || req.headers['x-pay-timestamp']);
  if (ts && Math.abs(Date.now() / 1000 - ts) > 300) {
    return json(res, 400, { ok: false, error: 'Stale webhook' });
  }

  // ── MAPPING (confirm field names against a real thirdweb payload) ─────────
  const d = (data && (data.data || data.payload || data)) || {};
  const status = String(d.status || d.state || (data && data.type) || '').toLowerCase();
  const isComplete = /complete|completed|success|paid|settled|onchain/.test(status) || status === '';
  const orderId =
    d.transactionId || d.transaction_id || d.id ||
    d.transactionHash || d.transaction_hash || d.txHash ||
    (d.transaction && (d.transaction.hash || d.transaction.id)) ||
    (data && data.id);

  let value =
    d.amountUSD ?? d.usdAmount ?? d.amountUsd ?? d.originAmountUSD ??
    (d.amount && (d.amount.usd ?? d.amount.amountUSD)) ??
    (d.purchaseData && (d.purchaseData.value ?? d.purchaseData.priceUsd)) ??
    (d.metadata && (d.metadata.value ?? d.metadata.priceUsd));
  const listingId = d.listingId || (d.metadata && d.metadata.listingId) || (d.purchaseData && d.purchaseData.listingId);
  if (value == null) value = priceFromListing(listingId);
  value = value != null ? Number(value) : undefined;

  const email = d.buyerEmail || d.email || (d.customer && d.customer.email) || (d.purchaseData && d.purchaseData.email);

  // Log the raw shape once so the exact field names can be locked in.
  console.log('[thirdweb-webhook]', JSON.stringify({ status, orderId, value, listingId, preparsed, keys: Object.keys(d) }));

  if (!isComplete) return json(res, 200, { ok: true, skipped: 'not a completed purchase', status });
  if (!orderId) return json(res, 200, { ok: true, skipped: 'no order/tx id in payload' });

  const eventId = 'purchase_' + orderId;
  const custom = { currency: 'USD', order_id: String(orderId) };
  if (value != null) custom.value = value;
  if (listingId != null) custom.content_ids = [String(listingId)];
  custom.content_type = 'product';

  const user_data = { external_id: sha256(orderId) };
  if (email) user_data.em = sha256(email);

  const payload = {
    data: [{
      event_name: 'Purchase',
      event_time: ts || Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      event_source_url: 'https://www.ijareteli.com/nft',
      user_data,
      custom_data: custom
    }],
    partner_agent: 'ijareteli-thirdweb-webhook-1.0'
  };
  if (testCode) payload.test_event_code = testCode;

  try {
    const url = `${META_GRAPH}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await r.json().catch(() => ({}));
    if (!r.ok) return json(res, 502, { ok: false, error: 'Meta API error', meta: result });
    return json(res, 200, { ok: true, event_id: eventId, value, meta: result });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || 'CAPI request failed' });
  }
};
