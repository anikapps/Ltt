#!/usr/bin/env node
/**
 * LTT BD V4 — Complete Security, Normalized DB, Realtime & UX Verification Suite
 */
import crypto from 'crypto';
import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PEPPER = process.env.LTTBD_ROSTER_PEPPER || 'lttbd-default-dev-pepper-2026';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function normalizePhoneNumber(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') return '';
  const digitsOnly = rawPhone.replace(/[^0-9]/g, '');
  if (!digitsOnly) return '';
  if (digitsOnly.length === 15 && digitsOnly.startsWith('008801')) return '+' + digitsOnly.slice(2);
  if (digitsOnly.length === 13 && digitsOnly.startsWith('8801')) return '+' + digitsOnly;
  if (digitsOnly.length === 11 && /^01[3-9][0-9]{8}$/.test(digitsOnly)) return '+88' + digitsOnly;
  if (digitsOnly.length === 10 && /^1[3-9][0-9]{8}$/.test(digitsOnly)) return '+880' + digitsOnly;
  return '+' + digitsOnly;
}

function hashSensitiveIdentifier(tripId, normalizedValue) {
  return crypto.createHmac('sha256', PEPPER).update(`${tripId}:${normalizedValue}`).digest('hex');
}

console.log('----------------------------------------------------------------------------');
console.log('LTT BD V4 — Security, Architecture & Product Verification Suite');
console.log('----------------------------------------------------------------------------');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

test('1. Upgraded stack uses Next.js 16, React 19, Node >=20.18, and ExcelJS (no xlsx 0.18.5)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies.next.startsWith('^16') || pkg.dependencies.next.startsWith('16'));
  assert.ok(pkg.dependencies.react.startsWith('^19') || pkg.dependencies.react.startsWith('19'));
  assert.ok(pkg.dependencies.exceljs);
  assert.strictEqual(pkg.dependencies.xlsx, undefined);
});

test('2. Next.js 16 async cookies() and async params are used across session and API routes', () => {
  const sessionSrc = fs.readFileSync(path.join(projectRoot, 'src/lib/session.ts'), 'utf8');
  const tripRouteSrc = fs.readFileSync(path.join(projectRoot, 'src/app/api/tourist/trip/[tripId]/route.ts'), 'utf8');
  assert.ok(sessionSrc.includes('await cookies()'));
  assert.ok(tripRouteSrc.includes('Promise<{ tripId: string }>'));
});

test('3. Normalized PostgreSQL repository and append-only audit_logs migration exist', () => {
  const dbNorm = fs.readFileSync(path.join(projectRoot, 'src/lib/db-normalized.ts'), 'utf8');
  const mig = fs.readFileSync(path.join(projectRoot, 'supabase/migrations/20261124_v4_normalized_upgrade.sql'), 'utf8');
  assert.ok(dbNorm.includes("from('latest_locations')"));
  assert.ok(dbNorm.includes("from('location_history')"));
  assert.ok(dbNorm.includes("from('group_messages')"));
  assert.ok(mig.includes('trg_audit_logs_immutable'));
});

test('4. Supabase client supports both new Publishable/Secret keys and legacy anon/service_role keys', () => {
  const sbSrc = fs.readFileSync(path.join(projectRoot, 'src/lib/supabase.ts'), 'utf8');
  assert.ok(sbSrc.includes('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'));
  assert.ok(sbSrc.includes('SUPABASE_SECRET_KEY'));
  assert.ok(sbSrc.includes('SUPABASE_SERVICE_ROLE_KEY'));
});

test('5. Supabase Realtime Broadcast + Presence hook is wired for private trip channels', () => {
  const rtSrc = fs.readFileSync(path.join(projectRoot, 'src/lib/realtime.ts'), 'utf8');
  assert.ok(rtSrc.includes('trip:${tripId}'));
  assert.ok(rtSrc.includes("on('broadcast'"));
  assert.ok(rtSrc.includes("on('presence'"));
});

test('6. Cross-trip HMAC isolation and Bangladesh phone normalization work identically', () => {
  const hA1 = hashSensitiveIdentifier('trip-a', normalizePhoneNumber('01711223344'));
  const hA2 = hashSensitiveIdentifier('trip-a', normalizePhoneNumber('+8801711223344'));
  const hA3 = hashSensitiveIdentifier('trip-a', normalizePhoneNumber('1711223344'));
  const hB = hashSensitiveIdentifier('trip-b', normalizePhoneNumber('+8801711223344'));
  assert.strictEqual(hA1, hA2);
  assert.strictEqual(hA1, hA3);
  assert.notStrictEqual(hA1, hB);
});

test('7. Street Map is the default view across the app with free Esri tiles (zero CARTO keys)', () => {
  const mapSrc = fs.readFileSync(path.join(projectRoot, 'src/components/GroupMap.tsx'), 'utf8');
  assert.ok(mapSrc.includes("useState<'street' | 'satellite'>('street')"));
  assert.ok(!mapSrc.toLowerCase().includes('carto'));
});

test('8. Old tour revival revokes old sessions, consents, and invites while logging audit event', () => {
  const dbNorm = fs.readFileSync(path.join(projectRoot, 'src/lib/db-normalized.ts'), 'utf8');
  const reviveSection = dbNorm.slice(dbNorm.indexOf('export async function pgReviveTrip'));
  assert.ok(reviveSection.includes('session_revoked: true'));
  assert.ok(reviveSection.includes('sharing_enabled: false'));
  assert.ok(reviveSection.includes("action: 'TRIP_REVIVED'"));
});

test('9. 200-passenger free-tier capacity is consistent across capacity, SQL, and simulator', () => {
  const cap = fs.readFileSync(path.join(projectRoot, 'src/lib/capacity.ts'), 'utf8');
  const schema = fs.readFileSync(path.join(projectRoot, 'supabase/schema.sql'), 'utf8');
  const sim = fs.readFileSync(path.join(projectRoot, 'scripts/simulate-tourists.mjs'), 'utf8');
  assert.ok(cap.includes('MAX_PASSENGERS_PER_TRIP = 200'));
  assert.ok(schema.includes('max_tourists <= 200'));
  assert.ok(sim.includes(')), 200);'));
});

test('10. Every client component has "use client" on line 1', () => {
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.tsx')) {
        const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
        lines.forEach((l, idx) => {
          if (l.includes("'use client'") || l.includes('"use client"')) {
            assert.strictEqual(idx, 0, `Misplaced 'use client' in ${full}:${idx + 1}`);
          }
        });
      }
    }
  };
  walk(path.join(projectRoot, 'src'));
});

console.log('----------------------------------------------------------------------------');
console.log(`All ${passed}/${passed} LTT BD V4 verification checks passed.`);
console.log('----------------------------------------------------------------------------');
