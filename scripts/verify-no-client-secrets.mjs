/**
 * Build-time secret leakage verifier for EYEAI Zero-Client-Secret Architecture.
 * Ensures server secrets (GEMINI_API_KEY, PATIENT_AGENT_GEMINI_API_KEY, YOUTUBE_API_KEY)
 * NEVER appear inside Vite public output (`dist/`), and that `dist/` contains no `.env*` or server binaries.
 * Never prints actual secret values in stdout/stderr.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, 'dist');

function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

const errors = [];

if (!fs.existsSync(DIST_DIR)) {
  errors.push('Missing dist/ directory. Run vite build first.');
}

// 1. Check forbidden files inside dist/
for (const forbidden of ['.env', '.env.local', 'server.cjs', 'server.js']) {
  if (fs.existsSync(path.join(DIST_DIR, forbidden))) {
    errors.push(`Forbidden file published in dist/: ${forbidden}`);
  }
}

// 2. Collect server-only secret values from env (process.env + .env.local if present) without logging them
const serverSecretVars = ['GEMINI_API_KEY', 'PATIENT_AGENT_GEMINI_API_KEY', 'YOUTUBE_API_KEY'];
const secretCandidates = [];

function parseEnvFile(filePath) {
  const map = new Map();
  if (!fs.existsSync(filePath)) return map;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const rawVal = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (rawVal) map.set(key, rawVal);
  }
  return map;
}

const envLocalMap = parseEnvFile(path.join(ROOT, '.env.local'));
const envDefaultMap = parseEnvFile(path.join(ROOT, '.env'));

for (const varName of serverSecretVars) {
  for (const candidate of [process.env[varName], envLocalMap.get(varName), envDefaultMap.get(varName)]) {
    if (typeof candidate === 'string') {
      const clean = candidate.trim().replace(/^["']|["']$/g, '');
      if (clean.length >= 8 && !clean.startsWith('MY_')) {
        secretCandidates.push({ varName, value: clean });
      }
    }
  }
}

// 3. Scan dist/ text assets
const allDistFiles = walkFiles(DIST_DIR);
const scannable = allDistFiles.filter((f) => /\.(js|mjs|html|css)$/i.test(f));

const forbiddenPatterns = [
  { label: 'Gemini API token signature (AQ.Ab8RN6...)', regex: /AQ\.Ab8RN6[A-Za-z0-9_-]{8,}/ },
  { label: 'Direct Gemini API endpoint (generativelanguage.googleapis.com)', regex: /generativelanguage\.googleapis\.com/ },
  { label: 'Legacy global landmark exposure (__eyeai_latest_landmarks)', regex: /__eyeai_latest_landmarks/ },
  { label: 'Legacy global lowlight exposure (__eyeai_lowlight_stats)', regex: /__eyeai_lowlight_stats/ },
  { label: 'External MediaPipe CDN URL (cdn.jsdelivr.net)', regex: /cdn\.jsdelivr\.net/ },
];

for (const filePath of scannable) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  const content = fs.readFileSync(filePath, 'utf8');

  for (const { varName, value } of secretCandidates) {
    if (content.includes(value)) {
      errors.push(`SECRET_LEAK: Value of ${varName} (len=${value.length}) found in public bundle ${rel}`);
    }
  }

  for (const { label, regex } of forbiddenPatterns) {
    if (regex.test(content)) {
      errors.push(`FORBIDDEN_PATTERN: ${label} detected in ${rel}`);
    }
  }
}

if (errors.length > 0) {
  console.error('[SECRET-SCAN] FAILED:');
  for (const e of errors) {
    console.error(` - ${e}`);
  }
  process.exit(1);
}

console.log(
  `[SECRET-SCAN] PASSED: Scanned ${scannable.length} public bundle files against ${secretCandidates.length} server secret values & ${forbiddenPatterns.length} forbidden patterns. Zero leaks detected.`
);
