// Extracts the construction-site props sheet into public/sprites/props.{png,json}
// usage: node tools/extract-props.mjs [source.png]
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] || '/data/uploads/29328/mwb344zf-53035e44-Construction Site Pixel Art Asset Sheet.png';
const T = 40, PAD = 2, MAXW = 2048;
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;

const lab = new Int32Array(W * H); const comps = [];
for (let i = 0; i < W * H; i++) {
  if (data[i * 4 + 3] <= T || lab[i]) continue;
  const id = comps.length + 1, st = [i]; lab[i] = id;
  const b = { x0: W, y0: H, x1: 0, y1: 0, n: 0 };
  while (st.length) {
    const p = st.pop(), x = p % W, y = (p / W) | 0;
    b.n++; b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const q = yy * W + xx; if (!lab[q] && data[q * 4 + 3] > T) { lab[q] = id; st.push(q); }
    }
  }
  b.cx = (b.x0 + b.x1) / 2; b.cy = (b.y0 + b.y1) / 2; comps.push(b);
}

const sprites = []; const frames = {}; const animations = {};
function add(name, b, center = false, keep = null, ids = null) {
  if (frames[name] || sprites.find(s => s.name === name)) throw new Error('dup ' + name);
  const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1; const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) data.copy(buf, y * w * 4, ((b.y0 + y) * W + b.x0) * 4, ((b.y0 + y) * W + b.x0 + w) * 4);
  if (keep) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!keep(b.x0 + x)) buf[(y * w + x) * 4 + 3] = 0;
  // drop pixels that belong to other components (neighbours reaching into this bbox)
  if (ids) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = lab[(b.y0 + y) * W + b.x0 + x]; if (l && !ids.has(l)) buf[(y * w + x) * 4 + 3] = 0;
  }
  sprites.push({ name, w, h, buf, ax: Math.round(w / 2), ay: center ? Math.round(h / 2) : h });
  animations[name] = [name];
}
function bbox(list, pad = 1) {
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (const c of list) { x0 = Math.min(x0, c.x0); y0 = Math.min(y0, c.y0); x1 = Math.max(x1, c.x1); y1 = Math.max(y1, c.y1); }
  return { x0: Math.max(0, x0 - pad), y0: Math.max(0, y0 - pad), x1: Math.min(W - 1, x1 + pad), y1: Math.min(H - 1, y1 + pad) };
}
// x-gap clusters within a band (and optional x range); components with n < minN are ignored
function row(y0, y1, names, { gap = 2, xmin = 0, xmax = W, minN = 15, center = false } = {}) {
  const cs = comps.filter(c => c.cy >= y0 && c.cy < y1 && c.cx >= xmin && c.cx < xmax && c.n >= minN).sort((a, b) => a.x0 - b.x0);
  const cl = [];
  for (const c of cs) { const l = cl.at(-1); if (l && c.x0 - l.x1 <= gap) { l.x1 = Math.max(l.x1, c.x1); l.list.push(c); } else cl.push({ x1: c.x1, list: [c] }); }
  if (cl.length !== names.length) throw new Error(`row ${y0}-${y1}: ${cl.length} clusters, expected ${names.length}`);
  cl.forEach((c, i) => add(names[i], bbox(c.list), center, null, new Set(c.list.map(k => comps.indexOf(k) + 1))));
}

// 1 vehicles / big objects
row(0, 215, 'v_excavator v_mixer_truck v_dump_truck v_forklift o_generator o_scaffold o_toilet o_container o_floodlight o_crane'.split(' '));
// 2 barriers; the last two fences touch, so split them at the sparsest column
{
  row(215, 345, 'b_barricade b_jersey_red b_jersey_concrete b_cone_0 b_cone_1 b_drum b_barrier_yellow b_fence'.split(' '), { xmax: 895 });
  const both = comps.filter(c => c.cy >= 215 && c.cy < 380 && c.cx >= 895 && c.n >= 15);
  const bb = bbox(both);
  let cut = 0, bn = 1e9;
  for (let x = 1090; x <= 1130; x++) { let n = 0; for (let y = bb.y0; y <= bb.y1; y++) if (data[(y * W + x) * 4 + 3] > T) n++; if (n < bn) { bn = n; cut = x; } }
  add('b_fence_warning', { ...bb, x1: cut - 1 }); add('b_fence_sign', { ...bb, x0: cut });
}
// 3 signs
row(345, 470, 's_roadwork s_noentry s_detour s_warning s_post_0 s_trafficlight s_post_1 b_barrier_lights'.split(' '));
// 4 material
row(470, 580, 'm_gravel m_sand m_blocks m_pipes m_planks m_bricks m_cinder m_rebar m_pallet m_cable_spool m_crate m_barrel_blue m_barrel_red'.split(' '));
// 5 containers & tools
row(580, 710, 'm_crate_small m_box_green m_toolbox_red m_toolbox_open m_ammo_box m_medkit m_barrel_blue_small m_jerrycan m_paint_blue m_paint_orange m_cement_sacks m_ibc_tank m_wheelbarrow_red m_hand_truck m_saw_table m_wheelbarrow_blue'.split(' '));
// 6 barriers / misc
row(710, 820, 'b_fence_wire b_fence_wood b_jersey_graffiti b_jersey_broken b_jersey_hazard m_tires m_spool_small b_drum_1 m_sandbags b_hedgehog o_lamp_small o_lamp_double o_lamp_box'.split(' '), { gap: 6 });
// 7 ground tiles (anchor = centre)
row(820, 915, 't_dirt t_sand t_asphalt_line t_asphalt_dark t_grass t_mud_puddle t_rubble t_grass_rock'.split(' '), { xmax: 850, center: true, gap: 6 });
// tiles: the sheet's tiles have soft, ragged borders -> cut a centred 64x64 block and make it fully opaque
{
  const size = 64;
  for (const n of Object.keys(animations).filter(n => n.startsWith('t_'))) {
    const sp = sprites.find(q => q.name === n);
    const ox = Math.floor((sp.w - size) / 2), oy = Math.floor((sp.h - size) / 2 - 2);
    const nb = Buffer.alloc(size * size * 4); let weak = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const si = ((oy + y) * sp.w + ox + x) * 4, di = (y * size + x) * 4;
      if (sp.buf[si + 3] < 250) weak++;
      sp.buf.copy(nb, di, si, si + 3); nb[di + 3] = 255;
    }
    if (weak > size * size * 0.02) console.warn('tile', n, 'weak px', weak);
    sp.buf = nb; sp.w = size; sp.h = size; sp.ax = size / 2; sp.ay = size / 2;
  }
}
// 8 wall pieces, posts, rocks
row(915, 1024, 'd_wall_corner_stone d_wall_slab d_wall_corner_wood d_wall_corner_stone2 d_bollard_white d_post_wood d_post_steel d_post_thin d_pipe_elbow d_post_mossy d_rock_big'.split(' '), { xmax: 880, gap: 6 });
// deco right side: individual components, left to right
const deco = 'd_grass_tuft d_pebbles d_pebble_small d_clover d_rocks_dark d_plank d_flower d_sprout d_stone_block d_brick_red d_can_red d_bush d_tin_can d_ladder d_pole_lamp d_sign_caution'.split(' ');
{
  const cs = comps.filter(c => c.x0 > 850 && c.y0 > 800 && c.n >= 100).sort((a, b) => a.x0 - b.x0);
  if (cs.length !== deco.length) throw new Error('deco ' + cs.length);
  cs.forEach((c, i) => add(deco[i], bbox([c]), false, null, new Set([comps.indexOf(c) + 1])));
}

// ---- pack
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
for (const w of [512, 1024, 2048]) { const h = pot(pack(w)); if (h <= MAXW && (!best || w * h < best.w * best.h)) best = { w, h }; }
if (!best) throw new Error('too big');
pack(best.w);
const out = Buffer.alloc(best.w * best.h * 4);
for (const s of sprites) {
  for (let y = 0; y < s.h; y++) s.buf.copy(out, ((s.y + y) * best.w + s.x) * 4, y * s.w * 4, (y + 1) * s.w * 4);
  frames[s.name] = { x: s.x, y: s.y, w: s.w, h: s.h, ax: s.ax, ay: s.ay };
}
fs.mkdirSync(path.join(ROOT, 'public/sprites'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'preview'), { recursive: true });
const png = path.join(ROOT, 'public/sprites/props.png');
await sharp(out, { raw: { width: best.w, height: best.h, channels: 4 } }).png().toFile(png);
fs.writeFileSync(path.join(ROOT, 'public/sprites/props.json'), JSON.stringify({ meta: { image: 'props.png', w: best.w, h: best.h }, frames, animations }, null, 1));

// ---- labeled preview
const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${best.w}" height="${best.h}" font-family="sans-serif" font-size="9">`];
for (const [n, f] of Object.entries(frames)) {
  svg.push(`<rect x="${f.x - .5}" y="${f.y - .5}" width="${f.w + 1}" height="${f.h + 1}" fill="none" stroke="#f0f"/>`);
  svg.push(`<circle cx="${f.x + f.ax}" cy="${f.y + f.ay}" r="2" fill="#0f0"/>`);
  svg.push(`<text x="${f.x + 2}" y="${f.y + 10}" fill="#fff" stroke="#000" stroke-width="2" paint-order="stroke">${n}</text>`);
}
svg.push('</svg>');
await sharp({ create: { width: best.w, height: best.h, channels: 4, background: '#556' } }).composite([{ input: png }, { input: Buffer.from(svg.join('')) }]).png().toFile(path.join(ROOT, 'preview/props-labeled.png'));
console.log(`props ${best.w}x${best.h}, ${sprites.length} sprites`);
