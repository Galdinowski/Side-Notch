/**
 * Derives the crawl pose from the source art.
 *
 * frames/09.png carries a baked contact shadow drawn for a light background. The
 * pet floats over the desktop, so on a dark wallpaper that shadow reads as a pale
 * smear, and because the crawl slices the sprite into columns the shadow ends up
 * undulating along with the body, which no contact shadow ever does.
 *
 * The shadow is a near-opaque neutral grey; the body is olive (blue channel well
 * below the others) and the belly is warm cream. That gap is wide enough to lift
 * the shadow out by flood filling from the bottom edge, which — unlike a global
 * colour threshold — cannot touch grey pixels elsewhere in the drawing because
 * the dark outline blocks the fill.
 *
 * The same fill works for the coiled pose's contact shadow (12.png).
 *
 * Run with: node scripts/derive-crawl-pose.mjs
 *           node scripts/derive-crawl-pose.mjs public/pet/frames/12.png public/pet/frames/12-coil.png
 */
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

const SOURCE = process.argv[2] ?? "public/pet/frames/09.png";
const TARGET = process.argv[3] ?? "public/pet/frames/09-crawl.png";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function decode(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error(`${SOURCE} is not a PNG`);
  let header = null;
  const idat = [];
  for (let off = 8; off < buf.length; ) {
    const length = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + length);
    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === "IDAT") {
      idat.push(data);
    }
    off += 12 + length;
  }
  if (!header) throw new Error("missing IHDR");
  if (header.depth !== 8 || header.interlace !== 0) {
    throw new Error(`unsupported PNG: depth ${header.depth}, interlace ${header.interlace}`);
  }
  const channels = header.colorType === 6 ? 4 : header.colorType === 2 ? 3 : 0;
  if (!channels) throw new Error(`unsupported colour type ${header.colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = header.width * channels;
  const flat = Buffer.alloc(header.height * stride);
  for (let y = 0, pos = 0; y < header.height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const row = flat.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? flat.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) {
        throw new Error(`unknown filter ${filter} on row ${y}`);
      }
      row[i] = value & 0xff;
    }
  }

  // Normalise to RGBA so the caller only deals with one layout.
  if (channels === 4) return { ...header, pixels: flat };
  const pixels = Buffer.alloc(header.width * header.height * 4, 255);
  for (let i = 0, o = 0; i < flat.length; i += 3, o += 4) {
    pixels[o] = flat[i];
    pixels[o + 1] = flat[i + 1];
    pixels[o + 2] = flat[i + 2];
  }
  return { ...header, pixels };
}

function encode(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    // Up filter: neighbouring rows of flat cel art differ very little.
    raw[y * (stride + 1)] = 2;
    for (let i = 0; i < stride; i++) {
      const above = y > 0 ? pixels[(y - 1) * stride + i] : 0;
      raw[y * (stride + 1) + 1 + i] = (pixels[y * stride + i] - above) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Neutral and light: the signature of the shadow, not of olive scales or cream belly. */
function greyness(pixels, index) {
  const r = pixels[index];
  const g = pixels[index + 1];
  const b = pixels[index + 2];
  const max = Math.max(r, g, b);
  return { spread: max - Math.min(r, g, b), max };
}

function stripShadow({ width, height, pixels }) {
  const cleared = new Uint8Array(width * height);
  // Topmost row the fill reached in each column, which is where the snake stops
  // and the shadow begins.
  const fillTop = new Int32Array(width).fill(height);
  const queue = [];

  // Seed only where the shadow is unambiguous, then let the fill find the rest.
  for (let y = Math.floor(height * 0.85); y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      if (pixels[i + 3] < 200 || cleared[p]) continue;
      const { spread, max } = greyness(pixels, i);
      if (spread > 18 || max < 140) continue;
      cleared[p] = 1;
      if (y < fillTop[x]) fillTop[x] = y;
      queue.push(p);
    }
  }
  if (queue.length === 0) throw new Error("no shadow seed found; thresholds need review");

  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    const x = p % width;
    const y = (p - x) / width;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const np = ny * width + nx;
      if (cleared[np]) continue;
      const ni = np * 4;
      if (pixels[ni + 3] === 0) continue;
      const { spread, max } = greyness(pixels, ni);
      if (spread > 34 || max < 110) continue;
      cleared[np] = 1;
      if (ny < fillTop[nx]) fillTop[nx] = ny;
      queue.push(np);
    }
  }

  // The shadow is drawn in the same cel style as the body, so it has its own
  // black outline. The fill cannot cross that stroke and leaves it behind as a
  // dashed line under the belly. Clearing each column outright from the top of
  // the fill downwards takes the stroke with it, and is safe because the shadow
  // lies entirely below the snake.
  let swept = 0;
  for (let x = 0; x < width; x++) {
    for (let y = fillTop[x]; y < height; y++) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] === 0) continue;
      pixels[i + 3] = 0;
      swept++;
    }
  }

  return { filled: queue.length, swept };
}

const image = decode(readFileSync(SOURCE));
const { filled, swept } = stripShadow(image);
const out = encode(image.width, image.height, image.pixels);
writeFileSync(TARGET, out);
console.log(
  `${SOURCE} ${image.width}x${image.height} -> ${TARGET}: ` +
    `filled ${filled} px, swept ${swept} px ` +
    `(${((swept / (image.width * image.height)) * 100).toFixed(1)}% of the sheet), ` +
    `${(out.length / 1024).toFixed(1)} kB`,
);
