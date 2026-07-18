/**
 * Meta Conversions API (server-side)
 *
 * Env (Vercel → Project → Settings → Environment Variables):
 *   META_PIXEL_ID              — same as browser Pixel ID
 *   META_CAPI_ACCESS_TOKEN     — system user token with ads_management / events
 *   META_TEST_EVENT_CODE       — optional, for Events Manager Test Events
 *   META_CAPI_ENABLED          — "true" to send (default true if token set)
 *
 * Deduplication: client sends event_id; GTM Meta Pixel tag must use the same
 * event_id from the dataLayer so Pixel + CAPI merge into one event.
 */

const META_GRAPH = 'https://graph.facebook.com/v21.0';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    // Vercel may already parse JSON
    if (req.body && typeof req.body === 'object') {
      resolve(req.body);
      return;
    }
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || undefined;
}

function allowedOrigin(req) {
  const origin = req.headers.origin || '';
  const host = req.headers.host || '';
  const allow = [
    'https://www.ijareteli.com',
    'https://ijareteli.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500'
  ];
  if (origin && allow.some((a) => origin === a || origin.endsWith('.vercel.app'))) return origin;
  if (host.includes('ijareteli.com') || host.includes('localhost') || host.includes('vercel.app')) {
    return origin || `https://${host}`;
  }
  return null;
}

function cleanUserData(ud, ip, ua) {
  const out = {};
  if (ud && typeof ud === 'object') {
    if (ud.fbp) out.fbp = String(ud.fbp);
    if (ud.fbc) out.fbc = String(ud.fbc);
    // Hashed PII only if already SHA-256 hex (64 chars)
    ['em', 'ph', 'fn', 'ln', 'external_id'].forEach((k) => {
      if (ud[k] && /^[a-f0-9]{64}$/i.test(String(ud[k]))) out[k] = String(ud[k]).toLowerCase();
    });
  }
  if (ip) out.client_ip_address = ip;
  if (ua || (ud && ud.client_user_agent)) out.client_user_agent = ua || ud.client_user_agent;
  return out;
}

function mapEventName(name) {
  const map = {
    page_view: 'PageView',
    view_content: 'ViewContent',
    search: 'Search',
    contact: 'Contact',
    generate_lead: 'Lead',
    begin_checkout: 'InitiateCheckout',
    purchase: 'Purchase',
    PageView: 'PageView',
    ViewContent: 'ViewContent',
    Search: 'Search',
    Contact: 'Contact',
    Lead: 'Lead',
    InitiateCheckout: 'InitiateCheckout',
    Purchase: 'Purchase'
  };
  return map[name] || name;
}

module.exports = async function handler(req, res) {
  // CORS
  const origin = allowedOrigin(req);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  const testCode = process.env.META_TEST_EVENT_CODE;
  const enabled = process.env.META_CAPI_ENABLED !== 'false';

  if (!pixelId || !token) {
    return json(res, 503, {
      ok: false,
      error: 'CAPI not configured',
      hint: 'Set META_PIXEL_ID and META_CAPI_ACCESS_TOKEN in Vercel env'
    });
  }

  if (!enabled) {
    return json(res, 200, { ok: true, skipped: true, reason: 'META_CAPI_ENABLED=false' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return json(res, 400, { ok: false, error: e.message });
  }

  const eventName = mapEventName(body.event_name || body.event);
  if (!eventName) {
    return json(res, 400, { ok: false, error: 'event_name required' });
  }

  const eventId = body.event_id || body.eventId;
  if (!eventId) {
    return json(res, 400, { ok: false, error: 'event_id required for deduplication' });
  }

  const ip = clientIp(req);
  const ua = req.headers['user-agent'];

  const eventData = {
    event_name: eventName,
    event_time: Number(body.event_time) || Math.floor(Date.now() / 1000),
    event_id: String(eventId),
    event_source_url: body.event_source_url || body.page_location || undefined,
    action_source: body.action_source || 'website',
    user_data: cleanUserData(body.user_data || {}, ip, ua),
    custom_data: body.custom_data && typeof body.custom_data === 'object' ? body.custom_data : {}
  };

  // Attach UTM into custom_data for debugging / custom conversions if useful
  if (body.utm && typeof body.utm === 'object') {
    Object.keys(body.utm).forEach((k) => {
      if (k.startsWith('utm_') || k === 'gclid' || k === 'fbclid') {
        eventData.custom_data[k] = body.utm[k];
      }
    });
  }

  const payload = {
    data: [eventData],
    partner_agent: 'ijareteli-capi-1.0'
  };
  // Per-request test code (QA) takes precedence over the env default, so a single
  // Purchase can be routed to Events Manager → Test Events without going live.
  const effectiveTestCode = (body && body.test_event_code) || testCode;
  if (effectiveTestCode) payload.test_event_code = effectiveTestCode;

  try {
    const url = `${META_GRAPH}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await r.json().catch(() => ({}));
    if (!r.ok) {
      return json(res, 502, { ok: false, error: 'Meta API error', meta: result });
    }
    return json(res, 200, {
      ok: true,
      event_name: eventName,
      event_id: eventId,
      meta: result
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || 'CAPI request failed' });
  }
};
