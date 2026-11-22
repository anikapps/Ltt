import { MAX_PASSENGERS_PER_TRIP } from './capacity';
import * as XLSX from 'xlsx';
import {
  normalizePassengerName,
  normalizePassportNumber,
  normalizePhoneNumber,
  isValidNormalizedPhone,
  maskPassportNumber,
  hashSensitiveIdentifier
} from './normalization';

export interface ParsedRosterEntry {
  serial_no: number;
  full_name_display: string;
  normalized_name: string;
  passport_hash: string;
  passport_masked: string;
  contact_hash: string;
  contact_number_admin: string;
}

export interface RosterValidationError {
  row: number;
  field: string;
  message: string;
}

export interface RosterParseResult {
  valid: boolean;
  entries: ParsedRosterEntry[];
  errors: RosterValidationError[];
  totalRowsRead: number;
}

const NAME_HEADERS = ['passenger name', 'full name', 'name', 'tourist name', 'pax name'];
const PASSPORT_HEADERS = ['passport number', 'passport no', 'passport', 'passport #', 'pp no'];
const CONTACT_HEADERS = ['contact number', 'phone number', 'mobile number', 'contact', 'phone', 'mobile', 'cell'];
const SERIAL_HEADERS = ['sl', 'sl no', 'serial', 'serial no', 's/n', 'no', '#'];

/**
 * Parses and validates an uploaded .xlsx or .csv buffer for a specific trip.
 * Enforces:
 * - Mandatory columns (Passenger Name, Passport Number, Contact Number)
 * - Maximum capacity (up to trip.max_tourists, hard limit 500)
 * - Preservation of passport numbers as text
 * - Detection of duplicate passengers (duplicate passport or duplicate name+contact)
 * - Phone number normalization & format validation
 */
export function parseAndValidateRosterBuffer(
  buffer: Buffer,
  tripId: string,
  maxTourists = MAX_PASSENGERS_PER_TRIP
): RosterParseResult {
  const effectiveCap = Math.min(Math.max(1, maxTourists), MAX_PASSENGERS_PER_TRIP);
  const errors: RosterValidationError[] = [];
  const entries: ParsedRosterEntry[] = [];

  let workbook: XLSX.WorkBook;
  try {
    // raw: false ensures formatted strings are preserved; cellText: true preserves leading zeros
    workbook = XLSX.read(buffer, { type: 'buffer', raw: false, cellText: true });
  } catch {
    return {
      valid: false,
      entries: [],
      errors: [{ row: 0, field: 'file', message: 'Unable to parse spreadsheet file. Please upload a valid .xlsx or .csv file.' }],
      totalRowsRead: 0
    };
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return {
      valid: false,
      entries: [],
      errors: [{ row: 0, field: 'sheet', message: 'The uploaded spreadsheet does not contain any worksheets.' }],
      totalRowsRead: 0
    };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false
  });

  if (rows.length === 0) {
    return {
      valid: false,
      entries: [],
      errors: [{ row: 1, field: 'rows', message: 'The roster file is empty. Please include at least 1 passenger row.' }],
      totalRowsRead: 0
    };
  }

  // Inspect header columns from the first row keys
  const headerKeys = Object.keys(rows[0]);
  const findKey = (candidates: string[]) =>
    headerKeys.find((k) => candidates.includes(k.trim().toLowerCase().replace(/[_\-.]+/g, ' ')));

  const nameKey = findKey(NAME_HEADERS);
  const passportKey = findKey(PASSPORT_HEADERS);
  const contactKey = findKey(CONTACT_HEADERS);
  const serialKey = findKey(SERIAL_HEADERS);

  if (!nameKey || !passportKey || !contactKey) {
    const missing: string[] = [];
    if (!nameKey) missing.push('Passenger Name');
    if (!passportKey) missing.push('Passport Number');
    if (!contactKey) missing.push('Contact Number');
    return {
      valid: false,
      entries: [],
      errors: [
        {
          row: 1,
          field: 'headers',
          message: `Missing mandatory column(s): ${missing.join(', ')}. Expected columns: SL, Passenger Name, Passport Number, Contact Number.`
        }
      ],
      totalRowsRead: rows.length
    };
  }

  if (rows.length > effectiveCap) {
    errors.push({
      row: effectiveCap + 2,
      field: 'capacity',
      message: `Roster contains ${rows.length} rows, exceeding the maximum allowed capacity of ${effectiveCap} passengers per trip (hard limit ${MAX_PASSENGERS_PER_TRIP}).`
    });
  }

  const seenPassports = new Map<string, number>();
  const seenNameContacts = new Map<string, number>();

  rows.forEach((rowObj, idx) => {
    const excelRowNumber = idx + 2; // 1-based header + 1-based index
    const rawName = String(rowObj[nameKey] ?? '').trim();
    const rawPassport = String(rowObj[passportKey] ?? '').trim();
    const rawContact = String(rowObj[contactKey] ?? '').trim();
    const rawSerial = serialKey ? String(rowObj[serialKey] ?? '').trim() : '';

    // Skip completely empty trailing rows
    if (!rawName && !rawPassport && !rawContact) {
      return;
    }

    const normName = normalizePassengerName(rawName);
    const normPassport = normalizePassportNumber(rawPassport);
    const normContact = normalizePhoneNumber(rawContact);

    if (!normName || normName.length < 2) {
      errors.push({
        row: excelRowNumber,
        field: 'Passenger Name',
        message: 'Passenger Name is missing or too short.'
      });
    }

    if (!normPassport || normPassport.length < 5) {
      errors.push({
        row: excelRowNumber,
        field: 'Passport Number',
        message: `Invalid Passport Number "${rawPassport}". Must be at least 5 alphanumeric characters.`
      });
    }

    if (!normContact || !isValidNormalizedPhone(normContact)) {
      errors.push({
        row: excelRowNumber,
        field: 'Contact Number',
        message: `Invalid Contact Number "${rawContact}". Use Bangladesh format (e.g., 017XXXXXXXX or +88017XXXXXXXX) or international format.`
      });
    }

    // Check duplicate passport in same upload
    if (normPassport) {
      const prevRow = seenPassports.get(normPassport);
      if (prevRow !== undefined) {
        errors.push({
          row: excelRowNumber,
          field: 'Passport Number',
          message: `Duplicate Passport Number "${rawPassport}" already appears on row ${prevRow}.`
        });
      } else {
        seenPassports.set(normPassport, excelRowNumber);
      }
    }

    // Check duplicate Name + Contact combination
    if (normName && normContact) {
      const compositeKey = `${normName}|${normContact}`;
      const prevRow = seenNameContacts.get(compositeKey);
      if (prevRow !== undefined) {
        errors.push({
          row: excelRowNumber,
          field: 'Passenger Name / Contact',
          message: `Duplicate passenger "${rawName}" with same contact number already appears on row ${prevRow}.`
        });
      } else {
        seenNameContacts.set(compositeKey, excelRowNumber);
      }
    }

    const serialNo = parseInt(rawSerial, 10);
    entries.push({
      serial_no: !isNaN(serialNo) && serialNo > 0 ? serialNo : entries.length + 1,
      full_name_display: rawName.replace(/\s+/g, ' ').trim(),
      normalized_name: normName,
      passport_hash: hashSensitiveIdentifier(tripId, normPassport),
      passport_masked: maskPassportNumber(normPassport),
      contact_hash: hashSensitiveIdentifier(tripId, normContact),
      contact_number_admin: normContact
    });
  });

  if (entries.length === 0 && errors.length === 0) {
    errors.push({
      row: 1,
      field: 'rows',
      message: 'No valid passenger rows were found in the file.'
    });
  }

  return {
    valid: errors.length === 0,
    entries,
    errors,
    totalRowsRead: entries.length
  };
}
