# Jolie ecommerce

Local recreation of https://jolie.vamtam.com/ using **Next.js 16.4.3**, **React 19** and TypeScript. All application files are contained in this `ecommerce` directory; the existing frontend and backend are separate.

## Run

```powershell
cd ecommerce
npm install
npm run dev
```

Open the Local URL printed by Next.js. For production, run `npm run build` followed by `npm start`.

## Included

- Original homepage, three alternative home layouts, shop, categories, product details, journal, informational pages and archives: 119 imported reference routes.
- Original Mattone and Kanit fonts, theme icon fonts, responsive styles, product photography, editorial photographs and Instagram footer photographs served from `public/assets`.
- React enhancements for product tabs, mobile navigation, search, persistent shopping bag, quantity controls, product information tabs, carousel navigation, scroll reveals, rotating text, and header behavior.
- Keyboard focus controls and reduced-motion support.
- A local checkout preview. Payments, customer authentication, order processing and newsletter delivery need a backend integration. These services do not submit to the reference website.

## Structure

- `src/app`: Next.js App Router routes, layout and application styles.
- `src/components/reference-page.tsx`: server-rendered reference presentation.
- `src/components/storefront.tsx`: client-side store behavior and shopping bag.
- `src/content`: sanitized local presentation markup/styles, route manifest and product catalog. The original layout classes are intentionally preserved for visual accuracy. The application does not run WordPress or load its JavaScript.
- `public/assets`: locally stored images, fonts, icons and stylesheets.
- `scripts/import-reference.mjs`: repeatable migration utility; requires the downloaded reference homepage as `reference.html` and network access. `--extend` imports linked archives and pagination.
- `scripts/finalize-content.mjs`: local gallery links, accessibility labels and original footer photo migration; run after an import.

The public reference’s missing orange star artwork on an alternate homepage has a local SVG replacement. Motion behavior is recreated in React rather than running the original Elementor animation engine.

## Validation

`npm run build` statically generates the reference routes and checks TypeScript. Desktop and mobile browser checks cover the main layout, product tabs and cart; the build does not require the reference server.

Reference images, fonts and theme styles retain their original ownership. Confirm the appropriate licenses for these assets before a public launch.
