# ijareteli.com

Official website of Georgian artist **Fridon Bolkvadze** (Ijareteli / MODA ARTS).

🎨 [ijareteli.com](https://ijareteli.com)

## Stack

Static site — no build step, no frontend dependencies.
- `index.html` — landing page (Hero, About, Gallery preview, Exhibitions, Contact)
- `vernissage.html` — full gallery with lightbox and series filter
- `nft.html` — NFT collections + card checkout links
- `images/` — artwork JPEGs, numbered `1.jpeg` – `128.jpeg`
- Languages: EN, KA, RU, TR, IT, ES, JA (switch persists via localStorage)
- `js/analytics.js` + `js/config.js` — GTM, Consent Mode v2, dataLayer events, Meta CAPI client
- `api/meta-capi.js` — Meta Conversions API (Vercel serverless)
- Ads setup guide: **[ADS-SETUP.md](./ADS-SETUP.md)**

## Deploy

Hosted on **Vercel**. Every push to `main` auto-deploys to production.

```bash
git add .
git commit -m "update"
git push
```

## Add new artwork

1. Drop new JPEG files into `images/`, continuing the numeric naming (`129.jpeg`, `130.jpeg`, …)
2. In `vernissage.html`, update `const TOTAL = 128;` to the new count
3. Commit and push — Vercel redeploys in ~15 seconds

### If the collection grows beyond ~800 images

Move `images/` to a dedicated CDN (Cloudflare R2 or Bunny CDN) and change the image paths in `index.html` and `vernissage.html` from `images/N.jpeg` to e.g. `https://cdn.ijareteli.com/N.jpeg`. Keep the site itself on Vercel.

## Contact

- **Email:** ijareteli.modaarts@gmail.com · ijareteli@mail.ru
- **Phone:** +995 (555) 69-22-24
- **Instagram:** [@bolkvadzefridon](https://www.instagram.com/bolkvadzefridon)
- **Facebook:** [Ijareteli](https://www.facebook.com/Ijareteli/)

© 2018–2026 MODA ARTS · Fridon Bolkvadze "Ijareteli"
