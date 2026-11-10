// Cuts the terrain tile set (8x6 grid, dark separator lines) into 128x128 tiles,
// makes surface textures seamless and packs them with 2px extruded borders.
// usage: node tools/extract-terrain.mjs [source.png]
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] || '/data/uploads/29328/mwb3nozj-3cbb8da1-Construction Terrain Tile Set.png';
const N = 128, EXT = 2, INSET = 7, COLS = 8, ROWS = 6;

const img = sharp(SRC).removeAlpha();
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = 3;

// ---- find the dark separator lines (mean luminance of a column / row)
function lines(len, other, get, count) {
  const prof = [];
  for (let i = 0; i < len; i++) { let t = 0; for (let j = 0; j < other; j++) t += get(i, j); prof.push(t / other); }
  // separators sit near multiples of len/count: take the darkest run (threshold-free) within +-10px
  const seps = [];
  for (let k = 0; k <= count; k++) {
    const c = Math.round(k * len / count);
    let best = Math.min(len - 1, Math.max(0, c)), bv = 1e9;
    for (let i = Math.max(0, c - 12); i <= Math.min(len - 1, c + 12); i++) if (prof[i] < bv) { bv = prof[i]; best = i; }
    // extend to the whole dark run around the minimum
    let a = best, b = best; const sorted = [...prof].sort((p, q) => p - q), th = Math.max(bv + 12, sorted[sorted.length >> 1] * 0.55);
    while (a > 0 && prof[a - 1] < th) a--; while (b < len - 1 && prof[b + 1] < th) b++;
    seps.push([a, b]);
  }
  return seps;
}
const lum = (x, y) => (data[(y * W + x) * C] + data[(y * W + x) * C + 1] + data[(y * W + x) * C + 2]) / 3;
const colSeps = lines(W, H, (x, y) => lum(x, y), COLS);
const rowSeps = lines(H, W, (y, x) => lum(x, y), ROWS);

// ---- tile definitions: [name, category, seamless]
const defs = [
  ['g_asphalt', 'asphalt', 1], ['g_asphalt_cracked', 'asphalt', 1], ['g_asphalt_hazard', 'hazard', 0], ['g_asphalt_centerline', 'marking', 0],
  ['g_asphalt_puddle', 'asphalt', 0], ['g_asphalt_tracks', 'asphalt', 0], ['g_asphalt_manhole', 'symbol', 0], ['g_asphalt_rust', 'asphalt', 0],
  ['g_concrete', 'concrete', 1], ['g_concrete_cracked', 'concrete', 1], ['g_concrete_hazard', 'hazard', 0], ['g_concrete_slabs', 'concrete', 0],
  ['g_concrete_stained', 'concrete', 1], ['g_concrete_mossy', 'concrete', 1], ['g_concrete_puddles', 'concrete', 0], ['g_concrete_rubble', 'rubble', 0],
  ['g_dirt', 'dirt', 1], ['g_dirt_smooth', 'dirt', 1], ['g_dirt_stones', 'dirt', 1], ['g_dirt_tracks', 'dirt', 0],
  ['g_mud_puddle', 'mud', 0], ['g_mud_puddles', 'mud', 0], ['g_dirt_rocks', 'dirt', 1], ['g_dirt_tire', 'dirt', 0],
  ['g_sand', 'sand', 1], ['g_sand_pebbles', 'sand', 1], ['g_gravel_gray', 'gravel', 1], ['g_gravel_gold', 'gravel', 1],
  ['g_gravel_stones', 'gravel', 1], ['g_rubble_block', 'rubble', 0], ['g_rubble_brick', 'rubble', 0], ['g_rubble_debris', 'rubble', 0],
  ['g_cobble_gray', 'paving', 1], ['g_cobble_mossy', 'paving', 1], ['g_brick_red', 'paving', 1], ['g_paving_beige', 'paving', 0],
  ['g_grate_floor', 'grate', 0], ['g_grate_grass', 'grate', 1], ['g_diamond_plate', 'metal', 1], ['g_plate_hazard', 'hazard', 0],
  ['g_grate_dark', 'grate', 0], ['g_drain_grate', 'grate', 0], ['g_hazard_stripes', 'hazard', 0], ['g_corner_yellow', 'marking', 0],
  ['g_corner_white', 'marking', 0], ['g_arrow', 'symbol', 0], ['g_helmet', 'symbol', 0], ['g_tools_sign', 'symbol', 0],
];
if (defs.length !== COLS * ROWS) throw new Error('defs');
// allow overriding seamless flags after visual review
const NOT_SEAMLESS = new Set((process.env.NOT_SEAMLESS || '').split(',').filter(Boolean));

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// offset-wrap + blend: output = A*w + shifted(A)*(1-w), w = 0 on the tile border (where the wrap seam is)
function makeSeamless(px) {
  const out = Buffer.alloc(N * N * 3);
  const wt = i => smooth(0.12, 0.5, 1 - Math.abs(2 * i / (N - 1) - 1));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const w = wt(x) * wt(y);
    const a = (y * N + x) * 3, b = (((y + N / 2) % N) * N + ((x + N / 2) % N)) * 3;
    for (let c = 0; c < 3; c++) out[a + c] = Math.round(px[a + c] * w + px[b + c] * (1 - w));
  }
  return out;
}

const tiles = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const x0 = colSeps[c][1] + 1 + INSET, x1 = colSeps[c + 1][0] - INSET;
  const y0 = rowSeps[r][1] + 1 + INSET, y1 = rowSeps[r + 1][0] - INSET;
  const buf = await sharp(SRC).removeAlpha().extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 })
    .resize(N, N, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
  const [name, category, s] = defs[r * COLS + c];
  let seamless = !!s && !NOT_SEAMLESS.has(name);
  tiles.push({ name, category, seamless, buf: seamless ? makeSeamless(buf) : buf, src: [x0, y0, x1, y1] });
}

// ---- pack with 2px extruded border; 7 columns -> 1024x1024
const PITCH = N + 2 * EXT + 0, PC = 7;
const aw = 1024, ah = 1024;
const out = Buffer.alloc(aw * ah * 4);
const frames = {}, animations = {};
tiles.forEach((t, i) => {
  const cx = (i % PC) * PITCH, cy = Math.floor(i / PC) * PITCH; // cell origin (incl. extrude)
  const fx = cx + EXT, fy = cy + EXT;
  for (let y = -EXT; y < N + EXT; y++) for (let x = -EXT; x < N + EXT; x++) {
    const sx = Math.min(N - 1, Math.max(0, x)), sy = Math.min(N - 1, Math.max(0, y));
    const si = (sy * N + sx) * 3, di = ((fy + y) * aw + fx + x) * 4;
    out[di] = t.buf[si]; out[di + 1] = t.buf[si + 1]; out[di + 2] = t.buf[si + 2]; out[di + 3] = 255;
  }
  frames[t.name] = { x: fx, y: fy, w: N, h: N, ax: N / 2, ay: N / 2, seamless: t.seamless, category: t.category };
  animations[t.name] = [t.name];
});
fs.mkdirSync(path.join(ROOT, 'public/sprites'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'preview'), { recursive: true });
const png = path.join(ROOT, 'public/sprites/terrain.png');
await sharp(out, { raw: { width: aw, height: ah, channels: 4 } }).png().toFile(png);
fs.writeFileSync(path.join(ROOT, 'public/sprites/terrain.json'), JSON.stringify({ meta: { image: 'terrain.png', w: aw, h: ah, tile: N, extrude: EXT }, frames, animations }, null, 1));

// ---- labeled preview: all tiles, name + seamless flag
const L = 160, cols = 8;
{
  const comp = [], svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${cols * L}" height="${ROWS * L}" font-family="sans-serif" font-size="11">`];
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i], f = frames[t.name], x = (i % cols) * L, y = Math.floor(i / cols) * L;
    comp.push({ input: await sharp(png).extract({ left: f.x, top: f.y, width: N, height: N }).toBuffer(), left: x + 16, top: y + 14 });
    svg.push(`<rect x="${x + 15.5}" y="${y + 13.5}" width="${N + 1}" height="${N + 1}" fill="none" stroke="${t.seamless ? '#0f0' : '#f0f'}"/>`);
    svg.push(`<text x="${x + 16}" y="${y + L - 8}" fill="#fff">${t.name.slice(2)}${t.seamless ? ' ✓' : ''}</text>`);
  }
  svg.push('</svg>');
  await sharp({ create: { width: cols * L, height: ROWS * L, channels: 4, background: '#334' } }).composite([...comp, { input: Buffer.from(svg.join('')) }]).png().toFile(path.join(ROOT, 'preview/terrain-labeled.png'));
}
// ---- tiling preview: every seamless tile 3x3 (each cell shows 3x3 at 80px per tile)
{
  const sl = tiles.filter(t => t.seamless), P = 80, CELL = P * 3 + 10, pc = 6;
  const rows = Math.ceil(sl.length / pc), comp = [];
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${pc * CELL}" height="${rows * (CELL + 14)}" font-family="sans-serif" font-size="11">`];
  for (let i = 0; i < sl.length; i++) {
    const f = frames[sl[i].name], x = (i % pc) * CELL, y = Math.floor(i / pc) * (CELL + 14);
    const t = await sharp(png).extract({ left: f.x, top: f.y, width: N, height: N }).resize(P, P, { kernel: 'lanczos3' }).toBuffer();
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) comp.push({ input: t, left: x + 5 + a * P, top: y + 14 + b * P });
    svg.push(`<text x="${x + 5}" y="${y + 11}" fill="#fff">${sl[i].name}</text>`);
  }
  svg.push('</svg>');
  await sharp({ create: { width: pc * CELL, height: rows * (CELL + 14), channels: 4, background: '#223' } }).composite([...comp, { input: Buffer.from(svg.join('')) }]).png().toFile(path.join(ROOT, 'preview/terrain-tiling.png'));
}
console.log('seps cols', JSON.stringify(colSeps), 'rows', JSON.stringify(rowSeps));
console.log(`terrain ${aw}x${ah}, ${tiles.length} tiles, ${tiles.filter(t => t.seamless).length} seamless`);
