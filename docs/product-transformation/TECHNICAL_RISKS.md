# Technical risks

| # | Risk | Evidence | Mitigation | Status |
|---|---|---|---|---|
| T1 | Builds silently switch to development React when `NODE_ENV=development` is present in the root `.env` | Found this phase | `envDir: 'src/web'`. The web app reads no `VITE_*` variables; if it ever needs one, put it in `src/web/.env` | Fixed |
| T2 | Chunk graph drift: an unassigned shared module can be placed in the 3D chunk and make every page download three.js | Found this phase | Function `manualChunks`. Check `dist/web/index.html` lists only `react-*.js` as modulepreload after dependency upgrades | Fixed; add a CI check (open) |
| T3 | The static server registers asset files at startup, so after `npm run build:web` a running server serves HTML for new chunk names | Observed when rebuilding without a restart | Always restart (`npm run local:stop` then `npm run local`). `test:e2e` starts its own server | Documented |
| T4 | Feature flags exist but are not enforced server-side (`flagEnabled` has no callers) | grep | Labs modules are hidden from navigation only, which is not a security boundary (none is needed, since they are working features). Enforce flags server-side before using them to switch anything off | Open |
| T5 | Content pack upgrades retire published rows on startup | New seeding logic | Additive (new version inserted, old retired, never deleted); admin edits with higher versions win. Backup taken before the first upgrade | Mitigated |
| T6 | Public preview endpoint could be abused for compute | `/api/v1/discover/cosmic-id` | Rate limit 20/min per IP. About 10 ms per calculation | Mitigated |
| T7 | Anonymous events could be spammed to inflate the funnel | `/api/v1/discover/events` | Whitelist of three names, rate limit 30/min, no properties stored. Funnel numbers are indicative, not audited | Accepted |
| T8 | Share cards depend on fonts loaded in the page; canvas falls back to Georgia or system fonts if web fonts fail | `renderShareCard` | Awaits `document.fonts.ready`; fallbacks keep the layout legible | Accepted |
| T9 | Sigil uses inline SVG with up to about 150 elements | `CosmicSigil` | Pure SVG; no WebGL on public pages | OK |
| T10 | Production readiness gaps unchanged: live Razorpay, SMTP, PostgreSQL/Docker, legal, penetration test | `docs/RELEASE_READINESS_REPORT.md` | Owner actions | Open |
