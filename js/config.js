/**
 * ijareteli.com — Analytics & Ads configuration
 *
 * Fill in real IDs before going live with ads.
 * Secrets (Meta CAPI token) go in Vercel Environment Variables — never here.
 *
 * See ADS-SETUP.md for step-by-step account setup.
 */
window.IJ_ANALYTICS = {
  // Google Tag Manager container ID (required for GA4 + Pixel via GTM)
  // Example: 'GTM-XXXXXXX'
  gtmId: 'GTM-MR9W2NX7',

  // Optional: also listed for documentation / debug. Actual tags fire via GTM.
  ga4MeasurementId: 'G-BMEN08X0Y7',

  // Meta Pixel ID (digits only). Used by GTM Pixel tag + CAPI server route.
  // Example: '123456789012345'
  metaPixelId: '1871946304162262',

  // Server-side Conversions API endpoint (same origin)
  capiEndpoint: '/api/meta-capi',

  // Site
  siteUrl: 'https://www.ijareteli.com',
  siteName: 'MODA ARTS · Ijareteli',

  // Debug: log dataLayer pushes to console (set true while testing tags)
  debug: false
};
