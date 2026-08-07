/**
 * Dependency-free QR Code encoder (ISO/IEC 18004) producing vector SVG.
 *
 * TITAN prints payment QR codes on A4 invoices, so the symbol must be a real
 * encoding of a real URL — there is deliberately no placeholder/mock path in
 * this module. Byte mode only, which covers every URL we embed.
 */

export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export type QrMatrix = {
  version: number;
  size: number;
  errorCorrectionLevel: QrErrorCorrectionLevel;
  mask: number;
  /** `modules[y][x]` — true is a dark module. */
  modules: boolean[][];
};

export class QrCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QrCodeError';
  }
}

const MIN_VERSION = 1;
const MAX_VERSION = 40;

/** Byte mode (0100). */
const MODE_BYTE_INDICATOR = 0b0100;

const ECC_LEVEL_ORDER: QrErrorCorrectionLevel[] = ['L', 'M', 'Q', 'H'];

/** Format-information bits per level (not the same order as ECC_LEVEL_ORDER). */
const ECC_FORMAT_BITS: Record<QrErrorCorrectionLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

/** ECC codewords per block, indexed [level][version]. Table 13-22, ISO/IEC 18004. */
const ECC_CODEWORDS_PER_BLOCK: Record<QrErrorCorrectionLevel, readonly number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

/** Error-correction block count, indexed [level][version]. Table 13-22, ISO/IEC 18004. */
const ECC_BLOCK_COUNT: Record<QrErrorCorrectionLevel, readonly number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 5, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

export type EncodeQrOptions = {
  errorCorrectionLevel?: QrErrorCorrectionLevel;
  /** Force a minimum symbol version (more modules). Encoding still grows if needed. */
  minVersion?: number;
  /**
   * Force a mask pattern instead of letting penalty scoring choose. Only used to
   * compare output against reference encoders; production leaves this unset.
   */
  mask?: number;
};

/**
 * Encodes `text` as a QR symbol. Throws rather than degrading, so a caller can
 * never accidentally render a QR that does not carry the requested payload.
 */
export function encodeQrMatrix(text: string, options: EncodeQrOptions = {}): QrMatrix {
  if (typeof text !== 'string' || text.length === 0) {
    throw new QrCodeError('QR payload must be a non-empty string');
  }

  const level = options.errorCorrectionLevel ?? 'H';
  const minVersion = clampVersion(options.minVersion ?? MIN_VERSION);
  const data = utf8Bytes(text);

  const version = pickVersion(data.length, level, minVersion);
  const dataCapacityBits = dataCodewordCount(version, level) * 8;

  const bits: number[] = [];
  appendBits(bits, MODE_BYTE_INDICATOR, 4);
  appendBits(bits, data.length, byteModeCountBits(version));
  for (const byte of data) {
    appendBits(bits, byte, 8);
  }

  // Terminator, byte alignment, then alternating pad codewords.
  appendBits(bits, 0, Math.min(4, dataCapacityBits - bits.length));
  appendBits(bits, 0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < dataCapacityBits; pad ^= 0xec ^ 0x11) {
    appendBits(bits, pad, 8);
  }

  const dataCodewords = bitsToBytes(bits);
  const codewords = interleaveWithEcc(dataCodewords, version, level);

  return buildMatrix(codewords, version, level, options.mask);
}

export type RenderQrSvgOptions = {
  /** Quiet zone in modules. The spec requires at least 4; we never go below it. */
  quietZoneModules?: number;
  /** Printed edge length. Scanners need roughly 30mm from an A4 page. */
  sizeMm?: number;
  darkColor?: string;
  lightColor?: string;
  /** Accessible name rendered as `<title>`. */
  title?: string;
};

/** Minimum printed QR edge length that reliably scans from paper. */
export const QR_MIN_PRINT_SIZE_MM = 30;

const QR_MIN_QUIET_ZONE_MODULES = 4;

/**
 * Renders the symbol as a single-path SVG. One path keeps the PDF small and
 * fully vector, so print output stays crisp at any scale.
 */
export function renderQrSvg(matrix: QrMatrix, options: RenderQrSvgOptions = {}): string {
  const quiet = Math.max(QR_MIN_QUIET_ZONE_MODULES, Math.floor(options.quietZoneModules ?? QR_MIN_QUIET_ZONE_MODULES));
  const sizeMm = Math.max(QR_MIN_PRINT_SIZE_MM, options.sizeMm ?? QR_MIN_PRINT_SIZE_MM);
  const dark = options.darkColor ?? '#000000';
  const light = options.lightColor ?? '#ffffff';
  const extent = matrix.size + quiet * 2;

  const segments: string[] = [];
  for (let y = 0; y < matrix.size; y += 1) {
    const row = matrix.modules[y]!;
    for (let x = 0; x < matrix.size; x += 1) {
      if (row[x]) {
        segments.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
      }
    }
  }

  const titleMarkup = options.title ? `<title>${escapeXml(options.title)}</title>` : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}"`,
    ` width="${sizeMm}mm" height="${sizeMm}mm" shape-rendering="crispEdges"`,
    ` role="img"${options.title ? ` aria-label="${escapeXml(options.title)}"` : ''}>`,
    titleMarkup,
    `<rect width="${extent}" height="${extent}" fill="${escapeXml(light)}"/>`,
    `<path fill="${escapeXml(dark)}" d="${segments.join('')}"/>`,
    '</svg>',
  ].join('');
}

/**
 * Builds a printable QR for a real https link. Refuses anything else so a
 * broken or internal link can never be printed as a scannable invite.
 */
export function buildLinkQrSvg(
  url: string,
  options: { sizeMm?: number; title?: string; purpose?: string } = {},
): string {
  const purpose = options.purpose ?? 'QR';
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new QrCodeError(`${purpose} requires a valid absolute URL`);
  }
  if (parsed.protocol !== 'https:') {
    throw new QrCodeError(`${purpose} requires an https URL`);
  }

  // Level H so a scuffed or partly obscured printed page still scans.
  const matrix = encodeQrMatrix(trimmed, { errorCorrectionLevel: 'H' });
  return renderQrSvg(matrix, {
    sizeMm: options.sizeMm ?? QR_MIN_PRINT_SIZE_MM,
    title: options.title ?? purpose,
    quietZoneModules: QR_MIN_QUIET_ZONE_MODULES,
  });
}

/**
 * Builds the printable payment QR. Only ever called with a URL that has already
 * been validated as a real Yoco hosted payment page.
 */
export function buildPaymentQrSvg(
  paymentUrl: string,
  options: { sizeMm?: number; title?: string } = {},
): string {
  return buildLinkQrSvg(paymentUrl, {
    sizeMm: options.sizeMm,
    title: options.title ?? 'Scan to pay',
    purpose: 'Payment QR',
  });
}

/** Builds the Google review QR. Reports carry this; they never carry a payment QR. */
export function buildReviewQrSvg(
  reviewUrl: string,
  options: { sizeMm?: number; title?: string } = {},
): string {
  return buildLinkQrSvg(reviewUrl, {
    sizeMm: options.sizeMm,
    title: options.title ?? 'Scan to leave a Google review',
    purpose: 'Review QR',
  });
}

// ---------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------

function clampVersion(version: number): number {
  if (!Number.isInteger(version) || version < MIN_VERSION || version > MAX_VERSION) {
    throw new QrCodeError(`QR version must be an integer between ${MIN_VERSION} and ${MAX_VERSION}`);
  }
  return version;
}

function byteModeCountBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

/** Total module count available for data + ECC codewords, before function patterns. */
export function rawDataModuleCount(version: number): number {
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alignmentCount = Math.floor(version / 7) + 2;
    modules -= (25 * alignmentCount - 10) * alignmentCount - 55;
    if (version >= 7) {
      modules -= 36;
    }
  }
  return modules;
}

export function dataCodewordCount(version: number, level: QrErrorCorrectionLevel): number {
  const total = Math.floor(rawDataModuleCount(version) / 8);
  return total - ECC_CODEWORDS_PER_BLOCK[level][version]! * ECC_BLOCK_COUNT[level][version]!;
}

function pickVersion(byteLength: number, level: QrErrorCorrectionLevel, minVersion: number): number {
  for (let version = minVersion; version <= MAX_VERSION; version += 1) {
    const capacityBits = dataCodewordCount(version, level) * 8;
    const requiredBits = 4 + byteModeCountBits(version) + byteLength * 8;
    if (requiredBits <= capacityBits) {
      return version;
    }
  }
  throw new QrCodeError(
    `Payload of ${byteLength} bytes does not fit a QR symbol at error-correction level ${level}`,
  );
}

// ---------------------------------------------------------------------------
// Bit and byte helpers
// ---------------------------------------------------------------------------

function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return out;
}

function appendBits(bits: number[], value: number, length: number): void {
  if (length < 0 || length > 31 || value >>> length !== 0) {
    throw new QrCodeError('Invalid QR bit sequence');
  }
  for (let shift = length - 1; shift >= 0; shift -= 1) {
    bits.push((value >>> shift) & 1);
  }
}

function bitsToBytes(bits: number[]): number[] {
  const bytes = new Array<number>(bits.length >>> 3).fill(0);
  bits.forEach((bit, index) => {
    bytes[index >>> 3]! |= bit << (7 - (index & 7));
  });
  return bytes;
}

// ---------------------------------------------------------------------------
// Reed-Solomon over GF(256)
// ---------------------------------------------------------------------------

/** Multiplies two GF(256) values under the QR primitive polynomial 0x11D. */
export function gf256Multiply(a: number, b: number): number {
  let result = 0;
  for (let shift = 7; shift >= 0; shift -= 1) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d);
    result ^= ((b >>> shift) & 1) * a;
  }
  return result & 0xff;
}

/** Generator polynomial coefficients (excluding the leading 1) for `degree`. */
export function reedSolomonGenerator(degree: number): number[] {
  if (degree < 1 || degree > 255) {
    throw new QrCodeError('Invalid Reed-Solomon degree');
  }
  const coefficients = new Array<number>(degree).fill(0);
  coefficients[degree - 1] = 1;

  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      coefficients[j] = gf256Multiply(coefficients[j]!, root);
      if (j + 1 < degree) {
        coefficients[j] ^= coefficients[j + 1]!;
      }
    }
    root = gf256Multiply(root, 0x02);
  }
  return coefficients;
}

/** Computes the `degree` error-correction codewords for one block. */
export function reedSolomonRemainder(data: readonly number[], degree: number): number[] {
  const generator = reedSolomonGenerator(degree);
  const remainder = new Array<number>(degree).fill(0);

  for (const byte of data) {
    const factor = byte ^ remainder.shift()!;
    remainder.push(0);
    generator.forEach((coefficient, index) => {
      remainder[index] ^= gf256Multiply(coefficient, factor);
    });
  }
  return remainder;
}

export type QrBlockStructure = {
  blockCount: number;
  eccPerBlock: number;
  totalCodewords: number;
  /** Number of blocks carrying one fewer data codeword. */
  shortBlockCount: number;
  /** Data codewords in a short block. */
  shortDataLength: number;
};

/** Error-correction block layout, needed to interleave and to de-interleave. */
export function eccBlockStructure(
  version: number,
  level: QrErrorCorrectionLevel,
): QrBlockStructure {
  const blockCount = ECC_BLOCK_COUNT[level][version]!;
  const eccPerBlock = ECC_CODEWORDS_PER_BLOCK[level][version]!;
  const totalCodewords = Math.floor(rawDataModuleCount(version) / 8);
  return {
    blockCount,
    eccPerBlock,
    totalCodewords,
    shortBlockCount: blockCount - (totalCodewords % blockCount),
    shortDataLength: Math.floor(totalCodewords / blockCount) - eccPerBlock,
  };
}

function interleaveWithEcc(
  dataCodewords: readonly number[],
  version: number,
  level: QrErrorCorrectionLevel,
): number[] {
  const { blockCount, eccPerBlock, totalCodewords, shortBlockCount } = eccBlockStructure(
    version,
    level,
  );
  const shortBlockLength = Math.floor(totalCodewords / blockCount);

  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];

  let offset = 0;
  for (let i = 0; i < blockCount; i += 1) {
    const dataLength = shortBlockLength - eccPerBlock + (i < shortBlockCount ? 0 : 1);
    const block = dataCodewords.slice(offset, offset + dataLength);
    offset += dataLength;
    dataBlocks.push(block);
    eccBlocks.push(reedSolomonRemainder(block, eccPerBlock));
  }

  const result: number[] = [];
  const longestDataBlock = shortBlockLength - eccPerBlock + 1;
  for (let i = 0; i < longestDataBlock; i += 1) {
    for (const block of dataBlocks) {
      // Short blocks contribute nothing on the final pass.
      if (i < block.length) result.push(block[i]!);
    }
  }
  for (let i = 0; i < eccPerBlock; i += 1) {
    for (const block of eccBlocks) {
      result.push(block[i]!);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Matrix construction
// ---------------------------------------------------------------------------

type MutableMatrix = {
  size: number;
  modules: boolean[][];
  /** Function patterns and format/version areas that data must not overwrite. */
  reserved: boolean[][];
};

function buildMatrix(
  codewords: readonly number[],
  version: number,
  level: QrErrorCorrectionLevel,
  forcedMask?: number,
): QrMatrix {
  const size = version * 4 + 17;
  const matrix: MutableMatrix = {
    size,
    modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };

  drawFunctionPatterns(matrix, version, level);
  drawCodewords(matrix, codewords);

  if (forcedMask !== undefined && (!Number.isInteger(forcedMask) || forcedMask < 0 || forcedMask > 7)) {
    throw new QrCodeError('Invalid QR mask pattern');
  }
  const mask = forcedMask ?? pickMask(matrix, level);
  applyMask(matrix, mask);
  drawFormatBits(matrix, level, mask);

  return {
    version,
    size,
    errorCorrectionLevel: level,
    mask,
    modules: matrix.modules,
  };
}

function setFunctionModule(matrix: MutableMatrix, x: number, y: number, dark: boolean): void {
  matrix.modules[y]![x] = dark;
  matrix.reserved[y]![x] = true;
}

function drawFunctionPatterns(
  matrix: MutableMatrix,
  version: number,
  level: QrErrorCorrectionLevel,
): void {
  const { size } = matrix;

  for (let i = 0; i < size; i += 1) {
    setFunctionModule(matrix, 6, i, i % 2 === 0);
    setFunctionModule(matrix, i, 6, i % 2 === 0);
  }

  drawFinderPattern(matrix, 3, 3);
  drawFinderPattern(matrix, size - 4, 3);
  drawFinderPattern(matrix, 3, size - 4);

  const alignment = alignmentPatternPositions(version);
  for (let i = 0; i < alignment.length; i += 1) {
    for (let j = 0; j < alignment.length; j += 1) {
      const isFinderCorner =
        (i === 0 && j === 0) ||
        (i === 0 && j === alignment.length - 1) ||
        (i === alignment.length - 1 && j === 0);
      if (!isFinderCorner) {
        drawAlignmentPattern(matrix, alignment[i]!, alignment[j]!);
      }
    }
  }

  // Placeholder format bits; the real ones are written once the mask is chosen.
  drawFormatBits(matrix, level, 0);
  drawVersionBits(matrix, version);
}

function drawFinderPattern(matrix: MutableMatrix, centerX: number, centerY: number): void {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || x >= matrix.size || y < 0 || y >= matrix.size) continue;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunctionModule(matrix, x, y, distance !== 2 && distance !== 4);
    }
  }
}

function drawAlignmentPattern(matrix: MutableMatrix, centerX: number, centerY: number): void {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setFunctionModule(
        matrix,
        centerX + dx,
        centerY + dy,
        Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
      );
    }
  }
}

export function alignmentPatternPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step =
    version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;

  const positions = [6];
  for (let pos = version * 4 + 17 - 7; positions.length < count; pos -= step) {
    positions.splice(1, 0, pos);
  }
  return positions;
}

function drawFormatBits(matrix: MutableMatrix, level: QrErrorCorrectionLevel, mask: number): void {
  const format = formatInformationBits(level, mask);
  const { size } = matrix;

  for (let i = 0; i <= 5; i += 1) {
    setFunctionModule(matrix, 8, i, bitAt(format, i));
  }
  setFunctionModule(matrix, 8, 7, bitAt(format, 6));
  setFunctionModule(matrix, 8, 8, bitAt(format, 7));
  setFunctionModule(matrix, 7, 8, bitAt(format, 8));
  for (let i = 9; i < 15; i += 1) {
    setFunctionModule(matrix, 14 - i, 8, bitAt(format, i));
  }

  for (let i = 0; i < 8; i += 1) {
    setFunctionModule(matrix, size - 1 - i, 8, bitAt(format, i));
  }
  for (let i = 8; i < 15; i += 1) {
    setFunctionModule(matrix, 8, size - 15 + i, bitAt(format, i));
  }
  // Always-dark module beside the lower-left finder.
  setFunctionModule(matrix, 8, size - 8, true);
}

/** 15-bit masked format information written beside the finder patterns. */
export function formatInformationBits(level: QrErrorCorrectionLevel, mask: number): number {
  if (!Number.isInteger(mask) || mask < 0 || mask > 7) {
    throw new QrCodeError('Invalid QR mask pattern');
  }
  const data = (ECC_FORMAT_BITS[level] << 3) | mask;
  return (((data << 10) | bchRemainder(data, 0x537, 10)) ^ 0x5412) & 0x7fff;
}

/** 18-bit version information, present from version 7 upwards. */
export function versionInformationBits(version: number): number {
  return ((version << 12) | bchRemainder(version, 0x1f25, 12)) & 0x3ffff;
}

function drawVersionBits(matrix: MutableMatrix, version: number): void {
  if (version < 7) return;
  const bits = versionInformationBits(version);
  const { size } = matrix;

  for (let i = 0; i < 18; i += 1) {
    const dark = bitAt(bits, i);
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFunctionModule(matrix, a, b, dark);
    setFunctionModule(matrix, b, a, dark);
  }
}

/** BCH remainder used by both the format (0x537) and version (0x1F25) codes. */
export function bchRemainder(value: number, generator: number, degree: number): number {
  let remainder = value;
  for (let i = 0; i < degree; i += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> (degree - 1)) * generator);
  }
  return remainder & ((1 << degree) - 1);
}

function bitAt(value: number, index: number): boolean {
  return ((value >>> index) & 1) !== 0;
}

/**
 * Coordinates of every data module, in the zigzag order codeword bits are placed.
 * Exposed so a decoder can walk the same layout without re-deriving it.
 */
export function dataModuleOrder(version: number): Array<{ x: number; y: number }> {
  const level: QrErrorCorrectionLevel = 'L';
  const size = clampVersion(version) * 4 + 17;
  const matrix: MutableMatrix = {
    size,
    modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };
  drawFunctionPatterns(matrix, version, level);

  const order: Array<{ x: number; y: number }> = [];
  walkDataModules(matrix, (x, y) => {
    order.push({ x, y });
  });
  return order;
}

function walkDataModules(
  matrix: MutableMatrix,
  visit: (x: number, y: number) => void,
): void {
  const { size } = matrix;

  for (let right = size - 1; right >= 1; right -= 2) {
    // Column 6 carries the vertical timing pattern, so the pair shifts left by one.
    if (right === 6) right = 5;

    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;

        if (matrix.reserved[y]![x]) continue;
        visit(x, y);
      }
    }
  }
}

function drawCodewords(matrix: MutableMatrix, codewords: readonly number[]): void {
  const totalBits = codewords.length * 8;
  let bitIndex = 0;

  walkDataModules(matrix, (x, y) => {
    // Trailing remainder modules stay light; they carry no codeword bits.
    if (bitIndex >= totalBits) return;
    matrix.modules[y]![x] = bitAt(codewords[bitIndex >>> 3]!, 7 - (bitIndex & 7));
    bitIndex += 1;
  });
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      throw new QrCodeError('Invalid QR mask pattern');
  }
}

function applyMask(matrix: MutableMatrix, mask: number): void {
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (!matrix.reserved[y]![x] && maskBit(mask, x, y)) {
        matrix.modules[y]![x] = !matrix.modules[y]![x];
      }
    }
  }
}

function pickMask(matrix: MutableMatrix, level: QrErrorCorrectionLevel): number {
  let bestMask = 0;
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (let mask = 0; mask < 8; mask += 1) {
    applyMask(matrix, mask);
    drawFormatBits(matrix, level, mask);
    const penalty = maskPenalty(matrix);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
    applyMask(matrix, mask);
  }

  return bestMask;
}

/** The four penalty rules from ISO/IEC 18004 §8.8.2. */
function maskPenalty(matrix: MutableMatrix): number {
  const { size, modules } = matrix;
  let penalty = 0;

  for (let y = 0; y < size; y += 1) {
    penalty += runPenalty(modules[y]!);
  }
  for (let x = 0; x < size; x += 1) {
    const column: boolean[] = [];
    for (let y = 0; y < size; y += 1) column.push(modules[y]![x]!);
    penalty += runPenalty(column);
  }

  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const value = modules[y]![x];
      if (
        value === modules[y]![x + 1] &&
        value === modules[y + 1]![x] &&
        value === modules[y + 1]![x + 1]
      ) {
        penalty += 3;
      }
    }
  }

  let darkCount = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (modules[y]![x]) darkCount += 1;
    }
  }
  const total = size * size;
  const deviation = Math.abs(darkCount * 20 - total * 10);
  penalty += Math.floor(deviation / total) * 10;

  return penalty;
}

/** Rules 1 and 3: long same-colour runs, plus the finder-lookalike sequence. */
function runPenalty(line: readonly boolean[]): number {
  let penalty = 0;
  let runLength = 1;

  for (let i = 1; i < line.length; i += 1) {
    if (line[i] === line[i - 1]) {
      runLength += 1;
      if (runLength === 5) penalty += 3;
      else if (runLength > 5) penalty += 1;
    } else {
      runLength = 1;
    }
  }

  const pattern = [true, false, true, true, true, false, true];
  for (let i = 0; i + 7 <= line.length; i += 1) {
    if (!pattern.every((value, offset) => line[i + offset] === value)) continue;
    const leadingLight = i >= 4 && line.slice(i - 4, i).every((value) => !value);
    const trailingLight =
      i + 11 <= line.length && line.slice(i + 7, i + 11).every((value) => !value);
    if (leadingLight || trailingLight) penalty += 40;
  }
  return penalty;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const QR_ERROR_CORRECTION_LEVELS = ECC_LEVEL_ORDER;
