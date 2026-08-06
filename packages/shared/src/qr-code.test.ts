import assert from 'node:assert/strict';
import test from 'node:test';
import {
  alignmentPatternPositions,
  buildPaymentQrSvg,
  dataCodewordCount,
  dataModuleOrder,
  eccBlockStructure,
  encodeQrMatrix,
  formatInformationBits,
  gf256Multiply,
  QR_ERROR_CORRECTION_LEVELS,
  QR_MIN_PRINT_SIZE_MM,
  QrCodeError,
  type QrErrorCorrectionLevel,
  type QrMatrix,
  rawDataModuleCount,
  reedSolomonGenerator,
  reedSolomonRemainder,
  renderQrSvg,
  versionInformationBits,
} from './qr-code.js';

/**
 * Reads a symbol back to its payload using only the published layout rules, so
 * a placement, masking or interleaving regression cannot pass unnoticed.
 */
function decodeQrPayload(matrix: QrMatrix): string {
  const order = dataModuleOrder(matrix.version);
  const structure = eccBlockStructure(matrix.version, matrix.errorCorrectionLevel);

  const bits: number[] = [];
  for (const { x, y } of order) {
    const module = matrix.modules[y]![x]!;
    bits.push(module === maskPredicate(matrix.mask, x, y) ? 0 : 1);
  }

  const codewords: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b += 1) byte = (byte << 1) | bits[i + b]!;
    codewords.push(byte);
  }
  assert.equal(codewords.length, structure.totalCodewords, 'codeword count');

  // Undo the block interleave to recover the data codewords in order.
  const blockLengths = Array.from({ length: structure.blockCount }, (_, i) =>
    i < structure.shortBlockCount ? structure.shortDataLength : structure.shortDataLength + 1,
  );
  const blocks: number[][] = blockLengths.map(() => []);
  let cursor = 0;
  for (let i = 0; i < structure.shortDataLength + 1; i += 1) {
    blockLengths.forEach((length, blockIndex) => {
      if (i < length) blocks[blockIndex]!.push(codewords[cursor++]!);
    });
  }
  const dataCodewords = blocks.flat();

  const dataBits = dataCodewords.map((c) => c.toString(2).padStart(8, '0')).join('');
  assert.equal(parseInt(dataBits.slice(0, 4), 2), 0b0100, 'byte mode indicator');

  const countBits = matrix.version <= 9 ? 8 : 16;
  const length = parseInt(dataBits.slice(4, 4 + countBits), 2);
  const start = 4 + countBits;

  const bytes: number[] = [];
  for (let i = 0; i < length; i += 1) {
    bytes.push(parseInt(dataBits.slice(start + i * 8, start + (i + 1) * 8), 2));
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

function maskPredicate(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: throw new Error(`bad mask ${mask}`);
  }
}

test('GF(256) multiplication matches the QR primitive polynomial', () => {
  assert.equal(gf256Multiply(0, 5), 0);
  assert.equal(gf256Multiply(1, 5), 5);
  // x^8 reduces to x^4 + x^3 + x^2 + 1 under 0x11D.
  assert.equal(gf256Multiply(2, 0x80), 0x1d);

  // Cross-check against an independently built exponent/logarithm table.
  const exp = new Array<number>(255);
  const log = new Array<number>(256).fill(0);
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    exp[i] = value;
    log[value] = i;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }

  for (let a = 1; a < 256; a += 7) {
    for (let b = 1; b < 256; b += 5) {
      const expected = exp[(log[a]! + log[b]!) % 255]!;
      assert.equal(gf256Multiply(a, b), expected, `${a} * ${b}`);
      assert.equal(gf256Multiply(b, a), expected, 'multiplication is commutative');
    }
  }
});

test('Reed-Solomon matches the published ISO/IEC 18004 version 1-M vector', () => {
  // Annex I worked example: numeric "01234567" at error-correction level M.
  const dataCodewords = [
    0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11,
  ];
  assert.deepEqual(
    reedSolomonRemainder(dataCodewords, 10),
    [0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55],
  );
});

test('format information matches the published BCH values', () => {
  // Table C.1, ISO/IEC 18004.
  assert.equal(formatInformationBits('L', 0), 0x77c4);
  assert.equal(formatInformationBits('M', 0), 0x5412);
  assert.equal(formatInformationBits('Q', 4), 0x24b4);
  assert.equal(formatInformationBits('H', 7), 0x083b);
});

test('version information matches the published BCH values', () => {
  // Table D.1, ISO/IEC 18004.
  assert.equal(versionInformationBits(7), 0x07c94);
  assert.equal(versionInformationBits(40), 0x28c69);

  // The top six bits always carry the version itself.
  for (let version = 7; version <= 40; version += 1) {
    assert.equal(versionInformationBits(version) >>> 12, version);
  }
});

test('alignment pattern positions match the standard table', () => {
  assert.deepEqual(alignmentPatternPositions(1), []);
  assert.deepEqual(alignmentPatternPositions(2), [6, 18]);
  assert.deepEqual(alignmentPatternPositions(7), [6, 22, 38]);
  assert.deepEqual(alignmentPatternPositions(25), [6, 32, 58, 84, 110]);
  assert.deepEqual(alignmentPatternPositions(32), [6, 34, 60, 86, 112, 138]);
});

test('codeword capacity matches the standard table', () => {
  assert.equal(rawDataModuleCount(1) / 8, 26);
  assert.equal(dataCodewordCount(1, 'L'), 19);
  assert.equal(dataCodewordCount(1, 'H'), 9);
  assert.equal(dataCodewordCount(40, 'L'), 2956);
  assert.equal(dataCodewordCount(40, 'H'), 1276);
});

test('encoded symbol has the structural invariants a scanner looks for', () => {
  const matrix = encodeQrMatrix('https://pay.yoco.com/r/abc123', { errorCorrectionLevel: 'H' });

  assert.equal(matrix.size, matrix.version * 4 + 17);
  assert.equal(matrix.errorCorrectionLevel, 'H');
  assert.ok(matrix.mask >= 0 && matrix.mask <= 7);

  const dark = (x: number, y: number) => matrix.modules[y]![x];

  // Three finder patterns: dark 3x3 core, light ring, dark outer ring.
  for (const [cx, cy] of [
    [3, 3],
    [matrix.size - 4, 3],
    [3, matrix.size - 4],
  ] as const) {
    assert.equal(dark(cx, cy), true, 'finder centre is dark');
    assert.equal(dark(cx + 1, cy), true, 'finder 3x3 core is dark');
    assert.equal(dark(cx + 2, cy), false, 'finder inner ring is light');
    assert.equal(dark(cx + 3, cy), true, 'finder outer ring is dark');
  }

  // Timing patterns alternate along row and column 6.
  for (let i = 8; i < matrix.size - 8; i += 1) {
    assert.equal(dark(i, 6), i % 2 === 0, `horizontal timing module ${i}`);
    assert.equal(dark(6, i), i % 2 === 0, `vertical timing module ${i}`);
  }

  // The always-dark module beside the lower-left finder.
  assert.equal(dark(8, matrix.size - 8), true);
});

test('encoding is deterministic and payload-sensitive', () => {
  const first = encodeQrMatrix('https://pay.yoco.com/r/one');
  const second = encodeQrMatrix('https://pay.yoco.com/r/one');
  const different = encodeQrMatrix('https://pay.yoco.com/r/two');

  assert.deepEqual(first.modules, second.modules);
  assert.notDeepEqual(first.modules, different.modules);
});

test('symbol version grows with payload length', () => {
  const short = encodeQrMatrix('https://pay.yoco.com/r/a');
  const long = encodeQrMatrix(`https://pay.yoco.com/r/${'a'.repeat(400)}`);
  assert.ok(long.version > short.version);
});

test('SVG output is vector, quiet-zoned and at least 30mm for print', () => {
  const matrix = encodeQrMatrix('https://pay.yoco.com/r/abc123');
  const svg = renderQrSvg(matrix, { title: 'Scan to pay' });

  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /width="30mm" height="30mm"/);
  assert.match(svg, /<path fill="#000000" d="M/);
  assert.ok(!svg.includes('<image'), 'must not rasterise the symbol');

  const quietZone = 4;
  assert.ok(
    svg.includes(`viewBox="0 0 ${matrix.size + quietZone * 2} ${matrix.size + quietZone * 2}"`),
    'quiet zone of at least four modules is included',
  );
});

test('quiet zone and print size cannot be reduced below the readable floor', () => {
  const matrix = encodeQrMatrix('https://pay.yoco.com/r/abc123');
  const svg = renderQrSvg(matrix, { quietZoneModules: 0, sizeMm: 5 });

  assert.ok(svg.includes(`viewBox="0 0 ${matrix.size + 8} ${matrix.size + 8}"`));
  assert.ok(svg.includes(`width="${QR_MIN_PRINT_SIZE_MM}mm"`));
});

test('payment QR refuses anything that is not a real https URL', () => {
  assert.throws(() => buildPaymentQrSvg('not-a-url'), QrCodeError);
  assert.throws(() => buildPaymentQrSvg('http://pay.yoco.com/r/abc'), QrCodeError);
  assert.throws(() => buildPaymentQrSvg(''), QrCodeError);
});

test('payment QR encodes exactly the supplied URL', () => {
  const url = 'https://pay.yoco.com/r/abc123';
  const svg = buildPaymentQrSvg(url);
  const expected = renderQrSvg(encodeQrMatrix(url, { errorCorrectionLevel: 'H' }), {
    title: 'Scan to pay',
  });

  assert.equal(svg, expected);
});

test('empty payloads are rejected rather than rendered blank', () => {
  assert.throws(() => encodeQrMatrix(''), QrCodeError);
});

test('every symbol decodes back to the exact payload, at every level and mask', () => {
  const payloads = [
    'https://pay.yoco.com/r/abc123',
    'https://pay.yoco.com/r/4Xy9zQ',
    'https://pay.yoco.com/pay/ch_9f2Ab?ref=INV-2025-0421',
    // Long enough to force version >= 7, which exercises version-information bits.
    `https://pay.yoco.com/r/${'z'.repeat(320)}`,
  ];

  let decoded = 0;
  for (const payload of payloads) {
    for (const level of QR_ERROR_CORRECTION_LEVELS) {
      for (let mask = 0; mask < 8; mask += 1) {
        const matrix = encodeQrMatrix(payload, { errorCorrectionLevel: level, mask });
        assert.equal(decodeQrPayload(matrix), payload, `${level} mask ${mask}`);
        decoded += 1;
      }
    }
  }
  assert.equal(decoded, payloads.length * 4 * 8);

  const longSymbol = encodeQrMatrix(payloads[3]!, { errorCorrectionLevel: 'H' });
  assert.ok(longSymbol.version >= 7, 'long payload exercises version information bits');
});

test('non-ASCII payloads round trip as UTF-8', () => {
  const payload = 'Young Guns Plumbing — geyser № 1 · R12 937,50';
  assert.equal(decodeQrPayload(encodeQrMatrix(payload)), payload);
});

test('data module count matches the spec formula for every version', () => {
  for (let version = 1; version <= 40; version += 1) {
    assert.equal(
      dataModuleOrder(version).length,
      rawDataModuleCount(version),
      `version ${version}`,
    );
  }
});

test('data and error-correction codewords together are divisible by the generator', () => {
  // The defining Reed-Solomon property: appending the remainder makes it vanish.
  const levels: QrErrorCorrectionLevel[] = ['L', 'H'];
  for (const level of levels) {
    for (const version of [1, 5, 14, 40]) {
      const { eccPerBlock, shortDataLength } = eccBlockStructure(version, level);
      const data = Array.from({ length: shortDataLength }, (_, i) => (i * 31 + 7) & 0xff);
      const ecc = reedSolomonRemainder(data, eccPerBlock);
      assert.deepEqual(
        reedSolomonRemainder([...data, ...ecc], eccPerBlock),
        new Array<number>(eccPerBlock).fill(0),
        `version ${version} level ${level}`,
      );
    }
  }
});

test('generator polynomial has the expected degree', () => {
  assert.deepEqual(reedSolomonGenerator(1), [1]);
  assert.equal(reedSolomonGenerator(10).length, 10);
  assert.equal(reedSolomonGenerator(30).length, 30);
});

test('block structure matches the standard table for multi-block versions', () => {
  // Version 5-Q uses 2 blocks of 15 data + 2 blocks of 16 data, 18 ECC each.
  const v5q = eccBlockStructure(5, 'Q');
  assert.equal(v5q.blockCount, 4);
  assert.equal(v5q.eccPerBlock, 18);
  assert.equal(v5q.shortBlockCount, 2);
  assert.equal(v5q.shortDataLength, 15);
  assert.equal(dataCodewordCount(5, 'Q'), 62);
});
