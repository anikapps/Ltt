#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envPath = path.join(root, '.env.local');
const examplePath = path.join(root, '.env.example');

if (!fs.existsSync(envPath)) {
  if (!fs.existsSync(examplePath)) {
    console.error('[LTT BD] Missing .env.example. Run this script from the project folder.');
    process.exit(1);
  }
  fs.copyFileSync(examplePath, envPath);
}

let contents = fs.readFileSync(envPath, 'utf8');
let changed = false;

function readValue(key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = contents.match(new RegExp(`^${escaped}[ \t]*=[ \t]*(.*)$`, 'm'));
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, '') || '';
}

function setIfEmpty(key, value) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`^${escaped}\\s*=.*$`, 'm');
  const existing = contents.match(expression)?.[0];
  if (existing) {
    const current = existing.slice(existing.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
    if (current) return;
    contents = contents.replace(expression, `${key}=${value}`);
  } else {
    contents += `${contents.endsWith('\n') ? '' : '\n'}${key}=${value}\n`;
  }
  changed = true;
}

// Carry forward legacy environment values instead of silently rotating credentials or secrets.
const oldEmail = readValue('TOURBUZZ_DEFAULT_ADMIN_EMAIL');
const oldPassword = readValue('TOURBUZZ_DEFAULT_ADMIN_PASSWORD');
const oldPepper = readValue('TOURBUZZ_ROSTER_PEPPER');
const oldSessionSecret = readValue('TOURBUZZ_SESSION_SECRET');
const existingPassword = readValue('LTTBD_DEFAULT_ADMIN_PASSWORD') || oldPassword;
const generatedPassword = !existingPassword;

setIfEmpty('LTTBD_DEFAULT_ADMIN_EMAIL', oldEmail || 'admin@lttbd.local');
setIfEmpty('LTTBD_DEFAULT_ADMIN_PASSWORD', existingPassword || crypto.randomBytes(24).toString('base64url'));
setIfEmpty('LTTBD_ROSTER_PEPPER', readValue('LTTBD_ROSTER_PEPPER') || oldPepper || crypto.randomBytes(48).toString('hex'));
setIfEmpty('LTTBD_SESSION_SECRET', readValue('LTTBD_SESSION_SECRET') || oldSessionSecret || crypto.randomBytes(48).toString('hex'));

if (changed) {
  fs.writeFileSync(envPath, contents.endsWith('\n') ? contents : `${contents}\n`, { mode: 0o600 });
  try { fs.chmodSync(envPath, 0o600); } catch { /* Windows ACLs control access on Windows. */ }
  console.log('[LTT BD] Created or migrated secure local environment values in .env.local.');
}

const email = readValue('LTTBD_DEFAULT_ADMIN_EMAIL') || oldEmail;
const password = readValue('LTTBD_DEFAULT_ADMIN_PASSWORD') || oldPassword;
if (generatedPassword && email && password) {
  console.log('\nLOCAL ADMIN SIGN-IN — SAVE THESE DETAILS');
  console.log(`Email:    ${email}`);
  console.log(`Password: ${password}`);
  console.log('These credentials are stored in .env.local and are for this local installation only.');
  console.log('Do not share them or commit .env.local to Git.\n');
} else {
  console.log(`[LTT BD] Local admin email: ${email || '(not configured)'}`);
  console.log('[LTT BD] Existing credentials were preserved. Find the password in your private .env.local file if needed.');
}
