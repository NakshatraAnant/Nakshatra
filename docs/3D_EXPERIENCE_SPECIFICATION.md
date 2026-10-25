# 3D experience specification

Stack: three.js 0.180 + @react-three/fiber 9 + @react-three/drei 10, all geometry procedural (no third-party models or textures). Code: `src/web/three/{core,elements,scenes}.tsx`. Every scene is lazy-loaded (`React.lazy`) so `three` (≈704 kB, 182 kB gzip) and `r3f` (≈468 kB, 146 kB gzip) download only on pages that use 3D.

## Guarded canvas (`Scene3D` in `core.tsx`)
| Concern | Behaviour |
|---|---|
| Capability | `webglAvailable()` probes WebGL2/WebGL once; if unavailable the page renders its 2D fallback (no canvas). |
| Errors | Error boundary around the canvas; on any scene error → 2D fallback + `client_error` analytics event. |
| Context loss | `webglcontextlost` listener → 2D fallback + `webgl_context_lost` event. |
| Visibility | IntersectionObserver + `visibilitychange`: `frameloop="never"` when off-screen or the tab is hidden. |
| Reduced motion | `prefers-reduced-motion` or the in-app setting → `frameloop="demand"` (renders only on interaction), no auto-rotate, no entrance dolly, no twinkle. |
| Resolution | `dpr` capped at 1.75; drei `AdaptiveDpr` lowers it under load. |
| Quality tiers | Initial tier from CPU cores, device memory and viewport (`high`/`medium`/`low`); drei `PerformanceMonitor` steps down on sustained frame drops. Star counts 6000 / 3500 / 1500; antialiasing off on `low`. |
| Disposal | R3F disposes scene-graph objects on unmount; manually created geometries, materials and textures are disposed in effect cleanups. |
| Accessibility | Canvas wrapper has `role="img"` and a descriptive label; every scene has an equivalent 2D/textual UI beside it (lists, tables, SVG). |

## Scenes
| Scene | Page | Data source | Interaction | 2D equivalent |
|---|---|---|---|---|
| `CosmicUniverse` | Landing | Decorative (labelled "Planets shown above are decorative and not to scale") | Pointer parallax, entrance dolly | Static hero |
| `CosmicIdScene` | `/cosmic-id` | User's calculated chart: Sun/Moon/Ascendant markers placed at their actual longitudes on a zodiac ring; emblem/theme from profile customisation | Drag to rotate, click a marker → camera focus + synchronised layer panel; auto-rotate stops on selection | `IdCard2D` SVG card + "Identity layers" list (always present) and a 3D/2D toggle remembered per browser |
| `ChartWheel3D` | `/chart` | Placements from `/api/v1/charts/me` (sidereal or tropical), ascendant orientation | Select planet → highlight + info panel | North- and South-Indian SVG charts, Western wheel, aspect grid, dasha timeline and placement table |
| `BondsConstellation` | `/bonds` | Bond graph (nodes = you + Bonds, edges coloured by relationship type) laid out deterministically | Orbit, select node → detail | 2D list/Constellation SVG; toggle 3D/2D |
| `JourneyPath3D` | `/journey` | Timeline entries (gold spheres) and calculated events (blue octahedra) on a time-ordered tube | Orbit/zoom, select → detail card | Chronological list always rendered below |
| `Medallion3D` | `/journey/rewards` | Achievement constellation and earned state from the server; unlock animation only within 60 s of award | Hover/rotate | SVG `Constellation` |
| `ProductViewer3D` | Product page | Only when a product has a real `model_url` (glTF) | Orbit/zoom | Product imagery (default). No seeded product has a model, so no 3D product is shown — we do not fabricate models. |

## Truthfulness rules
- Personal scenes never show values that are not in the user's calculated chart; markers use calculated longitudes; labels come from the same API response as the 2D panel.
- Decorative scenes are labelled as decorative.
- Western markers on the Cosmic ID ring are explained: "distance from the centre has no physical meaning".

## Verification (automated)
| Test | File |
|---|---|
| Cosmic ID 3D renders with ≥ 6 layers and the 2D panel matches the API chart | `e2e/a-new-user.spec.ts` |
| WebGL unavailable → no canvas, 2D card and lists present on 3D pages, no errors | `e2e/resilience.spec.ts` |
| Forced context loss → 2D fallback | `e2e/resilience.spec.ts` |
| Reduced motion → CSS animation 0 s, canvas frame stable over 1.5 s | `e2e/resilience.spec.ts` |
| Repeated navigation between 3D pages (18 full loads + 18 client navigations) → no context warnings, ≤ 2 canvases alive | `e2e/resilience.spec.ts` |

## Performance budget
| Item | Budget | Measured (2026-10-24 build) |
|---|---|---|
| Initial JS (landing, gzip) | < 120 kB excluding lazily loaded 3D | index 25.8 kB + react 34.2 kB + landing 2.6 kB ≈ 63 kB, plus CSS 10 kB |
| 3D chunks (gzip, on demand) | < 350 kB | three 181.5 kB + r3f 146.3 kB = 327.8 kB |
| Max stars | 6000 | 6000 / 3500 / 1500 by tier |
| DPR | ≤ 1.75 | 1.75 cap + adaptive |
Frame-rate measurements on real devices have not been collected in this environment (headless browsers use a software rasteriser); see RELEASE_READINESS_REPORT.md.
