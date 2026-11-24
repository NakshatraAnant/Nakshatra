/** Writes artifacts/product-evolution/07_50_REVENUE_MODELS_INTEGRATION_MATRIX.csv from src/shared/monetisation.ts. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { REVENUE_MODELS } from '../src/shared/monetisation';

const label = {
  ready: 'Ready for implementation (product built; needs payments enabled)',
  infrastructure: 'Supported by infrastructure but not launched',
  future: 'Future opportunity',
  not_at_scale: 'Not appropriate at current scale',
} as const;
const cols = ['id', 'group', 'name', 'status', 'mechanism', 'offer', 'buyer', 'integration', 'entities', 'entitlement', 'flow', 'operations', 'risks', 'dependencies'] as const;
const q = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
const rows = REVENUE_MODELS.map((m) => cols.map((c) => (c === 'status' ? q(label[m.status]) : q(m[c]))).join(','));
mkdirSync('artifacts/product-evolution', { recursive: true });
writeFileSync('artifacts/product-evolution/07_50_REVENUE_MODELS_INTEGRATION_MATRIX.csv', ['id,group,model,launch_readiness,revenue_mechanism,user_facing_offer,buyer,nakshatra_integration_point,required_entities,entitlement_logic,ui_flow,operational_requirements,abuse_fraud_risks,dependencies', ...rows].join('\n') + '\n');
const counts: Record<string, number> = {};
for (const m of REVENUE_MODELS) counts[label[m.status]] = (counts[label[m.status]] ?? 0) + 1;
console.log(JSON.stringify(counts));
