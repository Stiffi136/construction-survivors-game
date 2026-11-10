// Extracts the construction-site sprite sheet into public/sprites/atlas.{png,json}
// usage: node tools/extract-atlas.mjs [source.png]
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] || '/data/uploads/29328/mwb2jlo6-5eddeb12-Construction Site Survivor Sprite Sheet.png';
const T = 40, PAD = 2, MAXW = 2048;

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;

// ---- connected components (8-neighbour, alpha > T)
const lab = new Int32Array(W * H);
const comps = [];
for (let i = 0; i < W * H; i++) {
  if (data[i * 4 + 3] <= T || lab[i]) continue;
  const id = comps.length + 1; const st = [i]; lab[i] = id;
  const b = { x0: W, y0: H, x1: 0, y1: 0, n: 0 };
  while (st.length) {
    const p = st.pop(), x = p % W, y = (p / W) | 0;
    b.n++; b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const q = yy * W + xx; if (!lab[q] && data[q * 4 + 3] > T) { lab[q] = id; st.push(q); }
    }
  }
  comps.push(b);
}
for (const c of comps) { c.cx = (c.x0 + c.x1) / 2; c.cy = (c.y0 + c.y1) / 2; }

// ---- helpers
const sprites = []; // {name,x,y,w,h,buf,ax,ay}
const frames = {}; const animations = {};
function bboxOf(list, pad) {
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (const c of list) { x0 = Math.min(x0, c.x0); y0 = Math.min(y0, c.y0); x1 = Math.max(x1, c.x1); y1 = Math.max(y1, c.y1); }
  return { x0: Math.max(0, x0 - pad), y0: Math.max(0, y0 - pad), x1: Math.min(W - 1, x1 + pad), y1: Math.min(H - 1, y1 + pad) };
}
// feet anchor: mean x of opaque pixels in the bottom rows of the sprite
function feetX(b) {
  let sum = 0, n = 0;
  for (let y = Math.max(b.y0, b.y1 - 12); y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++)
    if (data[(y * W + x) * 4 + 3] > T) { sum += x; n++; }
  return n ? Math.round(sum / n) - b.x0 : Math.round((b.x1 - b.x0) / 2);
}
function add(name, b, anchor, keep) {
  const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) data.copy(buf, y * w * 4, ((b.y0 + y) * W + b.x0) * 4, ((b.y0 + y) * W + b.x0 + w) * 4);
  if (keep) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = b.x0 + x, py = b.y0 + y;
    if (!keep(px, py)) buf[(y * w + x) * 4 + 3] = 0;
  }
  let ax = Math.round(w / 2), ay = Math.round(h / 2);
  if (anchor === 'feet') { ax = feetX(b); ay = h; }
  sprites.push({ name, w, h, buf, ax, ay });
}
const inBand = (c, y0, y1) => c.cy >= y0 && c.cy < y1;
function anim(name, names) { animations[name] = names; }
function sequence(prefix, boxes, anchor) {
  const names = boxes.map((b, i) => { const n = `${prefix}_${i}`; add(n, b, anchor, b.keep); return n; });
  anim(prefix, names); return names;
}
// frames from explicit x ranges (components assigned by centre x) within a y band
function rangeBoxes(y0, y1, ranges, pad = 1) {
  return ranges.map(([a, b]) => {
    const l = comps.filter(c => inBand(c, y0, y1) && c.cx >= a && c.cx <= b && c.n >= 1);
    if (!l.length) throw new Error(`no comps in ${y0}-${y1} ${a}-${b}`);
    return bboxOf(l, pad);
  });
}
// auto clusters by x-gap in band
function clusters(y0, y1, gap, expect, label) {
  const cs = comps.filter(c => inBand(c, y0, y1)).sort((a, b) => a.x0 - b.x0);
  const cl = [];
  for (const c of cs) { const l = cl[cl.length - 1]; if (l && c.x0 - l.x1 <= gap) { l.list.push(c); l.x1 = Math.max(l.x1, c.x1); } else cl.push({ x1: c.x1, list: [c] }); }
  if (cl.length !== expect) throw new Error(`${label}: got ${cl.length} clusters, expected ${expect}`);
  return cl.map(c => bboxOf(c.list, 1));
}

// ---- players: pixel-cut cells (walk x4, attack x3), anchor = feet
const players = [
  ['driller', 10, 120, [98, 192, 288, 400, 527, 665]],
  ['wrench', 120, 235, [98, 196, 290, 400, 522, 650]],
  ['hammer', 235, 350, [100, 197, 292, 400, 531, 686]],
  ['engineer', 350, 465, [100, 198, 296, 400, 515, 630]],
];
function refine(c, y0, y1) {
  let best = c, bn = 1e9;
  for (let x = c - 12; x <= c + 12; x++) { let n = 0; for (let y = y0; y < y1; y++) if (data[(y * W + x) * 4 + 3] > T) n++; if (n < bn) { bn = n; best = x; } }
  return best;
}
for (const [nm, y0, y1, cuts0] of players) {
  const cuts = cuts0.map(c => refine(c, y0, y1));
  
  // walk cells: [0,c0] [c0,c1] [c1,c2] [c2,c3]; attack cells: [c3,c4] [c4,c5] [c5,800]
  const cells = [[0, cuts[0]], [cuts[0], cuts[1]], [cuts[1], cuts[2]], [cuts[2], cuts[3]], [cuts[3], cuts[4]], [cuts[4], cuts[5]], [cuts[5], 830]];
  const boxes = cells.map(([a, b]) => {
    // keep pixels inside the cell whose component centre is in the cell (drops slivers of
    // neighbours); big components that span a cut (touching frames) are cut by pixel column
    const keep = (x, y) => {
      if (x < a || x >= b || y < y0 || y >= y1) return false;
      const ok = (xx, yy) => { const l = lab[yy * W + xx]; if (!l) return false; const c = comps[l - 1]; return (c.cx >= a && c.cx < b) || c.n > 3000; };
      if (lab[y * W + x]) return ok(x, y);
      // faint anti-alias pixel: keep only next to a kept pixel (within 2px)
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy; if (xx >= a && xx < b && yy >= 0 && yy < H && ok(xx, yy)) return true;
      }
      return false;
    };
    let x0 = W, y0b = H, x1 = 0, y1b = 0;
    for (let y = y0; y < y1; y++) for (let x = a; x < b; x++) if (data[(y * W + x) * 4 + 3] > T && keep(x, y)) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0b = Math.min(y0b, y); y1b = Math.max(y1b, y);
    }
    return { x0, x1, y0: y0b, y1: y1b, keep };
  });
  sequence(`p_${nm}_walk`, boxes.slice(0, 4), 'feet');
  sequence(`p_${nm}_attack`, boxes.slice(4), 'feet');
}

// ---- enemies: 2 rows x 4 in the top right
const eNames = [['e_zombie', 'e_zombie2', 'e_brute', 'e_mixer'], ['e_cone', 'e_barrel', 'e_barrier', 'e_claw']];
[[0, 185], [185, 365]].forEach(([y0, y1], r) => {
  const cs = comps.filter(c => c.cx > 840 && inBand(c, y0, y1) && c.n > 500).sort((a, b) => a.x0 - b.x0);
  if (cs.length !== 4) throw new Error('enemy row ' + r + ' has ' + cs.length);
  cs.forEach((c, i) => { const n = eNames[r][i]; add(n, bboxOf([c], 2), 'feet'); anim(n, [n]); });
});

// ---- weapons (row 5)
const wNames = 'drill nailgun saw hammer jackhammer chainsaw wrench pipewrench caulkgun turret drone mixer barrier'.split(' ').map(s => 'w_' + s);
clusters(465, 570, 4, 13, 'weapons').forEach((b, i) => { add(wNames[i], b); anim(wNames[i], [wNames[i]]); });

// ---- projectiles (row 6): proj_0.. + aliases
const pb = clusters(570, 632, 1, 19, 'projectiles');
pb.forEach((b, i) => { add(`proj_${i}`, b); anim(`proj_${i}`, [`proj_${i}`]); });
const P = (...i) => i.map(k => `proj_${k}`);
const palias = {
  proj_bullet: P(0, 1), proj_nail: P(2, 3), proj_drillbit: P(4), proj_hammer: P(5), proj_spikes: P(6),
  proj_saw_slash: P(7), proj_wrench_slash: P(8), proj_laser: P(9), proj_pellet: P(10), proj_shot: P(11),
  proj_beam: P(12), proj_ember: P(13), proj_arrow: P(14), proj_rock: P(15, 17), proj_spark: P(16, 18),
};
Object.assign(animations, palias);

// ---- pickups / passives (row 7)
const iNames = 'helmet vest boots gloves clipboard blueprint gear bolt steelbar ibeam brick cementbag toolbox coffee energy beacon hook cone grate'.split(' ').map(s => 'i_' + s);
clusters(640, 730, 4, 19, 'items').forEach((b, i) => { add(iNames[i], b); anim(iNames[i], [iNames[i]]); });

// ---- effects (rows 8-10), x ranges per frame
const fx = (name, y0, y1, ranges) => sequence(name, rangeBoxes(y0, y1, ranges));
fx('fx_explosion', 735, 825, [[14, 27], [37, 62], [79, 126], [138, 194], [206, 279], [291, 384]]);
fx('fx_slash', 735, 825, [[409, 451], [456, 505], [516, 560], [568, 631], [633, 703]]);
fx('fx_dust', 735, 825, [[721, 772], [782, 839], [848, 913], [918, 992], [1004, 1085]]);
fx('fx_smoke_small', 735, 825, [[1105, 1180], [1191, 1273], [1285, 1431], [1439, 1524]]);
fx('fx_spark', 830, 915, [[14, 111], [126, 187], [202, 259], [281, 335], [355, 398]]);
fx('fx_ring', 830, 915, [[423, 467], [483, 540], [550, 616], [622, 693]]);
fx('fx_rubble', 830, 915, [[713, 757], [759, 797], [799, 848], [851, 895], [902, 963], [968, 1032], [1034, 1084]]);
fx('fx_smoke_big', 830, 915, [[1102, 1181], [1186, 1265], [1274, 1344], [1352, 1526]]);
fx('fx_heal', 915, 1000, [[15, 23], [33, 55], [68, 89], [103, 135], [158, 193], [218, 264], [288, 362]]);
fx('fx_shield', 915, 1000, [[411, 466], [476, 538], [549, 619], [629, 714]]);
fx('fx_levelup', 915, 1000, [[758, 773], [777, 802], [811, 843], [857, 893], [905, 948], [957, 1004]]);
add('i_magnet', rangeBoxes(915, 1000, [[1033, 1108]])[0]); anim('i_magnet', ['i_magnet']);
fx('fx_spikes', 915, 1000, [[1154, 1188], [1204, 1242], [1258, 1298], [1316, 1360], [1376, 1431], [1443, 1518]]);

// ---- pack (shelf, sorted by height) into <=2048 wide, power-of-two sized
function pack(width) {
  const order = [...sprites].sort((a, b) => b.h - a.h || b.w - a.w);
  let x = PAD, y = PAD, rowH = 0;
  for (const s of order) {
    if (x + s.w + PAD > width) { x = PAD; y += rowH + PAD; rowH = 0; }
    s.x = x; s.y = y; x += s.w + PAD; rowH = Math.max(rowH, s.h);
  }
  return y + rowH + PAD;
}
const pot = n => { let p = 1; while (p < n) p <<= 1; return p; };
let best = null;
for (const w of [1024, 2048]) { const h = pack(w); const H2 = pot(h); if (H2 <= MAXW && (!best || w * H2 < best.w * best.h)) best = { w, h: H2, used: h }; }
if (!best) throw new Error('does not fit 2048');
pack(best.w);
const aw = best.w, ah = best.h;
const out = Buffer.alloc(aw * ah * 4);
for (const s of sprites) {
  for (let y = 0; y < s.h; y++) s.buf.copy(out, ((s.y + y) * aw + s.x) * 4, y * s.w * 4, (y + 1) * s.w * 4);
  frames[s.name] = { x: s.x, y: s.y, w: s.w, h: s.h, ax: s.ax, ay: s.ay };
}
fs.mkdirSync(path.join(ROOT, 'public/sprites'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'preview'), { recursive: true });
await sharp(out, { raw: { width: aw, height: ah, channels: 4 } }).png().toFile(path.join(ROOT, 'public/sprites/atlas.png'));
fs.writeFileSync(path.join(ROOT, 'public/sprites/atlas.json'), JSON.stringify({ meta: { image: 'atlas.png', w: aw, h: ah }, frames, animations }, null, 1));

// ---- labeled preview
const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${aw}" height="${ah}">`];
for (const [n, f] of Object.entries(frames)) {
  svg.push(`<rect x="${f.x - .5}" y="${f.y - .5}" width="${f.w + 1}" height="${f.h + 1}" fill="none" stroke="#f0f" stroke-width="1"/>`);
  svg.push(`<circle cx="${f.x + f.ax}" cy="${f.y + f.ay}" r="2" fill="#0f0"/>`);
}
svg.push('</svg>');
const bg = await sharp({ create: { width: aw, height: ah, channels: 4, background: '#556' } }).composite([
  { input: path.join(ROOT, 'public/sprites/atlas.png') }, { input: Buffer.from(svg.join('')) }]).png().toFile(path.join(ROOT, 'preview/atlas-labeled.png'));
console.log(`atlas ${aw}x${ah} (used h ${best.used}), ${sprites.length} frames, ${Object.keys(animations).length} animations`);
