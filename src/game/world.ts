import type { Anim, Atlas } from '../atlas';
import { hash2 } from '../core/util';
import type { SpriteBatch } from '../render/batch';

export const CHUNK = 256;
const ZONE = 1024;
const ROAD_PERIOD = 2048;
const ROAD_OFFSET = 1024;
const ROAD_W = 128;
export const START_R = 300;

export interface ZoneDef {
  id: string;
  weight: number;
  color: number;
  patches: string[];
  obstacles: string[];
  destruct: string[];
  deco: string[];
}

export const ZONES: ZoneDef[] = [
  { id: 'dirt', weight: 40, color: 0xc8a27a, patches: ['t_dirt', 't_dirt', 't_mud_puddle'], obstacles: ['m_pipes', 'm_cable_spool', 'm_tires'], destruct: ['crate', 'crateSmall'], deco: ['d_pebbles', 'd_rocks_dark', 'd_plank'] },
  { id: 'sand', weight: 20, color: 0xf0dca8, patches: ['t_sand'], obstacles: ['m_sand', 'm_gravel', 'm_wheelbarrow_red'], destruct: ['crate'], deco: ['d_pebble_small', 'd_stone_block'] },
  { id: 'yard', weight: 20, color: 0xb4b0a8, patches: ['t_rubble'], obstacles: ['m_pallet', 'm_bricks', 'm_blocks', 'm_cinder', 'm_planks', 'm_rebar', 'm_cement_sacks', 'm_ibc_tank', 'm_barrel_blue'], destruct: ['crate', 'barrel'], deco: ['m_paint_blue', 'm_paint_orange', 'm_jerrycan', 'd_brick_red'] },
  { id: 'wild', weight: 20, color: 0xa8c090, patches: ['t_grass', 't_grass_rock'], obstacles: ['d_wall_corner_stone', 'd_wall_corner_stone2', 'd_wall_corner_wood', 'd_rock_big'], destruct: ['crateSmall'], deco: ['d_grass_tuft', 'd_bush', 'd_flower', 'd_clover', 'd_sprout', 'd_post_mossy'] },
];

const COMMON_DECO = ['b_cone_0', 'b_cone_1', 'b_drum', 'b_drum_1', 'b_barricade', 'b_barrier_yellow', 'b_barrier_lights', 'd_bollard_white', 'd_post_wood', 'd_post_steel', 'd_can_red', 'd_tin_can', 'd_pipe_elbow', 'o_lamp_small', 'o_lamp_double', 'o_lamp_box', 'm_hand_truck', 'm_ammo_box', 'm_box_green', 'm_toolbox_open', 'm_barrel_blue_small'];

/** Target height (u) of the props; everything else is derived from per-prefix factors. */
const HEIGHTS: Record<string, number> = {
  v_excavator: 110, v_mixer_truck: 95, v_dump_truck: 80, v_forklift: 70, o_scaffold: 130, o_container: 70, o_toilet: 80,
  o_generator: 50, o_floodlight: 110, o_crane: 220, b_jersey_concrete: 40, b_jersey_red: 40, b_jersey_graffiti: 40,
  b_jersey_broken: 40, b_jersey_hazard: 40, b_fence: 60, b_fence_warning: 60, b_fence_sign: 60, b_fence_wire: 60,
  b_fence_wood: 60, m_sandbags: 45, b_hedgehog: 40, m_crate: 40, m_crate_small: 32, m_barrel_red: 40, m_toolbox_red: 28,
  m_medkit: 22, b_cone_0: 28, b_cone_1: 28, b_drum: 36, b_drum_1: 32, m_barrel_blue: 40, s_trafficlight: 50,
  d_sign_caution: 60, o_lamp_small: 30, o_lamp_double: 44, o_lamp_box: 34, m_ibc_tank: 44, m_cement_sacks: 36,
};

export type PropKind = 'deco' | 'obst' | 'land';

export interface Prop {
  anim: Anim;
  x: number;
  y: number;
  h: number;
  flip: boolean;
  kind: PropKind;
  flat: boolean;
  light: number;
  lightR: number;
  lightA: number;
  blink: boolean;
  tall: boolean;
  scale: number;
  halfW: number;
}

export interface Obstacle {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  r: number;
  playerPass: boolean;
}

export type DKind = 'crate' | 'crateSmall' | 'barrel' | 'toolbox';

export interface Destructible {
  id: number;
  kind: DKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  anim: Anim;
  h: number;
  hitR: number;
  flash: number;
  wobble: number;
  hitCd: number;
  fuse: number;
  dead: boolean;
  t: number;
}

interface Patch {
  anim: Anim;
  x: number;
  y: number;
  size: number;
  rot: number;
  flip: boolean;
}

export interface Chunk {
  cx: number;
  cy: number;
  patches: Patch[];
  props: Prop[];
  obstacles: Obstacle[];
  destructs: Destructible[];
}

const DESTRUCT: Record<DKind, { sprite: string; h: number; hp: number }> = {
  crate: { sprite: 'm_crate', h: 40, hp: 15 },
  crateSmall: { sprite: 'm_crate_small', h: 32, hp: 8 },
  barrel: { sprite: 'm_barrel_red', h: 40, hp: 10 },
  toolbox: { sprite: 'm_toolbox_red', h: 28, hp: 25 },
};

const Z_UNIT = -20;
const Z_FLAT = -150;

/** Capsule size (length x thickness in u) for obstacles; otherwise a circle of 0.3 × width. */
const CAPS: Record<string, [number, number]> = {
  v_excavator: [90, 40], v_mixer_truck: [100, 36], o_container: [96, 30], b_jersey_concrete: [60, 14], b_jersey_red: [60, 14],
  b_jersey_graffiti: [60, 14], b_jersey_broken: [60, 14], b_jersey_hazard: [60, 14], m_sandbags: [80, 18],
};
const CIRCLES: Record<string, number> = { v_forklift: 26, o_toilet: 16, o_generator: 18, o_floodlight: 8, o_crane: 26, b_hedgehog: 18 };

export class World {
  seed = 1;
  private chunks = new Map<number, Chunk>();
  private destroyedAt = new Map<number, number>();
  /** Active destructible objects in loaded chunks (max. 12 / 20) */
  live: Destructible[] = [];
  maxDestruct = 12;
  maxProps = 60;
  time = 0;
  private evictT = 0;
  private readonly zoneCache = new Map<number, ZoneDef>();
  private readonly lmCache = new Map<number, { x: number; y: number; sprite: string } | null>();
  private startProps: { name: string; x: number; y: number; light?: number }[] = [];
  private readonly animCache = new Map<string, Anim>();
  private readonly cone: Anim;
  /** Roads and obstacles active */
  roads = true;
  hasObstacles = true;

  constructor(private readonly atlas: Atlas) {
    this.cone = atlas.anim('b_cone_0', 0xff7a1a, true);
  }

  reset(seed: number): void {
    this.seed = seed;
    this.chunks.clear();
    this.destroyedAt.clear();
    this.live.length = 0;
    this.zoneCache.clear();
    this.lmCache.clear();
    this.startProps = [
      { name: 'o_container', x: -250, y: 120 },
      { name: 'o_toilet', x: 270, y: 80 },
      { name: 'o_generator', x: 190, y: -210 },
      { name: 'o_floodlight', x: -160, y: -240, light: 1 },
      { name: 'o_floodlight', x: 170, y: 240, light: 1 },
      { name: 'd_sign_caution', x: -40, y: 275 },
    ];
  }

  private a(name: string): Anim {
    let a = this.animCache.get(name);
    if (!a) {
      a = this.atlas.anim(name, 0x886644, true);
      this.animCache.set(name, a);
    }
    return a;
  }

  private rnd(cx: number, cy: number, salt: number): number {
    return hash2(cx, cy, salt + this.seed * 131);
  }

  // ------------------------------------------------------------ Zones / roads
  zoneAt(wx: number, wy: number): ZoneDef {
    const zx = Math.floor(wx / ZONE);
    const zy = Math.floor(wy / ZONE);
    const key = (zx + 5000) * 10007 + (zy + 5000);
    let z = this.zoneCache.get(key);
    if (!z) {
      let r = hash2(zx, zy, this.seed * 17 + 3) * 100;
      z = ZONES[0]!;
      for (const d of ZONES) {
        if (r < d.weight) {
          z = d;
          break;
        }
        r -= d.weight;
      }
      this.zoneCache.set(key, z);
    }
    return z;
  }

  /** Distance to the nearest road center (x or y road). */
  private roadDist(v: number): number {
    const m = (((v - ROAD_OFFSET) % ROAD_PERIOD) + ROAD_PERIOD) % ROAD_PERIOD;
    return Math.min(m, ROAD_PERIOD - m);
  }

  onRoad(x: number, y: number, margin = 0): boolean {
    if (!this.roads) return false;
    return this.roadDist(x) < ROAD_W / 2 + margin || this.roadDist(y) < ROAD_W / 2 + margin;
  }

  private landmark(zx: number, zy: number): { x: number; y: number; sprite: string } | null {
    const key = (zx + 5000) * 10007 + (zy + 5000);
    let l = this.lmCache.get(key);
    if (l !== undefined) return l;
    l = null;
    if (hash2(zx, zy, this.seed * 7 + 91) < 0.2) {
      const x = (zx + 0.5) * ZONE + (hash2(zx, zy, this.seed + 5) - 0.5) * 300;
      const y = (zy + 0.5) * ZONE + (hash2(zx, zy, this.seed + 6) - 0.5) * 300;
      const names = ['v_excavator', 'v_mixer_truck', 'v_forklift', 'o_scaffold', 'o_crane'];
      const sprite = names[Math.floor(hash2(zx, zy, this.seed + 8) * names.length)]!;
      if (Math.hypot(x, y) > START_R + 150 && !this.onRoad(x, y, 120)) l = { x, y, sprite };
    }
    this.lmCache.set(key, l);
    return l;
  }

  // ------------------------------------------------------------ Chunks
  private key(cx: number, cy: number): number {
    return (cx + 30000) * 60001 + (cy + 30000);
  }

  chunk(cx: number, cy: number): Chunk {
    const k = this.key(cx, cy);
    let c = this.chunks.get(k);
    if (!c) {
      c = this.build(cx, cy);
      this.chunks.set(k, c);
    }
    return c;
  }

  private mkProp(name: string, x: number, y: number, kind: PropKind, flip: boolean, scaleJ = 1): Prop {
    const anim = this.a(name);
    const f = anim.frames[0]!;
    let h = HEIGHTS[name];
    if (h === undefined) {
      const k = name.startsWith('d_') ? 0.3 : name.startsWith('b_') ? 0.42 : name.startsWith('s_') ? 0.5 : 0.4;
      h = f.h * k;
    }
    h *= scaleJ;
    const scale = h / anim.refH;
    const flat = h < 18;
    return {
      anim, x, y, h, flip, kind, flat, light: 0, lightR: 0, lightA: 0, blink: name === 'b_barrier_lights',
      tall: h > 90, scale, halfW: (f.w * scale) / 2,
    };
  }

  private addObstacle(c: Chunk, p: Prop, name: string, playerPass = false): void {
    const cap = CAPS[name];
    if (cap) {
      const r = cap[1] / 2;
      const half = (cap[0] - cap[1]) / 2;
      c.obstacles.push({ x1: p.x - half, y1: p.y + r, x2: p.x + half, y2: p.y + r, r, playerPass });
    } else if (name === 'o_scaffold') {
      c.obstacles.push({ x1: p.x - 38, y1: p.y + 12, x2: p.x - 38, y2: p.y + 12, r: 12, playerPass: true });
      c.obstacles.push({ x1: p.x + 38, y1: p.y + 12, x2: p.x + 38, y2: p.y + 12, r: 12, playerPass: true });
    } else {
      const r = CIRCLES[name] ?? Math.max(12, Math.min(26, p.halfW * 0.6));
      c.obstacles.push({ x1: p.x, y1: p.y + r, x2: p.x, y2: p.y + r, r, playerPass });
    }
  }

  private build(cx: number, cy: number): Chunk {
    const c: Chunk = { cx, cy, patches: [], props: [], obstacles: [], destructs: [] };
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const mx = x0 + CHUNK / 2;
    const my = y0 + CHUNK / 2;
    const zone = this.zoneAt(mx, my);
    const dStart = Math.hypot(mx, my);
    const near = dStart < START_R + 140;

    // Soft patches (0–2 per chunk), dense only outside the start area
    const pc = this.rnd(cx, cy, 1);
    const np = pc < 0.3 ? 0 : pc < 0.75 ? 1 : 2;
    const placed: { x: number; y: number; s: number }[] = [];
    for (let i = 0; i < np; i++) {
      const size = 80 + this.rnd(cx, cy, 10 + i) * 60;
      const x = x0 + size / 2 + this.rnd(cx, cy, 20 + i) * (CHUNK - size / 2);
      const y = y0 + size / 2 + this.rnd(cx, cy, 30 + i) * (CHUNK - size / 2);
      if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < 1.2 * Math.max(size, p.s))) continue;
      placed.push({ x, y, s: size });
      const name = zone.patches[Math.floor(this.rnd(cx, cy, 40 + i) * zone.patches.length)]!;
      c.patches.push({
        anim: this.a(name + '_soft'), x, y, size,
        rot: Math.floor(this.rnd(cx, cy, 50 + i) * 4) * (Math.PI / 2),
        flip: this.rnd(cx, cy, 60 + i) > 0.5,
      });
    }

    // Start-area props
    for (const sp of this.startProps) {
      if (sp.x >= x0 && sp.x < x0 + CHUNK && sp.y >= y0 && sp.y < y0 + CHUNK) {
        const p = this.mkProp(sp.name, sp.x, sp.y, sp.name === 'd_sign_caution' ? 'deco' : 'obst', sp.x > 0);
        if (sp.light) {
          p.light = 0xfff2b0;
          p.lightR = 120;
          p.lightA = 0.12;
        }
        c.props.push(p);
        if (p.kind === 'obst') this.addObstacle(c, p, sp.name);
      }
    }
    if (near) return c;

    const road = this.onRoad(mx, my, CHUNK * 0.7);

    // Landmarks
    const lz = [Math.floor(mx / ZONE), Math.floor(my / ZONE)] as const;
    let landClear = false;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const lm = this.landmark(lz[0] + dx, lz[1] + dy);
        if (!lm) continue;
        if (lm.x >= x0 && lm.x < x0 + CHUNK && lm.y >= y0 && lm.y < y0 + CHUNK) {
          const p = this.mkProp(lm.sprite, lm.x, lm.y, 'land', this.rnd(cx, cy, 70) > 0.5);
          c.props.push(p);
          this.addObstacle(c, p, lm.sprite);
        }
        if (Math.hypot(lm.x - mx, lm.y - my) < 260) landClear = true;
      }
    }

    // Roadside: jersey barrier rows and signs
    if (this.roads) this.roadside(c, x0, y0);

    // Obstacles (max. 1 per chunk, margin 70 u)
    if (!road && !landClear && this.rnd(cx, cy, 80) < 0.4) {
      const name = zone.obstacles[Math.floor(this.rnd(cx, cy, 81) * zone.obstacles.length)]!;
      const x = x0 + 70 + this.rnd(cx, cy, 82) * (CHUNK - 140);
      const y = y0 + 70 + this.rnd(cx, cy, 83) * (CHUNK - 140);
      const p = this.mkProp(name, x, y, 'obst', this.rnd(cx, cy, 84) > 0.5, 0.9 + this.rnd(cx, cy, 85) * 0.2);
      c.props.push(p);
      this.addObstacle(c, p, name);
    }

    // Destructible objects
    if (!road && !landClear) this.destructibles(c, zone, x0, y0);

    // Decoration (max. 2)
    const nd = this.rnd(cx, cy, 100) < 0.25 ? 0 : this.rnd(cx, cy, 101) < 0.6 ? 1 : 2;
    for (let i = 0; i < nd; i++) {
      if (road && this.rnd(cx, cy, 102 + i) < 0.6) continue;
      const pool = this.rnd(cx, cy, 103 + i) < 0.3 ? COMMON_DECO : zone.deco;
      const name = pool[Math.floor(this.rnd(cx, cy, 104 + i) * pool.length)]!;
      const x = x0 + 20 + this.rnd(cx, cy, 105 + i) * (CHUNK - 40);
      const y = y0 + 20 + this.rnd(cx, cy, 106 + i) * (CHUNK - 40);
      if (this.onRoad(x, y, 6)) continue;
      const p = this.mkProp(name, x, y, 'deco', this.rnd(cx, cy, 107 + i) > 0.5, 0.9 + this.rnd(cx, cy, 108 + i) * 0.2);
      if (name.startsWith('o_lamp')) {
        p.light = 0xffe08a;
        p.lightR = 60;
        p.lightA = 0.1;
      }
      c.props.push(p);
    }
    return c;
  }

  private destructibles(c: Chunk, zone: ZoneDef, x0: number, y0: number): void {
    const { cx, cy } = c;
    const tryAdd = (kind: DKind, x: number, y: number): void => {
      if (this.live.length >= this.maxDestruct) return;
      const id = cx * 7919 + cy * 104729 + Math.floor(x) * 31 + Math.floor(y) * 17 + this.seed;
      const t = this.destroyedAt.get(id);
      if (t !== undefined && this.time - t < 120) return;
      const dd = DESTRUCT[kind];
      const anim = this.a(dd.sprite);
      const d: Destructible = {
        id, kind, x, y, hp: dd.hp, maxHp: dd.hp, anim, h: dd.h, hitR: dd.h * 0.45, flash: 0, wobble: 0, hitCd: 0, fuse: -1, dead: false, t: 0,
      };
      c.destructs.push(d);
      this.live.push(d);
    };
    // Toolbox: one chunk per storage zone
    if (zone.id === 'yard') {
      const zx = Math.floor((x0 + CHUNK / 2) / ZONE);
      const zy = Math.floor((y0 + CHUNK / 2) / ZONE);
      const tx = (zx + 0.3 + hash2(zx, zy, this.seed + 21) * 0.4) * ZONE;
      const ty = (zy + 0.3 + hash2(zx, zy, this.seed + 22) * 0.4) * ZONE;
      if (tx >= x0 && tx < x0 + CHUNK && ty >= y0 && ty < y0 + CHUNK) tryAdd('toolbox', tx, ty);
    }
    const r = this.rnd(cx, cy, 120);
    const kinds = zone.destruct;
    const kind = kinds[Math.floor(this.rnd(cx, cy, 121) * kinds.length)] as DKind;
    if (kind === 'barrel') {
      if (r < 0.22) {
        const n = 2 + Math.floor(this.rnd(cx, cy, 122) * 3);
        const bx = x0 + 70 + this.rnd(cx, cy, 123) * (CHUNK - 140);
        const by = y0 + 70 + this.rnd(cx, cy, 124) * (CHUNK - 140);
        for (let i = 0; i < n; i++) tryAdd('barrel', bx + (i % 2) * 34 + (i > 1 ? 14 : 0), by + Math.floor(i / 2) * 24);
      }
    } else if (r < 0.3) {
      tryAdd(kind, x0 + 30 + this.rnd(cx, cy, 125) * (CHUNK - 60), y0 + 30 + this.rnd(cx, cy, 126) * (CHUNK - 60));
    }
  }

  private roadside(c: Chunk, x0: number, y0: number): void {
    const { cx, cy } = c;
    const jerseys = ['b_jersey_concrete', 'b_jersey_red', 'b_jersey_graffiti', 'b_jersey_broken', 'b_jersey_hazard'];
    const signs = ['s_roadwork', 's_detour', 's_noentry', 's_warning', 's_post_0', 's_post_1', 'b_hedgehog'];
    for (const axis of [0, 1]) {
      // axis 0: road runs in y direction (fixed x center); axis 1: in x direction
      const lo = axis === 0 ? x0 : y0;
      const k = Math.round((lo + CHUNK / 2 - ROAD_OFFSET) / ROAD_PERIOD);
      const centre = ROAD_OFFSET + k * ROAD_PERIOD;
      for (const side of [-1, 1]) {
        const edge = centre + side * 92;
        if (edge < lo + 34 || edge >= lo + CHUNK - 34) continue;
        const along = (axis === 0 ? y0 : x0) + 60 + this.rnd(cx, cy, 200 + axis * 2 + (side > 0 ? 1 : 0)) * (CHUNK - 120);
        const rr = this.rnd(cx, cy, 210 + axis * 2 + (side > 0 ? 1 : 0));
        const px = axis === 0 ? edge : along;
        const py = axis === 0 ? along : edge;
        // not inside the crossing of the other road
        if (this.roadDist(axis === 0 ? py : px) < ROAD_W / 2 + 60) continue;
        if (Math.hypot(px, py) < START_R + 80) continue;
        if (rr < 0.55) {
          const name = jerseys[Math.floor(this.rnd(cx, cy, 220 + axis) * jerseys.length)]!;
          const p = this.mkProp(name, px, py, 'obst', side > 0);
          c.props.push(p);
          this.addObstacle(c, p, name);
        } else if (rr < 0.7) {
          const name = signs[Math.floor(this.rnd(cx, cy, 230 + axis) * signs.length)]!;
          const p = this.mkProp(name, px, py, name === 'b_hedgehog' ? 'obst' : 'deco', side > 0);
          c.props.push(p);
          if (name === 'b_hedgehog') this.addObstacle(c, p, name);
        }
      }
    }
  }

  // ------------------------------------------------------------ Runtime
  update(dt: number, camX: number, camY: number): void {
    this.time += dt;
    this.evictT -= dt;
    if (this.evictT > 0) return;
    this.evictT = 1.5;
    const ccx = Math.floor(camX / CHUNK);
    const ccy = Math.floor(camY / CHUNK);
    for (const [k, c] of this.chunks) {
      if (Math.abs(c.cx - ccx) > 6 || Math.abs(c.cy - ccy) > 6) {
        this.chunks.delete(k);
        for (const d of c.destructs) {
          const i = this.live.indexOf(d);
          if (i >= 0) this.live.splice(i, 1);
        }
      }
    }
    this.live = this.live.filter((d) => !d.dead);
  }

  markDestroyed(d: Destructible): void {
    d.dead = true;
    this.destroyedAt.set(d.id, this.time);
    const i = this.live.indexOf(d);
    if (i >= 0) this.live.splice(i, 1);
  }

  /** Pushes a circle out of obstacles. Returns the displacement length. */
  resolve(pos: { x: number; y: number }, rad: number, player: boolean): number {
    const ccx = Math.floor(pos.x / CHUNK);
    const ccy = Math.floor(pos.y / CHUNK);
    const lx = pos.x - ccx * CHUNK;
    const ly = pos.y - ccy * CHUNK;
    const nx = lx < 70 ? -1 : lx > CHUNK - 70 ? 1 : 0;
    const ny = ly < 70 ? -1 : ly > CHUNK - 70 ? 1 : 0;
    let moved = 0;
    for (let dx = Math.min(0, nx); dx <= Math.max(0, nx); dx++) {
      for (let dy = Math.min(0, ny); dy <= Math.max(0, ny); dy++) {
        const ch = this.chunks.get(this.key(ccx + dx, ccy + dy));
        if (!ch) continue;
        for (const o of ch.obstacles) {
          if (player && o.playerPass) continue;
          // closest point on the segment
          const sx = o.x2 - o.x1;
          const sy = o.y2 - o.y1;
          const l2 = sx * sx + sy * sy;
          let t = l2 > 0 ? ((pos.x - o.x1) * sx + (pos.y - o.y1) * sy) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = o.x1 + sx * t;
          const qy = o.y1 + sy * t;
          const ddx = pos.x - qx;
          const ddy = pos.y - qy;
          const min = o.r + rad;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < min * min) {
            const d = Math.sqrt(d2);
            if (d > 0.0001) {
              pos.x = qx + (ddx / d) * min;
              pos.y = qy + (ddy / d) * min;
            } else {
              pos.y += min;
            }
            moved += min - d;
          }
        }
      }
    }
    return moved;
  }

  // ------------------------------------------------------------ Drawing
  draw(b: SpriteBatch, camX: number, camY: number, vw: number, vh: number, px: number, py: number, disableDeco = false): void {
    const mxv = vw / 2 + 110;
    const myv = vh / 2 + 140;
    const x0 = Math.floor((camX - mxv) / CHUNK);
    const x1 = Math.floor((camX + mxv) / CHUNK);
    const y0 = Math.floor((camY - myv) / CHUNK);
    const y1 = Math.floor((camY + myv) / CHUNK);
    // Roads
    if (this.roads) this.drawRoads(b, camX, camY, vw, vh);
    let count = 0;
    const maxProps = this.maxProps;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const c = this.chunk(cx, cy);
        for (const p of c.patches) {
          const fr = p.anim.frames[0]!;
          b.quad(fr, p.x, p.y, -198, p.size, p.size, p.rot, p.flip, 0xffffff, 0, 0.85);
        }
      }
    }
    // Obstacles/landmarks first, decoration afterwards (cap)
    for (let pass = 0; pass < 2; pass++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const c = this.chunk(cx, cy);
          for (const p of c.props) {
            if ((p.kind === 'deco') !== (pass === 1)) continue;
            if (pass === 1 && disableDeco) continue;
            if (count >= maxProps && pass === 1) break;
            if (Math.abs(p.x - camX) > mxv || Math.abs(p.y - camY) > myv + p.h) continue;
            count++;
            this.drawProp(b, p, camY, px, py);
          }
        }
      }
    }
    // Destructibles
    for (const d of this.live) {
      if (d.dead || Math.abs(d.x - camX) > mxv || Math.abs(d.y - camY) > myv) continue;
      const z = Z_UNIT - (d.y - camY) * 0.0005;
      const s = d.h / d.anim.refH;
      const f = d.anim.frames[0]!;
      b.quad(b.shadow, d.x, d.y + 1, -60, d.h * 1.1, d.h * 0.5, 0, false, 0x000000, 1, 0.4);
      let tint = 0xffffff;
      let mix = 0;
      if (d.flash > 0) mix = 0.85;
      else if (d.kind === 'toolbox' && Math.sin(d.t * Math.PI * 4) > 0) {
        tint = 0xffd54a;
        mix = 0.35;
      } else if (d.fuse >= 0) {
        tint = 0xff3a2a;
        mix = 0.6;
      }
      b.sprite(f, d.x, d.y, z, s, d.wobble, false, tint, mix);
    }
  }

  private drawProp(b: SpriteBatch, p: Prop, camY: number, px: number, py: number): void {
    const f = p.anim.frames[0]!;
    const z = p.flat ? Z_FLAT - (p.y - camY) * 0.0005 : Z_UNIT - (p.y - camY) * 0.0005;
    if (!p.flat && p.h >= 24) {
      b.quad(b.shadow, p.x, p.y + 1, -60, Math.min(p.halfW * 2.2, 160), Math.min(p.halfW * 0.9, 50), 0, false, 0x000000, 1, 0.35);
    }
    let alpha = 1;
    if (p.tall && py > p.y && py < p.y + p.h * 0.95 && Math.abs(px - p.x) < p.halfW) alpha = 0.5;
    if (p.blink) alpha *= 0.8 + 0.2 * Math.sin(this.time * Math.PI * 2);
    if (p.light) b.quad(b.disc, p.x, p.y + p.h * 0.6, Z_FLAT + 1, p.lightR * 2, p.lightR * 2, 0, false, p.light, 1, p.lightA);
    b.sprite(f, p.x, p.y, z, p.scale, 0, p.flip, 0xffffff, 0, alpha);
  }

  private drawRoads(b: SpriteBatch, camX: number, camY: number, vw: number, vh: number): void {
    const z = -195;
    const hx = vw / 2 + 60;
    const hy = vh / 2 + 60;
    const bands = (c: number, half: number): number[] => {
      const out: number[] = [];
      const k0 = Math.floor((c - half - ROAD_OFFSET - ROAD_W) / ROAD_PERIOD);
      const k1 = Math.ceil((c + half - ROAD_OFFSET + ROAD_W) / ROAD_PERIOD);
      for (let k = k0; k <= k1; k++) out.push(ROAD_OFFSET + k * ROAD_PERIOD);
      return out;
    };
    for (const rx of bands(camX, hx)) {
      // road running along y at x = rx
      b.rect(rx, camY, z, ROAD_W, vh + 120, 0x4a4a50);
      b.rect(rx - 58, camY, z + 0.01, 3, vh + 120, 0xe8e4d8, 0.8);
      b.rect(rx + 58, camY, z + 0.01, 3, vh + 120, 0xe8e4d8, 0.8);
      const start = Math.floor((camY - hy) / 48) * 48;
      for (let y = start; y < camY + hy; y += 48) if (this.roadDist(y) > ROAD_W / 2 + 14) b.rect(rx, y, z + 0.02, 4, 24, 0xe8c020);
    }
    for (const ry of bands(camY, hy)) {
      b.rect(camX, ry, z, vw + 120, ROAD_W, 0x4a4a50);
      b.rect(camX, ry - 58, z + 0.01, vw + 120, 3, 0xe8e4d8, 0.8);
      b.rect(camX, ry + 58, z + 0.01, vw + 120, 3, 0xe8e4d8, 0.8);
      const start = Math.floor((camX - hx) / 48) * 48;
      for (let x = start; x < camX + hx; x += 48) if (this.roadDist(x) > ROAD_W / 2 + 14) b.rect(x, ry, z + 0.02, 24, 4, 0xe8c020);
    }
    // Crossings: wear patch
    const wear = this.a('t_asphalt_dark_soft').frames[0]!;
    for (const rx of bands(camX, hx)) {
      for (const ry of bands(camY, hy)) {
        b.rect(rx, ry, z + 0.03, ROAD_W, ROAD_W, 0x4a4a50);
        b.quad(wear, rx, ry, z + 0.04, 150, 150, 0, false, 0x3a3a40, 1, 0.5);
      }
    }
  }

  /** Is there an obstacle at this position (spawn check)? */
  blocked(x: number, y: number): boolean {
    if (!this.hasObstacles) return false;
    const pos = { x, y };
    return this.resolve(pos, 18, false) > 0;
  }

  /** Number of loaded chunks (for tests). */
  get chunkCount(): number {
    return this.chunks.size;
  }

  get coneAnim(): Anim {
    return this.cone;
  }
}
