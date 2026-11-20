// Builds portrait.svg: the GitHub avatar redrawn in ASCII, decoding top to bottom on load.
// Run once (and again if the avatar changes): node scripts/build-portrait.mjs [avatar.png]
// Without a path it downloads the current avatar. PNG only (8-bit RGB/RGBA).

import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const USER = 'anthonyamaro15';
const COLS = 110;
const CW = 6; // cell width, px (0.6em of a 10px monospace font)
const CH = 12; // cell height, px
const PAD = 16;
const RAMP = ' .:-=+*#%@';
const NOISE = '!#$%*+/=?@[]{}~^';

// ---------- png ----------

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG (save the avatar as .png and pass its path)');
  let pos = 8, w, h, channels;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      const [depth, color, , , interlace] = data.subarray(8);
      channels = { 2: 3, 6: 4 }[color];
      if (depth !== 8 || !channels || interlace) throw new Error('need an 8-bit, non-interlaced RGB or RGBA PNG');
    }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[y * stride + i - channels] : 0;
      const b = y ? out[(y - 1) * stride + i] : 0;
      const c = y && i >= channels ? out[(y - 1) * stride + i - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      if (pred === undefined) throw new Error(`bad PNG filter ${f}`);
      out[y * stride + i] = (line[i] + pred) & 255;
    }
  }
  if (out.length !== w * h * channels) throw new Error('PNG decode size mismatch');
  return { w, h, channels, px: out };
}

// ---------- ascii ----------

const hash = (x, y) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

function edgeChar(gx, gy) {
  const a = ((Math.atan2(-gx, -gy) * 180) / Math.PI + 360) % 180;
  return a < 22.5 || a >= 157.5 ? '_' : a < 67.5 ? '/' : a < 112.5 ? '|' : '\\';
}

function toCells({ w, h, channels, px }) {
  const rows = Math.round((COLS * CW * h) / (w * CH));
  const lum = [], rgb = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < COLS; x++) {
      // box-average the source pixels under this cell
      const x0 = Math.floor((x * w) / COLS), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / COLS));
      const y0 = Math.floor((y * h) / rows), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / rows));
      let r = 0, g = 0, b = 0, n = 0;
      for (let j = y0; j < y1; j++) {
        for (let i = x0; i < x1; i++) {
          const k = (j * w + i) * channels;
          r += px[k]; g += px[k + 1]; b += px[k + 2]; n++;
        }
      }
      r /= n; g /= n; b /= n;
      lum.push((0.299 * r + 0.587 * g + 0.114 * b) / 255);
      rgb.push([r, g, b]);
    }
  }
  // "ink" = how far a cell is from the background, so hair darker than the backdrop still draws
  const border = lum.filter((_, i) => i % COLS === 0 || i % COLS === COLS - 1 || i < COLS).sort((a, b) => a - b);
  const bg = border[border.length >> 1];
  const ink = lum.map((l) => (l < bg ? (bg - l) * 4 : l - bg)); // darker-than-backdrop is subtle, so weight it up
  const scale = [...ink].sort((a, b) => a - b)[Math.floor(ink.length * 0.99)];
  const at = (x, y) => lum[Math.min(rows - 1, Math.max(0, y)) * COLS + Math.min(COLS - 1, Math.max(0, x))] / scale;

  const cells = [];
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      const k = Math.min(1, ink[i] / scale);
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      const edge = Math.hypot(gx, gy) > 0.9;
      let ch = edge ? edgeChar(gx, gy) : RAMP[Math.min(RAMP.length - 1, Math.floor(Math.sqrt(k) * RAMP.length * 0.75))];
      if (k < 0.03 && !edge) ch = ' ';
      // lift dark cells toward a cool grey so hair reads on the dark card; snap to #rgb to keep the file small
      const dark = Math.max(0, (0.3 - lum[i]) / 0.3) * 0.55;
      const hex = rgb[i]
        .map((v, c) => 255 * (v / 255) ** 0.6 * (1 - dark) + [138, 150, 166][c] * dark)
        .map((v) => Math.round(v / 17).toString(16))
        .join('');
      row.push({ ch, color: `#${hex}` });
    }
    cells.push(row);
  }
  return cells;
}

// ---------- svg ----------

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function build(cells) {
  const rows = cells.length;
  const W = COLS * CW + PAD * 2;
  const H = rows * CH + PAD * 2;
  const lines = cells.map((row, y) => {
    const ty = PAD + (y + 1) * CH - 3;
    const reveal = (0.2 + (y / rows) * 1.4).toFixed(2); // top-to-bottom scan, ~1.6s total

    // final row: one tspan per run of the same color
    let spans = '', run = '', color = null;
    const flush = () => { if (run) spans += color ? `<tspan fill="${color}">${esc(run)}</tspan>` : run; run = ''; };
    for (const { ch, color: c } of row) {
      const want = ch === ' ' ? color : c; // spaces join whatever run they're in
      if (want !== color) { flush(); color = want; }
      run += ch;
    }
    flush();

    const noise = row.map(({ ch }, x) => (ch === ' ' ? ' ' : NOISE[Math.floor(hash(x, y) * NOISE.length)])).join('');
    const attrs = `x="${PAD}" y="${ty}" textLength="${COLS * CW}" lengthAdjust="spacing" xml:space="preserve"`;
    // the final row is visible by default, so renderers without SMIL still show the portrait
    return [
      `<text ${attrs} class="n" opacity="0"><set attributeName="opacity" to="1" begin="${(reveal - 0.35).toFixed(2)}s" end="${reveal}s"/>${esc(noise)}</text>`,
      `<text ${attrs}><set attributeName="opacity" to="0" begin="0s" end="${reveal}s"/>${spans}</text>`,
    ].join('\n  ');
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="ASCII art portrait of Anthony Amaro, drawn from his GitHub avatar">
  <style>
    text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: 10px; }
    .n { fill: #3d6b8f; }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="#07090c" stroke="#1f242c"/>
  ${lines.join('\n  ')}
</svg>
`;
}

const src = process.argv[2]
  ? readFileSync(process.argv[2])
  : Buffer.from(await (await fetch(`https://github.com/${USER}.png?size=460`)).arrayBuffer());
const cells = toCells(decodePng(src));
const svg = build(cells);
writeFileSync(new URL('../portrait.svg', import.meta.url), svg);
console.log(`portrait.svg written: ${COLS}x${cells.length} chars, ${(svg.length / 1024).toFixed(1)} KB`);
