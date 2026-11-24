import ExcelJS from 'exceljs';
import { MAX_PASSENGERS_PER_TRIP } from './capacity';
import {
  normalizePassengerName,
  normalizePassportNumber,
  normalizePhoneNumber
} from './normalization';

export interface ParsedRosterEntry {
  serialNo: number;
  fullName: string;
  passportNumber: string;
  contactNumber: string;
  subgroupName: string;
}

export interface RosterParseResult {
  entries: ParsedRosterEntry[];
  errors: string[];
  totalRows: number;
}

/**
 * Prevents spreadsheet formula injection (=, +, -, @, \t, \r) on text fields.
 */
function sanitizeCellText(raw: string): string {
  const trimmed = String(raw || '').replace(/[\r\n]+/g, ' ').trim();
  if (/^[=+\-@\t]/.test(trimmed)) {
    return trimmed.replace(/^[=+\-@\t]+/, '').trim();
  }
  return trimmed;
}

function normalizeHeader(header: string): string {
  return String(header || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function pickColumn(row: Record<string, string>, aliases: string[]): string {
  for (const key of Object.keys(row)) {
    const norm = normalizeHeader(key);
    if (aliases.includes(norm)) {
      return String(row[key] ?? '').trim();
    }
  }
  return '';
}

function parseCsvRow(line: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cols.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current.trim());
  return cols;
}

function parseCsvToRecords(csvText: string): Array<Record<string, string>> {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvRow(lines[0]);
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvRow(lines[i]);
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rec[h] = cols[idx] ?? '';
    });
    rows.push(rec);
  }
  return rows;
}

function cellValueToString(val: ExcelJS.CellValue): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'object') {
    if ('text' in val && typeof val.text === 'string') return val.text;
    if ('result' in val && val.result !== undefined) return String(val.result);
    if ('richText' in val && Array.isArray(val.richText)) {
      return val.richText.map((r) => r.text || '').join('');
    }
  }
  return String(val);
}

export async function parseRosterBuffer(buffer: Buffer, fileName: string): Promise<RosterParseResult> {
  const errors: string[] = [];
  const entries: ParsedRosterEntry[] = [];
  const lowerName = (fileName || '').toLowerCase();

  let rawRows: Array<Record<string, string>> = [];

  if (lowerName.endsWith('.csv') || lowerName.endsWith('.txt')) {
    rawRows = parseCsvToRecords(buffer.toString('utf8'));
  } else if (lowerName.endsWith('.xlsx')) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return { entries: [], errors: ['Uploaded Excel workbook contains no worksheets.'], totalRows: 0 };
    }

    const headers: string[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          headers[colNumber - 1] = cellValueToString(cell.value);
        });
      } else {
        const rec: Record<string, string> = {};
        headers.forEach((h, idx) => {
          if (h) {
            rec[h] = cellValueToString(row.getCell(idx + 1).value);
          }
        });
        rawRows.push(rec);
      }
    });
  } else {
    return {
      entries: [],
      errors: ['Unsupported file format. Please upload a .xlsx or .csv roster file.'],
      totalRows: 0
    };
  }

  if (rawRows.length === 0) {
    return { entries: [], errors: ['Uploaded file contains no passenger rows.'], totalRows: 0 };
  }

  if (rawRows.length > MAX_PASSENGERS_PER_TRIP) {
    errors.push(
      `Roster contains ${rawRows.length} rows, exceeding the ${MAX_PASSENGERS_PER_TRIP}-passenger limit per trip.`
    );
    rawRows = rawRows.slice(0, MAX_PASSENGERS_PER_TRIP);
  }

  const seenPassports = new Set<string>();
  const seenPhones = new Set<string>();

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowIndex = i + 2;

    const rawSerial = pickColumn(row, ['sl', 'serial', 'serialno', 'no', 'slno']);
    const rawName = sanitizeCellText(
      pickColumn(row, ['fullname', 'passengername', 'name', 'touristname', 'paxname'])
    );
    const rawPassport = sanitizeCellText(
      pickColumn(row, ['passportnumber', 'passportno', 'passport', 'ppno', 'pp'])
    );
    const rawContact = pickColumn(row, [
      'contactnumber',
      'contact',
      'phonenumber',
      'phone',
      'mobile',
      'mobilenumber',
      'whatsapp'
    ]);
    const rawSubgroup = sanitizeCellText(
      pickColumn(row, ['subgroup', 'subgroupname', 'group', 'bus', 'coach', 'buscoach'])
    );

    const normName = normalizePassengerName(rawName);
    const normPassport = normalizePassportNumber(rawPassport);
    const normPhone = normalizePhoneNumber(rawContact);

    if (!normName) {
      errors.push(`Row ${rowIndex}: Missing passenger Full Name.`);
      continue;
    }
    if (!normPassport && !normPhone) {
      errors.push(`Row ${rowIndex} (${rawName}): Must include at least a Passport Number or Contact Number.`);
      continue;
    }
    if (normPassport && seenPassports.has(normPassport)) {
      errors.push(`Row ${rowIndex} (${rawName}): Duplicate Passport Number (${normPassport}).`);
      continue;
    }
    if (normPhone && seenPhones.has(normPhone)) {
      errors.push(`Row ${rowIndex} (${rawName}): Duplicate Contact Number (${normPhone}).`);
      continue;
    }

    if (normPassport) seenPassports.add(normPassport);
    if (normPhone) seenPhones.add(normPhone);

    const parsedSl = parseInt(rawSerial, 10);
    entries.push({
      serialNo: Number.isFinite(parsedSl) && parsedSl > 0 ? parsedSl : entries.length + 1,
      fullName: rawName,
      passportNumber: normPassport,
      contactNumber: normPhone,
      subgroupName: rawSubgroup || 'Main Group'
    });
  }

  return { entries, errors, totalRows: rawRows.length };
}
