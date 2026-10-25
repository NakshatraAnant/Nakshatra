# Changelog — product transformation (2026-10-25)

## Added
- `src/astro/archetype.ts`: deterministic archetype derivation, exported from `src/astro/index.ts`.
- `src/content/archetypes.ts`: 12 archetypes (portrait, gifts, growth edge, in bonds, palette) with element and modality meanings.
- `src/content/vedic.ts`: 36 Vedic texts (Rashi, Lagna and Surya × 12).
- `src/server/modules/discover.ts`, with these routes:
  - `POST /api/v1/discover/cosmic-id`: account-free, not stored
  - `GET /api/v1/discover/sample`: labelled fictional sample
  - `GET /api/v1/cosmic-id/me`
  - `POST /api/v1/cosmic-id/shared`
  - `POST /api/v1/discover/events`: anonymous whitelist
- `src/web/components/CosmicSigil.tsx`: signature artwork from calculated data.
- `src/web/lib/cosmic.ts`: identity types, share-card renderer, native share or download, pending-birth handoff, public events.
- `src/web/pages/discover.tsx`: account-free Cosmic ID, reveal, `IdentityResult`, `ShareCardActions`.
- Tests:
  - `src/astro/archetype.test.ts`
  - `tests/integration/discover.test.ts`
  - `e2e/j-discover.spec.ts`
- Docs:
  - `docs/product-transformation/*`
  - decisions 33–43 in `docs/DECISIONS_AND_ASSUMPTIONS.md`
  - a corrections section in `docs/diagnosis/*`

## Changed
- `src/web/pages/landing.tsx`: rewritten around one promise, one CTA and a live sample. The decorative 3D scene was removed from the landing page.
- `src/web/pages/identity.tsx`: archetype panel and share cards above the existing layers.
- `src/web/pages/auth.tsx`: signup copy for `?from=discover`; onboarding prefilled from the preview, with consent asked again; interests skippable.
- `src/web/components/BirthForm.tsx`: initial place and manual coordinates, configurable consent text, `placeObject` (client-only).
- `src/web/components/layout/AppShell.tsx`:
  - navigation regrouped, with a collapsed Nakshatra Labs group
  - mobile bar: Today, Cosmic ID, Bonds, Chart
  - public header CTA → `/discover`
- `src/web/routes.tsx`: `/discover` route.
- `src/web/styles/app.css`: motion tokens and sigil choreography (reduced-motion safe).
- `src/web/pages/shop.tsx` and `src/server/services/reports.ts`: "Already free in the app" and "What this adds" on report pages.
- `src/web/pages/admin.tsx` and `src/server/modules/admin.ts`: discovery funnel.
- `src/content/interpretations.ts`: Vedic rules use pack v2 (version 2); `CONTENT_PACK_VERSION` set to `editorial-v2`.
- `src/server/db/seed.ts`: version-aware content installation.
- `src/server/modules/profile.ts`: `resolveBirth()` extracted, so preview and saved profile share validation.
- `src/server/modules/index.ts`: registers `discoverRoutes`.
- `src/server/lib/context.ts`: five new analytics events.
- `vite.config.ts`: `envDir: 'src/web'` (production React) and function `manualChunks` (no global three.js preload).

## Not changed
- Database schema and migrations.
- Calculation engine behaviour.
- Authentication and authorisation model.
- Payments and email adapters.
- Any data in the dev database other than interpretation content versions.
