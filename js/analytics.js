/**
 * ijareteli.com — Analytics bootstrap
 * Consent Mode v2 · dataLayer events · GTM loader · Meta CAPI client · UTM
 *
 * All marketing tags (GA4, Meta Pixel) must be configured in GTM.
 * This file only: consent defaults, dataLayer events, CAPI mirror, cookie UI.
 */
(function (window, document) {
  'use strict';

  var CFG = window.IJ_ANALYTICS || {};
  var CONSENT_KEY = 'ij_consent_v2';
  var UTM_KEY = 'ij_utm';
  var FBP_COOKIE = '_fbp';
  var FBC_COOKIE = '_fbc';

  window.dataLayer = window.dataLayer || [];

  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

  // ── Utils ──────────────────────────────────────────────────────────────
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function log() {
    if (CFG.debug && console && console.log) {
      console.log.apply(console, ['[IJ analytics]'].concat([].slice.call(arguments)));
    }
  }

  function isPlaceholder(id) {
    if (!id) return true;
    return /X{3,}|YOUR_|PLACEHOLDER|XXXX/i.test(String(id));
  }

  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function readConsent() {
    try {
      var raw = localStorage.getItem(CONSENT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeConsent(state) {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(state));
    } catch (e) { /* ignore */ }
  }

  // ── UTM ────────────────────────────────────────────────────────────────
  function captureUtm() {
    try {
      var params = new URLSearchParams(window.location.search);
      var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'gbraid', 'wbraid'];
      var found = {};
      var any = false;
      keys.forEach(function (k) {
        var v = params.get(k);
        if (v) {
          found[k] = v;
          any = true;
        }
      });
      if (any) {
        found.captured_at = new Date().toISOString();
        found.landing_page = window.location.pathname + window.location.search;
        sessionStorage.setItem(UTM_KEY, JSON.stringify(found));
        // Persist last-touch for CAPI attribution window
        localStorage.setItem(UTM_KEY, JSON.stringify(found));
      }
    } catch (e) { /* ignore */ }
  }

  function getUtm() {
    try {
      var s = sessionStorage.getItem(UTM_KEY) || localStorage.getItem(UTM_KEY);
      return s ? JSON.parse(s) : {};
    } catch (e) {
      return {};
    }
  }

  // ── Consent Mode v2 ────────────────────────────────────────────────────
  function applyConsent(state) {
    var granted = !!(state && state.analytics);
    var ads = !!(state && state.ads);
    gtag('consent', 'update', {
      analytics_storage: granted ? 'granted' : 'denied',
      ad_storage: ads ? 'granted' : 'denied',
      ad_user_data: ads ? 'granted' : 'denied',
      ad_personalization: ads ? 'granted' : 'denied'
    });
    log('consent update', state);
  }

  // Run consent defaults immediately (before GTM) — denied until banner choice
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500
  });
  var existing = readConsent();
  if (existing) applyConsent(existing);

  captureUtm();

  // ── GTM loader ─────────────────────────────────────────────────────────
  function loadGtm() {
    var id = CFG.gtmId;
    if (!id || isPlaceholder(id)) {
      log('GTM skipped — set a real gtmId in js/config.js (placeholder not loaded)');
      return;
    }
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var f = document.getElementsByTagName('script')[0];
    var j = document.createElement('script');
    j.async = true;
    j.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(id);
    f.parentNode.insertBefore(j, f);
    log('GTM loaded', id);
  }

  // ── CAPI client (server mirror, dedup via event_id) ─────────────────────
  function sendCapi(eventName, eventId, customData, userData) {
    var consent = readConsent();
    if (!consent || !consent.ads) {
      log('CAPI skipped — no ads consent');
      return;
    }
    if (!CFG.capiEndpoint) return;

    var utm = getUtm();
    var body = {
      event_name: eventName,
      event_id: eventId,
      event_source_url: window.location.href,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      custom_data: customData || {},
      user_data: Object.assign(
        {
          client_user_agent: navigator.userAgent,
          fbp: getCookie(FBP_COOKIE) || undefined,
          fbc: getCookie(FBC_COOKIE) || (utm.fbclid ? 'fb.1.' + Date.now() + '.' + utm.fbclid : undefined)
        },
        userData || {}
      ),
      utm: utm
    };

    try {
      var payload = JSON.stringify(body);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(CFG.capiEndpoint, new Blob([payload], { type: 'application/json' }));
      } else {
        fetch(CFG.capiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
          credentials: 'same-origin'
        }).catch(function () {});
      }
      log('CAPI sent', eventName, eventId);
    } catch (e) {
      log('CAPI error', e);
    }
  }

  // ── dataLayer event push ───────────────────────────────────────────────
  function pushEvent(eventName, params, metaEventName) {
    var eventId = (params && params.event_id) || uuid();
    var utm = getUtm();
    var payload = Object.assign(
      {
        event: eventName,
        event_id: eventId,
        page_location: window.location.href,
        page_path: window.location.pathname,
        page_title: document.title,
        page_referrer: document.referrer || undefined
      },
      utm,
      params || {}
    );
    window.dataLayer.push(payload);
    log('dataLayer', payload);

    // Mirror to Meta CAPI with same event_id (dedup with browser Pixel)
    if (metaEventName) {
      var custom = {};
      ['content_ids', 'content_name', 'content_type', 'content_category', 'value', 'currency', 'num_items', 'search_string', 'order_id'].forEach(function (k) {
        if (payload[k] !== undefined) custom[k] = payload[k];
      });
      sendCapi(metaEventName, eventId, custom);
    }
    return eventId;
  }

  // ── Public API ─────────────────────────────────────────────────────────
  var IJ = {
    pageView: function (extra) {
      return pushEvent('page_view', extra || {}, 'PageView');
    },

    viewContent: function (opts) {
      opts = opts || {};
      return pushEvent(
        'view_content',
        {
          content_ids: opts.content_ids || (opts.id ? [String(opts.id)] : undefined),
          content_name: opts.content_name || opts.name,
          content_type: opts.content_type || 'product',
          content_category: opts.content_category || opts.category,
          value: opts.value,
          currency: opts.currency || (opts.value != null ? 'USD' : undefined)
        },
        'ViewContent'
      );
    },

    search: function (term, extra) {
      return pushEvent(
        'search',
        Object.assign({ search_string: term || '', search_term: term || '' }, extra || {}),
        'Search'
      );
    },

    contact: function (method, extra) {
      return pushEvent(
        'contact',
        Object.assign({ contact_method: method || 'unknown' }, extra || {}),
        'Contact'
      );
    },

    lead: function (opts) {
      opts = opts || {};
      return pushEvent(
        'generate_lead',
        {
          content_name: opts.content_name || opts.name,
          content_ids: opts.content_ids || (opts.id ? [String(opts.id)] : undefined),
          content_category: opts.content_category || opts.category,
          value: opts.value,
          currency: opts.currency || (opts.value != null ? 'USD' : undefined),
          lead_type: opts.lead_type || 'inquiry'
        },
        'Lead'
      );
    },

    initiateCheckout: function (opts) {
      opts = opts || {};
      return pushEvent(
        'begin_checkout',
        {
          content_ids: opts.content_ids || (opts.id ? [String(opts.id)] : undefined),
          content_name: opts.content_name || opts.name,
          content_type: opts.content_type || 'product',
          content_category: opts.content_category || opts.category,
          value: opts.value,
          currency: opts.currency || 'USD',
          num_items: opts.num_items || 1
        },
        'InitiateCheckout'
      );
    },

    purchase: function (opts) {
      opts = opts || {};
      return pushEvent(
        'purchase',
        {
          transaction_id: opts.transaction_id || opts.order_id || uuid(),
          order_id: opts.order_id || opts.transaction_id,
          value: opts.value,
          currency: opts.currency || 'USD',
          content_ids: opts.content_ids || (opts.id ? [String(opts.id)] : undefined),
          content_name: opts.content_name || opts.name,
          content_type: opts.content_type || 'product',
          num_items: opts.num_items || 1
        },
        'Purchase'
      );
    },

    grantAll: function () {
      var state = { analytics: true, ads: true, ts: Date.now() };
      writeConsent(state);
      applyConsent(state);
      hideBanner();
      // Re-fire page_view after consent so tags can process
      IJ.pageView({ consent_update: true });
    },

    grantAnalyticsOnly: function () {
      var state = { analytics: true, ads: false, ts: Date.now() };
      writeConsent(state);
      applyConsent(state);
      hideBanner();
      IJ.pageView({ consent_update: true });
    },

    denyAll: function () {
      var state = { analytics: false, ads: false, ts: Date.now() };
      writeConsent(state);
      applyConsent(state);
      hideBanner();
    },

    getConsent: readConsent,
    getUtm: getUtm
  };

  window.IJ = IJ;

  // ── Cookie banner UI (matches site palette, does not alter layout) ──────
  function hideBanner() {
    var el = document.getElementById('ij-consent-banner');
    if (el) el.remove();
  }

  function showBanner() {
    if (readConsent()) return;
    if (document.getElementById('ij-consent-banner')) return;

    var css = document.createElement('style');
    css.id = 'ij-consent-styles';
    css.textContent = [
      '#ij-consent-banner{position:fixed;bottom:0;left:0;right:0;z-index:9999;',
      'background:rgba(28,28,28,0.96);color:#FDFAF6;padding:1rem 1.5rem;',
      'font-family:Jost,system-ui,sans-serif;font-weight:300;font-size:0.82rem;',
      'line-height:1.55;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;',
      'gap:1rem;box-shadow:0 -8px 32px rgba(0,0,0,0.25);border-top:1px solid rgba(184,150,90,0.35)}',
      '#ij-consent-banner p{margin:0;max-width:52rem;color:rgba(253,250,246,0.88)}',
      '#ij-consent-banner a{color:#D4B483;text-decoration:underline}',
      '#ij-consent-actions{display:flex;flex-wrap:wrap;gap:0.6rem;align-items:center}',
      '#ij-consent-actions button{cursor:pointer;font-family:inherit;font-size:0.72rem;',
      'letter-spacing:0.12em;text-transform:uppercase;padding:0.65rem 1.1rem;border-radius:0;border:1px solid transparent}',
      '#ij-c-accept{background:#B8965A;color:#1C1C1C;border-color:#B8965A}',
      '#ij-c-accept:hover{background:#D4B483}',
      '#ij-c-essential{background:transparent;color:#FDFAF6;border-color:rgba(253,250,246,0.35)}',
      '#ij-c-essential:hover{border-color:#B8965A;color:#D4B483}',
      '#ij-c-reject{background:transparent;color:rgba(253,250,246,0.55);border:none;text-decoration:underline;padding:0.65rem 0.4rem}',
      '@media(max-width:640px){#ij-consent-banner{padding:1rem;flex-direction:column;align-items:stretch}',
      '#ij-consent-actions{justify-content:stretch}#ij-consent-actions button{flex:1}}'
    ].join('');
    document.head.appendChild(css);

    var banner = document.createElement('div');
    banner.id = 'ij-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML =
      '<p>We use cookies and similar technologies for analytics and advertising measurement (Google Analytics, Meta Pixel) so we can improve the site and measure campaign performance. ' +
      'See <a href="/privacy.html">Privacy</a>. You can change your choice anytime by clearing site data.</p>' +
      '<div id="ij-consent-actions">' +
      '<button type="button" id="ij-c-accept">Accept all</button>' +
      '<button type="button" id="ij-c-essential">Analytics only</button>' +
      '<button type="button" id="ij-c-reject">Reject</button>' +
      '</div>';
    document.body.appendChild(banner);

    document.getElementById('ij-c-accept').addEventListener('click', function () {
      IJ.grantAll();
    });
    document.getElementById('ij-c-essential').addEventListener('click', function () {
      IJ.grantAnalyticsOnly();
    });
    document.getElementById('ij-c-reject').addEventListener('click', function () {
      IJ.denyAll();
    });
  }

  // ── Auto-bind contact links ────────────────────────────────────────────
  function bindContactLinks() {
    document.addEventListener(
      'click',
      function (e) {
        var a = e.target.closest && e.target.closest('a');
        if (!a || !a.href) return;
        var href = a.getAttribute('href') || '';
        if (href.indexOf('mailto:') === 0) {
          IJ.contact('email', { link_url: href });
          IJ.lead({ lead_type: 'email_click', content_name: 'mailto' });
        } else if (href.indexOf('tel:') === 0) {
          IJ.contact('phone', { link_url: href });
          IJ.lead({ lead_type: 'phone_click', content_name: 'tel' });
        } else if (/wa\.me|whatsapp\.com/i.test(href)) {
          IJ.contact('whatsapp', { link_url: href });
          IJ.lead({ lead_type: 'whatsapp_click', content_name: 'whatsapp' });
        } else if (/instagram\.com|facebook\.com/i.test(href) && a.target === '_blank') {
          IJ.contact('social', { link_url: href });
        }
      },
      true
    );
  }

  // ── Purchase success return (?purchase=success&value=&order_id=) ───────
  function checkPurchaseReturn() {
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('purchase') === 'success' || params.get('payment') === 'success') {
        IJ.purchase({
          transaction_id: params.get('order_id') || params.get('tx') || undefined,
          value: params.get('value') ? parseFloat(params.get('value')) : undefined,
          currency: params.get('currency') || 'USD',
          content_ids: params.get('content_ids') ? params.get('content_ids').split(',') : undefined,
          content_name: params.get('title') || undefined
        });
      }
    } catch (e) { /* ignore */ }
  }

  // ── Boot ───────────────────────────────────────────────────────────────
  loadGtm();

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  onReady(function () {
    // GTM noscript iframe
    if (CFG.gtmId && !isPlaceholder(CFG.gtmId)) {
      var ns = document.createElement('noscript');
      ns.innerHTML =
        '<iframe src="https://www.googletagmanager.com/ns.html?id=' +
        encodeURIComponent(CFG.gtmId) +
        '" height="0" width="0" style="display:none;visibility:hidden"></iframe>';
      document.body.insertBefore(ns, document.body.firstChild);
    }

    showBanner();
    bindContactLinks();
    checkPurchaseReturn();
    // Initial page view (Pixel PageView + GA page_view via GTM triggers)
    IJ.pageView();
  });
})(window, document);
