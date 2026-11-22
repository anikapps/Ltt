/**
 * Pure TypeScript ISO/IEC 18004 QR Code Matrix Generator (Byte Mode, Versions 1–10, Error Correction L).
 * Zero external dependencies — works offline and online globally in any browser or server environment.
 */

interface VersionInfo {
  version: number;
  size: number;
  dataCodewords: number;
  ecCodewordsPerBlock: number;
  numBlocks: number;
  alignmentPatterns: number[];
}

// ISO/IEC 18004 Version 1–10 Level L specifications
const VERSION_TABLE_L: VersionInfo[] = [
  { version: 1, size: 21, dataCodewords: 19, ecCodewordsPerBlock: 7, numBlocks: 1, alignmentPatterns: [] },
  { version: 2, size: 25, dataCodewords: 34, ecCodewordsPerBlock: 10, numBlocks: 1, alignmentPatterns: [6, 18] },
  { version: 3, size: 29, dataCodewords: 55, ecCodewordsPerBlock: 15, numBlocks: 1, alignmentPatterns: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, ecCodewordsPerBlock: 20, numBlocks: 1, alignmentPatterns: [6, 26] },
  { version: 5, size: 37, dataCodewords: 108, ecCodewordsPerBlock: 26, numBlocks: 1, alignmentPatterns: [6, 30] },
  { version: 6, size: 41, dataCodewords: 136, ecCodewordsPerBlock: 18, numBlocks: 2, alignmentPatterns: [6, 34] },
  { version: 7, size: 45, dataCodewords: 156, ecCodewordsPerBlock: 20, numBlocks: 2, alignmentPatterns: [6, 22, 38] },
  { version: 8, size: 49, dataCodewords: 194, ecCodewordsPerBlock: 24, numBlocks: 2, alignmentPatterns: [6, 24, 42] },
  { version: 9, size: 53, dataCodewords: 232, ecCodewordsPerBlock: 30, numBlocks: 2, alignmentPatterns: [6, 26, 46] },
  { version: 10, size: 57, dataCodewords: 274, ecCodewordsPerBlock: 18, numBlocks: 4, alignmentPatterns: [6, 28, 50] }
];

// GF(256) exponent and log tables for Reed-Solomon (primitive polynomial 0x11D)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function rsComputeRemainder(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGeneratorPoly(ecLen);
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    for (let j = 0; j < ecLen - 1; j++) {
      rem[j] = rem[j + 1] ^ gfMul(gen[j + 1], factor);
    }
    rem[ecLen - 1] = gfMul(gen[ecLen], factor);
  }
  return rem;
}

function encodeDataCodewords(text: string, vInfo: VersionInfo): Uint8Array {
  const utf8 = new TextEncoder().encode(text);
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  };

  // Byte mode indicator (0100)
  pushBits(0b0100, 4);
  // Character count indicator (8 bits for versions 1–9, 16 bits for version 10)
  const countBits = vInfo.version <= 9 ? 8 : 16;
  pushBits(utf8.length, countBits);

  for (let i = 0; i < utf8.length; i++) {
    pushBits(utf8[i], 8);
  }

  // Terminator (up to 4 zero bits)
  const capacityBits = vInfo.dataCodewords * 8;
  const termLen = Math.min(4, capacityBits - bits.length);
  pushBits(0, termLen);

  // Pad to byte boundary
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords = new Uint8Array(vInfo.dataCodewords);
  let byteIdx = 0;
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bits[i + j];
    }
    codewords[byteIdx++] = b;
  }

  // Pad codewords 0xEC, 0x11 alternating
  let padToggle = true;
  while (byteIdx < vInfo.dataCodewords) {
    codewords[byteIdx++] = padToggle ? 0xec : 0x11;
    padToggle = !padToggle;
  }

  // Interleave blocks + EC codewords
  const blockDataSize = Math.floor(vInfo.dataCodewords / vInfo.numBlocks);
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];

  let offset = 0;
  for (let b = 0; b < vInfo.numBlocks; b++) {
    const block = codewords.slice(offset, offset + blockDataSize);
    offset += blockDataSize;
    dataBlocks.push(block);
    ecBlocks.push(rsComputeRemainder(block, vInfo.ecCodewordsPerBlock));
  }

  const totalLen = vInfo.dataCodewords + vInfo.ecCodewordsPerBlock * vInfo.numBlocks;
  const finalBytes = new Uint8Array(totalLen);
  let ptr = 0;

  for (let i = 0; i < blockDataSize; i++) {
    for (let b = 0; b < vInfo.numBlocks; b++) {
      finalBytes[ptr++] = dataBlocks[b][i];
    }
  }
  for (let i = 0; i < vInfo.ecCodewordsPerBlock; i++) {
    for (let b = 0; b < vInfo.numBlocks; b++) {
      finalBytes[ptr++] = ecBlocks[b][i];
    }
  }

  return finalBytes;
}

function computeFormatBits(ecLevelBits: number, maskPattern: number): number {
  const data = (ecLevelBits << 3) | maskPattern;
  let rem = data << 10;
  const gen = 0b10100110111;
  for (let i = 14; i >= 10; i--) {
    if ((rem >>> i) & 1) {
      rem ^= gen << (i - 10);
    }
  }
  return ((data << 10) | rem) ^ 0b101010000010010;
}

export function generateQrMatrix(text: string): boolean[][] {
  const utf8Len = new TextEncoder().encode(text || 'LTT BD').length;
  // Pick smallest version that fits utf8Len + 3 header bytes
  const vInfo =
    VERSION_TABLE_L.find((v) => v.dataCodewords >= utf8Len + 3) ||
    VERSION_TABLE_L[VERSION_TABLE_L.length - 1];

  const size = vInfo.size;
  const modules: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setFunctionModule = (r: number, c: number, dark: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      modules[r][c] = dark;
      isFunction[r][c] = true;
    }
  };

  // 1. Finder patterns + separators
  const drawFinder = (topR: number, leftC: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = topR + dr;
        const c = leftC + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFunctionModule(r, c, inOuter && (onBorder || inInner));
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // 2. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunctionModule(6, i, i % 2 === 0);
    setFunctionModule(i, 6, i % 2 === 0);
  }

  // 3. Alignment patterns
  const alignCoords = vInfo.alignmentPatterns;
  for (const ar of alignCoords) {
    for (const ac of alignCoords) {
      // Skip if overlapping finder corners
      if (
        (ar <= 8 && ac <= 8) ||
        (ar <= 8 && ac >= size - 9) ||
        (ar >= size - 9 && ac <= 8)
      ) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark =
            Math.max(Math.abs(dr), Math.abs(dc)) === 2 || (dr === 0 && dc === 0);
          setFunctionModule(ar + dr, ac + dc, dark);
        }
      }
    }
  }

  // 4. Reserve format information modules & dark module
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      if (!isFunction[8][i]) setFunctionModule(8, i, false);
      if (!isFunction[i][8]) setFunctionModule(i, 8, false);
    }
  }
  for (let i = 0; i < 8; i++) {
    if (!isFunction[8][size - 1 - i]) setFunctionModule(8, size - 1 - i, false);
    if (!isFunction[size - 1 - i][8]) setFunctionModule(size - 1 - i, 8, false);
  }
  setFunctionModule(size - 8, 8, true); // Always dark module

  // 5. Place data + EC bits in zigzag upward/downward columns
  const allCodewords = encodeDataCodewords(text || 'LTT BD', vInfo);
  let bitIndex = 0;
  const totalBits = allCodewords.length * 8;

  let upward = true;
  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) rightCol = 5; // Skip vertical timing column
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let dc = 0; dc < 2; dc++) {
        const c = rightCol - dc;
        if (!isFunction[r][c]) {
          let dark = false;
          if (bitIndex < totalBits) {
            const byteVal = allCodewords[bitIndex >>> 3];
            dark = ((byteVal >>> (7 - (bitIndex & 7))) & 1) === 1;
            bitIndex++;
          }
          // Apply Mask Pattern 0: (r + c) % 2 === 0
          if ((r + c) % 2 === 0) {
            dark = !dark;
          }
          modules[r][c] = dark;
        }
      }
    }
    upward = !upward;
  }

  // 6. Write Format Information for Level L (01) and Mask 0 (000) per ISO/IEC 18004 Section 7.9
  const formatBits = computeFormatBits(0b01, 0);
  const getFormatBit = (idx: number) => ((formatBits >>> idx) & 1) === 1;

  // Copy 1: around top-left finder pattern (bit 0 at [0,8] down to bit 14 at [8,0])
  for (let i = 0; i <= 5; i++) modules[i][8] = getFormatBit(i);
  modules[7][8] = getFormatBit(6);
  modules[8][8] = getFormatBit(7);
  modules[8][7] = getFormatBit(8);
  for (let i = 9; i < 15; i++) modules[8][14 - i] = getFormatBit(i);

  // Copy 2: top-right horizontal (bits 0..7) and bottom-left vertical (bits 8..14)
  for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = getFormatBit(i);
  for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = getFormatBit(i);

  return modules;
}
