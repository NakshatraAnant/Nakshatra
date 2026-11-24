/**
 * Scans tracked source files for things that look like committed secrets.
 * Exits non-zero when a finding is not on the allow-list.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', 'dist', '.data', 'uploads', 'backups', '.git', 'playwright-report', 'test-results', 'coverage']);
const SKIP_FILES = new Set(['package-lock.json']);
const EXTS = /\.(ts|tsx|js|mjs|cjs|json|yml|yaml|md|html|css|sql|env|example|txt)$|^\.env|Dockerfile$/;

const PATTERNS: [string, RegExp][] = [
  ['private key', /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['Slack token', /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/],
  ['Stripe live key', /\b(sk|rk)_live_[A-Za-z0-9]{16,}\b/],
  ['Razorpay live key', /\brzp_live_[A-Za-z0-9]{10,}\b/],
  ['Anthropic/OpenAI style key', /\bsk-(ant-)?[A-Za-z0-9_-]{32,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['credentialed URL', /\b(postgres|postgresql|mysql|mongodb|redis|smtp|smtps):\/\/[^:\s/'"`]+:[^@\s'"`<>$]{6,}@/],
  ['assigned secret', /\b(APP_SECRET|SECRET_KEY|API_KEY|PASSWORD|WEBHOOK_SECRET|KEY_SECRET)\s*[=:]\s*['"]?[A-Za-z0-9+/_-]{20,}/],
];

// Deliberate, documented non-secrets (development-only fallbacks and test fixtures).
const ALLOW: RegExp[] = [/dev-only-insecure-secret-change-me/, /test-secret-/];

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (!SKIP_FILES.has(name) && EXTS.test(name) && name !== '.env' && st.size < 2_000_000) yield p;
  }
}

const findings: string[] = [];
let scanned = 0;
for (const file of walk(ROOT)) {
  scanned++;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (ALLOW.some((a) => a.test(line))) return;
    for (const [label, re] of PATTERNS) if (re.test(line)) findings.push(`${relative(ROOT, file)}:${i + 1}  ${label}`);
  });
}

if (findings.length) {
  console.error(`Possible secrets found (${findings.length}):\n${findings.join('\n')}`);
  process.exit(1);
}
console.log(`Secret scan passed: ${scanned} files checked, no findings. (.env is never scanned or committed.)`);
