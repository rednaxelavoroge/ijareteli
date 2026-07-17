# Ads & Analytics setup — ijareteli.com

Infrastructure is **ready in code**. Ads are **not launched** until you add real IDs and publish GTM tags.

Design and business logic of the site were not changed — only analytics hooks, consent, SEO, and a CAPI API route.

---

## Status checklist

| Item | Status | Notes |
|------|--------|--------|
| GTM snippet on all pages | ✅ code | Replace `GTM-XXXXXXX` in `js/config.js` |
| Consent Mode v2 + cookie banner | ✅ | Accept all / Analytics only / Reject |
| dataLayer events | ✅ | See mapping below |
| Meta CAPI server route | ✅ code | Needs Vercel env secrets |
| Event dedup (Pixel + CAPI) | ✅ | Shared `event_id` |
| UTM capture | ✅ | session + localStorage |
| robots.txt / sitemap.xml | ✅ | |
| Canonical / OG / Twitter | ✅ | www canonical |
| Favicon | ✅ | `/favicon.svg` |
| Privacy page | ✅ | `/privacy` |
| Real GA4 / Pixel IDs filled | ⏳ you | |
| GTM tags published | ⏳ you | |
| Realtime / Pixel Helper verified | ⏳ you | after IDs |

---

## 1. Create accounts & IDs

### Google Tag Manager
1. [tagmanager.google.com](https://tagmanager.google.com) → Create account **Ijareteli** → container **www.ijareteli.com** (Web).
2. Copy Container ID: `GTM-XXXXXXX`.
3. Paste into `js/config.js` → `gtmId`.

### Google Analytics 4
1. [analytics.google.com](https://analytics.google.com) → Admin → Create property **Ijareteli**.
2. Data stream → Web → URL `https://www.ijareteli.com`.
3. Copy Measurement ID: `G-XXXXXXXXXX` → `js/config.js` → `ga4MeasurementId`.
4. **Admin → Data Streams → your stream → Enhanced measurement** — enable:
   - Page views  
   - Scrolls  
   - Outbound clicks  
   - Site search (optional; we also send custom `search` from vernissage filters)  
   - Video engagement  
   - File downloads  

### Meta Pixel
1. Meta Events Manager → Connect data → Web → Meta Pixel → create **Ijareteli**.
2. Copy Pixel ID (numbers only) → `js/config.js` → `metaPixelId` **and** Vercel env `META_PIXEL_ID`.

### Meta Conversions API
1. Events Manager → Pixel → Settings → **Generate access token** (Conversions API).
2. Vercel → Project → Settings → Environment Variables:

| Name | Value |
|------|--------|
| `META_PIXEL_ID` | same Pixel ID |
| `META_CAPI_ACCESS_TOKEN` | token from Events Manager |
| `META_TEST_EVENT_CODE` | optional, from Test Events tab |
| `META_CAPI_ENABLED` | `true` |

3. Redeploy after setting env vars.

---

## 2. Configure GTM tags (all tags via GTM)

### Built-in variables
Enable: Page URL, Page Path, Referrer, Event, Click URL, and create **Data Layer Variables**:

| Variable name | Data Layer Variable Name |
|---------------|--------------------------|
| DL - event_id | `event_id` |
| DL - content_ids | `content_ids` |
| DL - content_name | `content_name` |
| DL - content_type | `content_type` |
| DL - content_category | `content_category` |
| DL - value | `value` |
| DL - currency | `currency` |
| DL - search_string | `search_string` |
| DL - contact_method | `contact_method` |
| DL - transaction_id | `transaction_id` |
| DL - num_items | `num_items` |

### Consent
- Enable **Consent Overview** in GTM Admin.
- GA4 tags require: `analytics_storage`.
- Meta Pixel tags require: `ad_storage` (+ `ad_user_data` / `ad_personalization` as applicable).
- Site already sets Consent Mode defaults **before** GTM loads and updates on banner click.

### Triggers (Custom Event)

| Trigger name | Event name |
|--------------|------------|
| CE - page_view | `page_view` |
| CE - view_content | `view_content` |
| CE - search | `search` |
| CE - contact | `contact` |
| CE - generate_lead | `generate_lead` |
| CE - begin_checkout | `begin_checkout` |
| CE - purchase | `purchase` |

Also keep **All Pages** if you prefer GA4 Config to fire on load; our script also pushes `page_view`.

### Tag: GA4 Configuration
- Type: Google Analytics: GA4 Configuration  
- Measurement ID: `G-XXXXXXXXXX`  
- Trigger: All Pages (or CE - page_view)  
- Send page view: enabled  

### Tag: GA4 Event (one per event, or multi-event)
Examples:
- Event name `view_content` → trigger CE - view_content, params from DL variables  
- Event name `generate_lead` → CE - generate_lead  
- Event name `begin_checkout` → CE - begin_checkout  
- Event name `purchase` → CE - purchase  
- Event name `search` → CE - search  
- Event name `contact` → CE - contact  

### Tag: Meta Pixel base
- Type: **Facebook Pixel** (community template) or Custom HTML with `fbq('init','PIXEL_ID'); fbq('track','PageView', {}, {eventID: {{DL - event_id}}});`
- **Critical for CAPI dedup:** pass `eventID` / `event_id` = `{{DL - event_id}}` on every event.
- Trigger: CE - page_view (and/or All Pages with care not to double PageView)

### Tag: Meta standard events
Map dataLayer → Meta:

| dataLayer event | Meta event | Notes |
|-----------------|------------|--------|
| `page_view` | PageView | + eventID |
| `view_content` | ViewContent | content_ids, content_name, content_type, value, currency |
| `search` | Search | search_string |
| `contact` | Contact | |
| `generate_lead` | Lead | |
| `begin_checkout` | InitiateCheckout | value, currency, content_ids |
| `purchase` | Purchase | value, currency, order/transaction id |

Publish the GTM container (**Submit** → Publish).

---

## 3. Site event map (already implemented)

| User action | dataLayer event | Meta (CAPI + Pixel) |
|-------------|-----------------|---------------------|
| Any page load | `page_view` | PageView |
| Home gallery lightbox | `view_content` | ViewContent |
| Vernissage open work | `view_content` | ViewContent |
| Vernissage series filter | `search` | Search |
| Vernissage “Buy Original” modal | `begin_checkout` + `generate_lead` | InitiateCheckout + Lead |
| mailto / tel / WhatsApp / social | `contact` (+ Lead for mail/tel/WA) | Contact / Lead |
| NFT open work | `view_content` | ViewContent |
| NFT “Buy with card” | `begin_checkout` | InitiateCheckout |
| Return URL `?purchase=success` | `purchase` | Purchase |

There is **no web contact form** and **no on-site payment success page** for NFT (checkout is on `buy.ijareteli.com`).  
Purchase is supported when:
- Checkout redirects back with `?purchase=success&value=20&order_id=...`, or  
- You later wire a webhook into `/api/meta-capi` with event `Purchase` and a stable `event_id`.

---

## 4. UTM for campaigns

Use consistent UTMs on every ad:

```
https://www.ijareteli.com/?utm_source=meta&utm_medium=paid&utm_campaign=spring_gallery&utm_content=carousel_a
https://www.ijareteli.com/nft?utm_source=google&utm_medium=cpc&utm_campaign=nft_usd&utm_term=georgian_art
```

Captured keys: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid`, `fbclid`, `gbraid`, `wbraid`.  
Stored in sessionStorage + localStorage (`ij_utm`) and pushed into dataLayer on subsequent events.

---

## 5. Verification (do this after IDs + GTM publish)

1. Open site in Incognito → Accept cookies.  
2. **GTM Preview** (Tag Assistant) → confirm tags fire on events.  
3. **GA4 Admin → DebugView / Realtime** → page_view, view_content, etc.  
4. **Meta Pixel Helper** (Chrome) → PageView + ViewContent without errors.  
5. **Events Manager → Test Events** → set `META_TEST_EVENT_CODE`, browse site, confirm server events with same `event_id` as browser (deduped, not doubled).  
6. Network tab: `POST /api/meta-capi` → 200 when ads consent granted and env configured.

---

## 6. Pre-launch site QA (code / content)

| Check | Result |
|-------|--------|
| Core Web Vitals | Images are large JPEGs (~100–250KB each); homepage HTML ~100KB; studio video 13MB is click-to-load (good). Consider WebP later for LCP. |
| Mobile | Viewport meta present; responsive CSS on all pages; hamburger menu. |
| Broken links (internal) | `/`, `/vernissage`, `/nft`, `/privacy`, mailto, tel OK. Images 1–127 present. |
| Open Graph / Twitter | Present on all main pages; www URLs. |
| Favicon | `/favicon.svg` |
| sitemap.xml | Present |
| robots.txt | Present, points to sitemap; disallows `/api/` |
| Canonical | www on all pages |
| SEO meta description | Present |

**Not done by this task:** launching campaigns, bidding, creatives, or Google/Meta business verification.

---

## 7. Deploy steps

```bash
cd ~/Desktop/Projectrs/Ijareteli.com
# 1) Edit js/config.js with real GTM / GA4 / Pixel IDs
# 2) Set Vercel env for CAPI
# 3) Commit & push
git add .
git commit -m "Add ads analytics infrastructure: GTM, Consent Mode, CAPI, SEO"
git push
```

After deploy, complete GTM tags and the verification section above.

---

© MODA ARTS · Phridon Bolkvadze "Ijareteli"
