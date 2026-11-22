import crypto from 'crypto';

/**
 * Normalizes passenger full names:
 * - Converts to uppercase
 * - Strips Honorific prefixes only if needed or collapses punctuation/extra spaces
 * - Trims leading/trailing whitespace and collapses internal whitespace to single spaces
 */
export function normalizePassengerName(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') return '';
  return rawName
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[.,'\-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes passport numbers:
 * - Preserves alphanumeric characters as uppercase text
 * - Strips spaces, hyphens, and special characters
 * - Prevents scientific-notation or leading-zero corruption
 */
export function normalizePassportNumber(rawPassport: string): string {
  if (!rawPassport || typeof rawPassport !== 'string') return '';
  return rawPassport
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

/**
 * Normalizes phone numbers with full support for Bangladesh equivalent formats:
 * - Recognizes `017XXXXXXXX`, `+88017XXXXXXXX`, `88017XXXXXXXX`, `0088017XXXXXXXX`,
 *   and Excel-stripped leading zero `17XXXXXXXX` (10 digits starting with 13-19)
 *   as the exact same canonical format: `+8801XXXXXXXXX`.
 * - Also normalizes international numbers to E.164-like `+digits`.
 */
export function normalizePhoneNumber(rawPhone: string): string {
  if (!rawPhone || typeof rawPhone !== 'string') return '';
  const digitsOnly = rawPhone.replace(/[^0-9]/g, '');
  if (!digitsOnly) return '';

  // Case 1: 008801XXXXXXXXX (15 digits)
  if (digitsOnly.length === 15 && digitsOnly.startsWith('008801')) {
    return '+' + digitsOnly.slice(2);
  }

  // Case 2: 8801XXXXXXXXX (13 digits, e.g. +88017XXXXXXXX or 88017XXXXXXXX)
  if (digitsOnly.length === 13 && digitsOnly.startsWith('8801')) {
    return '+' + digitsOnly;
  }

  // Case 3: 01XXXXXXXXX (11 digits local Bangladesh format, e.g. 017XXXXXXXX)
  if (digitsOnly.length === 11 && /^01[3-9][0-9]{8}$/.test(digitsOnly)) {
    return '+88' + digitsOnly;
  }

  // Case 4: 1XXXXXXXXX (10 digits where Excel stripped leading 0, e.g. 17XXXXXXXX)
  if (digitsOnly.length === 10 && /^1[3-9][0-9]{8}$/.test(digitsOnly)) {
    return '+880' + digitsOnly;
  }

  // General international fallback
  return '+' + digitsOnly;
}

/**
 * Validates whether a normalized phone number is well-formed (8 to 15 digits).
 */
export function isValidNormalizedPhone(normalizedPhone: string): boolean {
  return /^\+[0-9]{8,15}$/.test(normalizedPhone);
}

/**
 * Masks a passport number for authorized admin display (e.g., A12****78).
 * Never exposed to tourists.
 */
export function maskPassportNumber(normalizedPassport: string): string {
  if (!normalizedPassport) return '';
  if (normalizedPassport.length <= 4) {
    return normalizedPassport[0] + '***';
  }
  const prefix = normalizedPassport.slice(0, 2);
  const suffix = normalizedPassport.slice(-2);
  const stars = '*'.repeat(Math.max(3, normalizedPassport.length - 4));
  return `${prefix}${stars}${suffix}`;
}

/**
 * Computes a keyed HMAC-SHA256 hash of a sensitive identifier (passport or phone)
 * scoped to a specific trip_id so raw identifiers do not need to be queried in plaintext.
 */
export function hashSensitiveIdentifier(tripId: string, normalizedValue: string): string {
  const configuredPepper = process.env.LTTBD_ROSTER_PEPPER || process.env.TOURBUZZ_ROSTER_PEPPER;
  if (!configuredPepper && process.env.NODE_ENV === 'production') {
    throw new Error('LTTBD_ROSTER_PEPPER must be configured in production.');
  }
  const pepper = configuredPepper || 'lttbd-default-dev-pepper-2026';
  return crypto
    .createHmac('sha256', pepper)
    .update(`${tripId}:${normalizedValue}`)
    .digest('hex');
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 */
export function timingSafeMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * LTT BD Passenger Verification Rule:
 * Full Name AND (Passport Number OR Registered Contact Number)
 * Logical form: Valid Name AND (Valid Passport OR Valid Contact)
 */
export function evaluateRosterMatch(params: {
  tripId: string;
  inputName: string;
  inputPassport?: string;
  inputContact?: string;
  rosterNormalizedName: string;
  rosterPassportHash: string;
  rosterContactHash: string;
}): { matched: boolean; matchedBy: 'passport' | 'contact' | 'both' | null } {
  const normName = normalizePassengerName(params.inputName);
  if (!normName || normName !== params.rosterNormalizedName) {
    return { matched: false, matchedBy: null };
  }

  const normPassport = params.inputPassport ? normalizePassportNumber(params.inputPassport) : '';
  const normContact = params.inputContact ? normalizePhoneNumber(params.inputContact) : '';

  // If neither passport nor contact was supplied, reject immediately
  if (!normPassport && !normContact) {
    return { matched: false, matchedBy: null };
  }

  let passportMatches = false;
  let contactMatches = false;

  if (normPassport) {
    const candidatePassportHash = hashSensitiveIdentifier(params.tripId, normPassport);
    passportMatches = timingSafeMatch(candidatePassportHash, params.rosterPassportHash);
  }

  if (normContact) {
    const candidateContactHash = hashSensitiveIdentifier(params.tripId, normContact);
    contactMatches = timingSafeMatch(candidateContactHash, params.rosterContactHash);
  }

  // Rule: Valid Name AND (Valid Passport OR Valid Contact)
  if (passportMatches && contactMatches) {
    return { matched: true, matchedBy: 'both' };
  }
  if (passportMatches) {
    return { matched: true, matchedBy: 'passport' };
  }
  if (contactMatches) {
    return { matched: true, matchedBy: 'contact' };
  }

  return { matched: false, matchedBy: null };
}
