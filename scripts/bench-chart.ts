/** Dev diagnostic: times each engine stage for one chart. Run: npx tsx scripts/bench-chart.ts */
import { buildChart } from '../src/astro/chart';
import { DEFAULT_VEDIC_CONFIG, DEFAULT_WESTERN_CONFIG } from '../src/astro/types';
import { vedicExtras, westernExtras } from '../src/server/modules/astro';

const t = <T>(label: string, f: () => T): T => { const s = performance.now(); const r = f(); console.info(label.padEnd(18), (performance.now() - s).toFixed(1), 'ms'); return r; };
const birth = { date: '1993-08-21', time: '14:35', timePrecision: 'exact' as const, latitude: 26.91, longitude: 75.79, timezone: 'Asia/Kolkata' };
for (let i = 0; i < 2; i++) {
  const v = t('buildChart vedic', () => buildChart(birth, DEFAULT_VEDIC_CONFIG));
  t('vedicExtras', () => vedicExtras(v));
  const w = t('buildChart western', () => buildChart(birth, DEFAULT_WESTERN_CONFIG));
  t('westernExtras', () => westernExtras(w));
}
