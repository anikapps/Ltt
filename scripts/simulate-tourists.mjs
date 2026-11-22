#!/usr/bin/env node
/**
 * CLI helper to generate a 500-passenger CSV test roster for load testing.
 */
import fs from 'fs';
import path from 'path';

const count = Math.min(Math.max(1, Number(process.argv[2] || 500)), 500);
const outPath = path.join(process.cwd(), 'public', 'samples', `LTTBD_${count}_Tourists_Test_Roster.csv`);

const lines = ['SL,Passenger Name,Passport Number,Contact Number'];
for (let i = 1; i <= count; i++) {
  const sl = i;
  const name = `TOURIST PASSENGER ${String(i).padStart(3, '0')}`;
  const passport = `BD${String(1000000 + i)}`;
  const phone = `017${String(10000000 + i).slice(0, 8)}`;
  lines.push(`${sl},${name},${passport},${phone}`);
}

fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
console.log(`Generated ${count}-tourist test roster at: ${outPath}`);
