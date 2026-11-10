import type { Anim } from '../atlas';
import { TAU, rand } from '../core/util';
import type { SpriteBatch } from '../render/batch';
import type { Dict } from '../i18n/en';
import { num, t, weaponText } from '../i18n';
import type { StatKey } from './passives';
import { PKind } from './entities';
import type { Game } from './game';

const GOLD = 0xffd54a;

export interface EvoDef {
  /** Matching passive ID (level >= 1) */
  passive: string;
  /** Stats that replace the level-8 row (evolution name/description: i18n) */
  row: number[];
}

export type ColKey = keyof Dict['cols'];

/** Weapon data. Name/description/evolution texts live in i18n: `weaponText(id)`. */
export interface WeaponDef {
  id: string;
  icon: string;
  max: number;
  /**
   * Which player stats this weapon really uses in the code (source for the pause statistics).
   * Gameplay effects only, no pure visuals.
   */
  uses: StatKey[];
  /** Column keys of the value table (labels: i18n `cols`) */
  cols: ColKey[];
  /** Absolute values per level 1..8 */
  rows: number[][];
  evo?: EvoDef;
  create(g: Game): Weapon;
}

export abstract class Weapon {
  level = 1;
  evo = false;
  constructor(readonly def: WeaponDef, _g?: Game) {}
  /** Values of the current level (or the evolution). */
  protected s(): number[] {
    if (this.evo && this.def.evo) return this.def.evo.row;
    return this.def.rows[Math.min(this.level, 8) - 1]!;
  }
  get displayName(): string {
    const tx = weaponText(this.def.id);
    return this.evo && this.def.evo ? tx.evoName ?? tx.name : tx.name;
  }
  abstract update(g: Game, dt: number): void;
  draw(_g: Game, _b: SpriteBatch): void {
    /* optional */
  }
  protected get tint(): number {
    return this.evo ? GOLD : 0xffffff;
  }
  protected get tmix(): number {
    return this.evo ? 0.35 : 0;
  }
  protected get esc(): number {
    return this.evo ? 1.1 : 1;
  }
}

/** Aim direction: nearest enemy in range, otherwise the facing direction. */
function aimAngle(g: Game, range = 280): number {
  const p = g.player;
  const e = g.nearest(p.x, p.y, range);
  if (e) return g.aimAt(p.x, p.y + 20, e);
  return Math.atan2(p.fy, p.fx);
}

function swing(g: Game): void {
  g.player.attackT = 0.25;
}

const Z_WEAPON = -15;

// ---------------------------------------------------------------- Power drill
class Drill extends Weapon {
  private cd = 0.3;
  private left = 0;
  private gap = 0;
  private readonly anim: Anim;
  constructor(def: WeaponDef, g: Game) {
    super(def);
    this.anim = g.atlas.anim(['proj_drillbit', 'proj_bullet'], 0xffdd44);
  }
  update(g: Game, dt: number): void {
    const p = g.player;
    const [dmg, cd, amount, pierce] = this.s() as [number, number, number, number];
    if (this.left > 0) {
      this.gap -= dt;
      if (this.gap <= 0) {
        this.gap = 0.08;
        this.left--;
        const t = g.nearest(p.x, p.y, 330);
        if (t) {
          const a = g.aimAt(p.x, p.y + 20, t);
          const q = g.fire(this.anim, p.x, p.y + 20, a, 380 * g.mods.projSpeed, g.dmg(dmg), pierce, 1.0, (this.evo ? 36 : 18) * Math.sqrt(g.mods.area), this.evo ? 10 : 6, 40, this.evo);
          q.tint = this.tint;
          q.mix = this.tmix;
          q.trail = this.evo;
        }
      }
      return;
    }
    this.cd -= dt;
    if (this.cd > 0) return;
    if (!g.nearest(p.x, p.y, 330)) {
      this.cd = 0.1;
      return;
    }
    this.cd = g.cdOf(cd);
    this.left = amount + g.mods.amount;
    this.gap = 0;
    swing(g);
  }
}

// ---------------------------------------------------------------- Nail gun (walking direction)
class Nailgun extends Weapon {
  private cd = 0.3;
  private readonly anim: Anim;
  constructor(def: WeaponDef, g: Game) {
    super(def);
    this.anim = g.atlas.anim(['proj_nail', 'proj_1'], 0xcccccc);
  }
  update(g: Game, dt: number): void {
    this.cd -= dt;
    if (this.cd > 0) return;
    const p = g.player;
    const base = Math.atan2(p.fy, p.fx);
    if (!g.enemyInCone(p.x, p.y + 20, base, 0.9, 420)) {
      this.cd = 0.1;
      return;
    }
    const [dmg, cd, amount, pierce] = this.s() as [number, number, number, number];
    this.cd = g.cdOf(cd);
    const n = amount + g.mods.amount;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * ((10 * Math.PI) / 180);
      const q = g.fire(this.anim, p.x, p.y + 20, a, 520 * g.mods.projSpeed, g.dmg(dmg), pierce, 0.7, 12, 5, 20);
      q.hitFxSize = 14;
    }
    swing(g);
  }
}

// ---------------------------------------------------------------- Circular saw (boomerang)
class Saw extends Weapon {
  private cd = 0.8;
  private readonly anim: Anim;
  constructor(def: WeaponDef, g: Game) {
    super(def);
    this.anim = g.atlas.anim('w_saw', 0xcccccc);
  }
  update(g: Game, dt: number): void {
    this.cd -= dt;
    if (this.cd > 0) return;
    const p = g.player;
    const [dmg, cd, amount, range] = this.s() as [number, number, number, number];
    this.cd = g.cdOf(cd);
    const n = amount + g.mods.amount;
    const base = g.nearest(p.x, p.y, 300) ? aimAngle(g) : rand(0, TAU);
    const sc = this.evo ? 1.6 : 1;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.45;
      const q = g.fire(this.anim, p.x, p.y + 16, a, 300 * g.mods.projSpeed, g.dmg(dmg), 999, 99, 26 * sc * Math.sqrt(g.mods.area), 14 * sc * Math.sqrt(g.mods.area), 50);
      q.kind = PKind.Boomerang;
      q.spin = 14;
      q.rehit = this.evo ? 0.2 : 0.4;
      q.ox = p.x;
      q.oy = p.y + 16;
      q.range = range * Math.sqrt(g.mods.area);
      q.orbitEnd = this.evo;
      q.tint = this.tint;
      q.mix = this.evo ? 0.4 : 0;
      if (this.evo) q.tint = 0xbff4ff;
    }
    swing(g);
  }
}

// ---------------------------------------------------------------- Sledgehammer
class Hammer extends Weapon {
  private cd = 0.6;
  update(g: Game, dt: number): void {
    const p = g.player;
    this.cd -= dt;
    if (this.cd > 0) return;
    if (!g.nearest(p.x, p.y, 200)) {
      this.cd = 0.15;
      return;
    }
    const [dmg, cd, radius, slams] = this.s() as [number, number, number, number];
    this.cd = g.cdOf(cd);
    const r = radius * g.mods.area;
    swing(g);
    for (let i = 0; i < slams; i++) {
      let x = p.x;
      let y = p.y;
      if (i > 0) {
        const e = g.randomEnemy(p.x, p.y, 220);
        if (e) {
          x = e.x;
          y = e.y;
        }
      }
      const delay = 0.15 + i * 0.35;
      const z = g.spawnZone(x, y);
      z.r = r * (i > 0 ? 0.85 : 1);
      z.dmg = g.dmg(dmg);
      z.kb = 200 * g.mods.kb;
      z.delay = z.delay0 = delay;
      z.life = 0.1;
      z.visual = 1;
      z.color = 0xffc83d;
      z.shake = this.evo ? 6 : 3;
      z.stun = this.evo ? 0.5 : 0;
      const sc = this.esc * (this.evo ? 1.2 : 1);
      g.spawnFx('fx_dust', x, y + 6, z.r * 2.1 * sc, { delay, fps: 14 });
      g.spawnFx('fx_ring', x, y, z.r * 1.8 * sc, { delay, fps: 12, alpha: 0.8, ground: true, tint: this.evo ? GOLD : 0xffffff, mix: this.evo ? 0.6 : 0 });
      g.spawnFx('fx_rubble', x, y, z.r * 0.7, { delay, fps: 12 });
    }
  }
}

// ---------------------------------------------------------------- Jackhammer
class Jackhammer extends Weapon {
  private cd = 1;
  private walked = 0;
  private lx = 0;
  private ly = 0;
  update(g: Game, dt: number): void {
    const p = g.player;
    if (this.evo) {
      this.walked += Math.hypot(p.x - this.lx, p.y - this.ly);
      if (this.walked >= 40) {
        this.walked = 0;
        this.field(g, p.x, p.y, 28, g.dmg(20), 0.2);
      }
    }
    this.lx = p.x;
    this.ly = p.y;
    this.cd -= dt;
    if (this.cd > 0) return;
    if (!g.nearest(p.x, p.y, 300)) {
      this.cd = 0.2;
      return;
    }
    const [dmg, cd, fields, radius] = this.s() as [number, number, number, number];
    this.cd = g.cdOf(cd);
    const n = fields + g.mods.amount;
    for (let i = 0; i < n; i++) {
      const e = g.randomEnemy(p.x, p.y, 300);
      const x = e ? e.x : p.x + rand(-120, 120);
      const y = e ? e.y : p.y + rand(-120, 120);
      this.field(g, x, y, radius * g.mods.area, g.dmg(dmg), 0.35);
    }
    swing(g);
  }
  private field(g: Game, x: number, y: number, r: number, dmg: number, delay: number): void {
    const z = g.spawnZone(x, y);
    z.r = r;
    z.dmg = dmg;
    z.delay = z.delay0 = delay;
    z.life = 0.15;
    z.kb = 60;
    z.visual = 1;
    z.color = 0xffc83d;
    g.spawnFx('fx_spikes', x, y + 2, r * 3.2, { delay: delay - 0.02, fps: 16, tint: this.tint, mix: this.tmix });
    g.spawnFx('fx_rubble', x, y, r * 1.2, { delay: delay + 0.1, fps: 14 });
  }
}

// ---------------------------------------------------------------- Chainsaw (melee arc)
class Chainsaw extends Weapon {
  private cd = 0.4;
  private back: { t: number; a: number } | null = null;
  update(g: Game, dt: number): void {
    const p = g.player;
    if (this.back) {
      this.back.t -= dt;
      if (this.back.t <= 0) {
        this.cut(g, this.back.a);
        this.back = null;
      }
    }
    this.cd -= dt;
    if (this.cd > 0) return;
    const [, cd, range] = this.s() as [number, number, number, number];
    if (!g.nearest(p.x, p.y, range + 30)) {
      this.cd = 0.1;
      return;
    }
    this.cd = g.cdOf(cd);
    const a = aimAngle(g, range + 30);
    this.cut(g, a);
    const sides = this.s()[3]!;
    if (sides >= 2) this.back = { t: 0.15, a: a + Math.PI };
    swing(g);
  }
  private cut(g: Game, a: number): void {
    const p = g.player;
    const [dmg, , range] = this.s() as [number, number, number, number];
    const r = range * g.mods.area;
    const z = g.spawnZone(p.x, p.y + 10);
    z.shape = 1;
    z.r = r;
    z.dir = a;
    z.half = (50 * Math.PI) / 180;
    z.dmg = g.dmg(dmg);
    z.kb = 60 * g.mods.kb;
    z.life = 0.08;
    g.spawnFx('fx_slash', p.x + Math.cos(a) * r * 0.5, p.y + 10 + Math.sin(a) * r * 0.5, r * 0.9, { rot: a, fps: 22 });
  }
}

// ---------------------------------------------------------------- Wrench (orbit)
class Wrench extends Weapon {
  private ang = 0;
  private t = 0;
  private readonly anim: Anim;
  private readonly pos: { x: number; y: number }[] = [];
  constructor(def: WeaponDef, g: Game) {
    super(def);
    this.anim = g.atlas.anim('w_wrench', 0xcccccc);
  }
  private n(g: Game): number {
    return this.s()[1]! + g.mods.amount;
  }
  update(g: Game, dt: number): void {
    const p = g.player;
    const [dmg, , radius] = this.s() as [number, number, number];
    this.t += dt;
    this.ang += 3.4 * (this.level >= 8 || this.evo ? 1.3 : 1) * g.mods.projSpeed * dt;
    const n = this.n(g);
    const rad = radius * Math.sqrt(g.mods.area);
    const hitR = 14 * Math.sqrt(g.mods.area);
    while (this.pos.length < n) this.pos.push({ x: 0, y: 0 });
    for (let i = 0; i < n; i++) {
      const a = this.ang + (i / n) * TAU;
      const o = this.pos[i]!;
      o.x = p.x + Math.cos(a) * rad;
      o.y = p.y + 20 + Math.sin(a) * rad * 0.9;
      const cnt = g.hash.query(o.x, o.y, hitR + 70, g.scratch);
      for (let k = 0; k < cnt; k++) {
        const e = g.enemies[g.scratch[k]!];
        if (!e || e.dead || e.orbitCd > 0) continue;
        const dx = e.x - o.x;
        const dy = e.y + e.cy - o.y;
        const rr = hitR + e.hr;
        if (dx * dx + dy * dy < rr * rr) {
          e.orbitCd = 0.35;
          const ex = e.x - p.x;
          const ey = e.y - p.y;
          const d = Math.hypot(ex, ey) || 1;
          const crit = this.evo && Math.random() < 0.15;
          g.damageEnemy(e, g.dmg(dmg) * (crit ? 2 : 1), (ex / d) * 110 * g.mods.kb, (ey / d) * 110 * g.mods.kb, crit);
          g.fxHit(e.x, e.y + e.cy, 18);
        }
      }
      g.hitProps(o.x, o.y, hitR, g.dmg(dmg), 0.35);
    }
  }
  draw(g: Game, b: SpriteBatch): void {
    const n = this.n(g);
    const s = (28 * this.esc * Math.sqrt(g.mods.area)) / this.anim.refH;
    const f = this.anim.frames[0]!;
    for (let i = 0; i < n && i < this.pos.length; i++) {
      const o = this.pos[i]!;
      b.quad(b.shadow, o.x, o.y - 12, -59, 22, 10, 0, false, 0, 1, 0.3);
      b.sprite(f, o.x, o.y, Z_WEAPON - (o.y - g.camY) * 0.0005, s, this.t * 1, false, this.tint, this.tmix);
    }
  }
}

// ---------------------------------------------------------------- Pipe wrench (thrown bomb)
class Pipewrench extends Weapon {
  private cd = 1;
  private readonly anim: Anim;
  constructor(def: WeaponDef, g: Game) {
    super(def);
    this.anim = g.atlas.anim('w_pipewrench', 0xcc3333);
  }
  update(g: Game, dt: number): void {
    this.cd -= dt;
    if (this.cd > 0) return;
    const p = g.player;
    if (!g.nearest(p.x, p.y, 260)) {
      this.cd = 0.2;
      return;
    }
    const [dmg, cd, amount, blast] = this.s() as [number, number, number, number];
    this.cd = g.cdOf(cd);
    const n = amount + g.mods.amount;
    for (let i = 0; i < n; i++) {
      const e = g.randomEnemy(p.x, p.y, 260);
      const tx = e ? e.x : p.x + rand(-120, 120);
      const ty = e ? e.y : p.y + rand(-120, 120);
      const q = g.lob(this.anim, p.x, p.y + 20, tx, ty, 0.6 / Math.sqrt(g.mods.projSpeed), 24);
      q.dmg = g.dmg(dmg);
      q.blast = blast * g.mods.area;
      q.spin = 10;
      q.land = 0;
    }
    swing(g);
  }
}

// ---------------------------------------------------------------- Caulk gun (puddles)
class Caulk extends Weapon {
  private cd = 1.2;
  private readonly anim: Anim;
  constructor(def: WeaponDef, g: Game) {
    super(def);
    this.anim = g.atlas.anim(['proj_pellet', 'proj_shot'], 0xf2eedc);
  }
  update(g: Game, dt: number): void {
    this.cd -= dt;
    if (this.cd > 0) return;
    const p = g.player;
    const [tick, cd, puddles, radius, duration] = this.s() as [number, number, number, number, number];
    this.cd = g.cdOf(cd);
    const n = puddles + g.mods.amount;
    for (let i = 0; i < n; i++) {
      const e = g.randomEnemy(p.x, p.y, 240);
      const tx = e ? e.x : p.x + rand(-90, 90);
      const ty = e ? e.y : p.y + rand(-90, 90);
      const q = g.lob(this.anim, p.x, p.y + 18, tx, ty, 0.5, 14);
      q.tint = 0xf2eedc;
      q.land = 1;
      q.dmg = g.dmg(tick);
      q.blast = radius * g.mods.area;
      q.puddle = duration * g.mods.duration;
      q.spin = 0;
      q.mix = this.evo ? 0.3 : 0;
      q.phase = this.evo ? 1 : 0;
    }
    swing(g);
  }
}

// ---------------------------------------------------------------- Gun turret
interface TurretState {
  x: number;
  y: number;
  life: number;
  cd: number;
  flash: number;
  t: number;
}

class Turret extends Weapon {
  private cd = 0.5;
  private readonly turrets: TurretState[] = [];
  private readonly anim: Anim;
  private readonly bullet: Anim;
  constructor(def: WeaponDef, g: Game) {
    super(def);
    this.anim = g.atlas.anim('w_turret', 0x888888);
    this.bullet = g.atlas.anim(['proj_bullet', 'proj_shot'], 0xffcc44);
  }
  update(g: Game, dt: number): void {
    const p = g.player;
    const [dmg, sps, duration, max0, cd, pierce] = this.s() as [number, number, number, number, number, number];
    this.cd -= dt;
    const max = max0 + g.mods.amount;
    if (this.cd <= 0) {
      this.cd = g.cdOf(cd);
      const a = rand(0, TAU);
      const t: TurretState = { x: p.x + Math.cos(a) * 50, y: p.y + Math.sin(a) * 50, life: duration * g.mods.duration, cd: 0.3, flash: 0, t: 0 };
      this.turrets.push(t);
      while (this.turrets.length > max) this.turrets.shift();
      g.spawnFx('fx_dust', t.x, t.y, 44, { fps: 14 });
    }
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i]!;
      t.life -= dt;
      t.t += dt;
      t.cd -= dt;
      if (t.flash > 0) t.flash -= dt;
      if (t.life <= 0) {
        g.spawnFx('fx_smoke_small', t.x, t.y, 40, { fps: 12 });
        this.turrets.splice(i, 1);
        continue;
      }
      if (t.cd <= 0) {
        const e = g.nearest(t.x, t.y, 260);
        if (e) {
          t.cd = 1 / sps;
          t.flash = 0.08;
          const a = g.aimAt(t.x, t.y + 18, e);
          g.fire(this.bullet, t.x, t.y + 18, a, 500 * g.mods.projSpeed, g.dmg(dmg), pierce, 0.8, 16, 5, 25);
          g.spawnFx('fx_spark_4', t.x + Math.cos(a) * 16, t.y + 18 + Math.sin(a) * 16, 16, { fps: 30 });
        } else t.cd = 0.15;
      }
    }
  }
  draw(g: Game, b: SpriteBatch): void {
    const s = 30 / this.anim.refH;
    for (const t of this.turrets) {
      b.quad(b.shadow, t.x, t.y + 1, -59, 30, 12, 0, false, 0, 1, 0.4);
      const blink = t.life < 2 && Math.floor(t.t * 6) % 2 === 0;
      b.sprite(this.anim.frames[0]!, t.x, t.y, Z_WEAPON - (t.y - g.camY) * 0.0005, s, 0, false, 0xffffff, t.flash > 0 ? 0.6 : 0, blink ? 0.4 : 1);
    }
  }
}

// ---------------------------------------------------------------- Drone
class Drone extends Weapon {
  private ang = 0;
  private cds: number[] = [];
  private readonly pos: { x: number; y: number; flash: number }[] = [];
  private readonly anim: Anim;
  private readonly laser: Anim;
  private t = 0;
  constructor(def: WeaponDef, g: Game) {
    super(def);
    this.anim = g.atlas.anim('w_drone', 0x66aadd);
    this.laser = g.atlas.anim(['proj_laser', 'proj_beam'], 0x66ddff);
  }
  private n(g: Game): number {
    return this.s()[2]! + g.mods.amount;
  }
  update(g: Game, dt: number): void {
    const p = g.player;
    const [dmg, interval, , pierce] = this.s() as [number, number, number, number];
    this.t += dt;
    this.ang += 1.7 * dt;
    const n = this.n(g);
    while (this.pos.length < n) {
      this.pos.push({ x: p.x, y: p.y, flash: 0 });
      this.cds.push(rand(0, 0.5));
    }
    for (let i = 0; i < n; i++) {
      const a = this.ang + (i / n) * TAU;
      const o = this.pos[i]!;
      const tx = p.x + Math.cos(a) * 60;
      const ty = p.y + 40 + Math.sin(a) * 24;
      const k = 1 - Math.exp(-8 * dt);
      o.x += (tx - o.x) * k;
      o.y += (ty - o.y) * k;
      if (o.flash > 0) o.flash -= dt;
      this.cds[i]! -= dt;
      if (this.cds[i]! <= 0) {
        const e = g.nearest(o.x, o.y, 300);
        if (e) {
          this.cds[i] = g.cdOf(interval);
          o.flash = 0.08;
          const a2 = g.aimAt(o.x, o.y, e);
          const q = g.fire(this.laser, o.x, o.y, a2, 600 * g.mods.projSpeed, g.dmg(dmg), pierce, 0.7, 24, 6, 20);
          q.tint = this.evo ? GOLD : 0xffffff;
          q.mix = this.evo ? 0.5 : 0;
        } else this.cds[i] = 0.15;
      }
      if (this.evo) g.pullGems(o.x, o.y, 120);
    }
  }
  draw(g: Game, b: SpriteBatch): void {
    const n = this.n(g);
    const s = (26 * this.esc) / this.anim.refH;
    for (let i = 0; i < n && i < this.pos.length; i++) {
      const o = this.pos[i]!;
      const bob = Math.sin(this.t * 6 + i) * 3;
      b.quad(b.shadow, o.x, o.y - 36, -59, 18, 8, 0, false, 0, 1, 0.25);
      const flash = o.flash > 0;
      b.sprite(this.anim.frames[0]!, o.x, o.y + bob, Z_WEAPON, s, Math.sin(this.t * 4 + i) * 0.1, o.x < g.player.x, flash ? 0xffffff : this.tint, flash ? 0.6 : this.tmix);
    }
  }
}

// ---------------------------------------------------------------- Cement mixer (ring shot)
class Mixer extends Weapon {
  private cd = 1.5;
  private readonly anim: Anim;
  constructor(def: WeaponDef, g: Game) {
    super(def);
    this.anim = g.atlas.anim(['proj_rock', 'proj_3'], 0x999999);
  }
  update(g: Game, dt: number): void {
    this.cd -= dt;
    if (this.cd > 0) return;
    const p = g.player;
    if (!g.nearest(p.x, p.y, 300)) {
      this.cd = 0.2;
      return;
    }
    const [dmg, cd, rocks, pierce] = this.s() as [number, number, number, number];
    this.cd = g.cdOf(cd);
    const n = rocks + g.mods.amount * 2;
    const off = rand(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * TAU;
      const q = g.fire(this.anim, p.x, p.y + 14, a, 220 * g.mods.projSpeed, g.dmg(dmg), pierce, 1.2, 22 * Math.sqrt(g.mods.area), 10, 80);
      q.spin = 6;
      q.hitFx = 'fx_dust';
      q.hitFxSize = 20;
    }
    g.spawnFx('fx_smoke_small', p.x, p.y + 6, 50, { fps: 14, alpha: 0.7 });
    swing(g);
  }
}

// ---------------------------------------------------------------- Barricade (aura)
class Barrier extends Weapon {
  private tk = 0.3;
  private t = 0;
  private readonly anim: Anim;
  private readonly ring: Anim;
  constructor(def: WeaponDef, g: Game) {
    super(def);
    this.anim = g.atlas.anim('w_barrier', 0xdd5533);
    this.ring = g.atlas.anim('fx_ring', 0xff8a1e);
  }
  private radius(g: Game): number {
    return this.s()[2]! * g.mods.area;
  }
  update(g: Game, dt: number): void {
    const p = g.player;
    const [tickDmg, tick, , kb, slow] = this.s() as [number, number, number, number, number];
    this.t += dt;
    const r = this.radius(g);
    // Permanent slow inside the radius
    if (slow > 0) {
      const n = g.hash.query(p.x, p.y, r + 40, g.scratch);
      for (let i = 0; i < n; i++) {
        const e = g.enemies[g.scratch[i]!]!;
        if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < r + e.r) {
          e.slowT = Math.max(e.slowT, 0.2);
          e.slowF = slow;
        }
      }
    }
    if (this.evo) g.pullGems(p.x, p.y, r);
    this.tk -= dt;
    if (this.tk > 0) return;
    this.tk = tick * Math.max(0.5, g.mods.cd);
    g.areaDamage(p.x, p.y, r, g.dmg(tickDmg), kb * g.mods.kb);
  }
  draw(g: Game, b: SpriteBatch): void {
    const p = g.player;
    const r = this.radius(g);
    const rf = this.ring.frames[Math.floor(this.t * 4) % this.ring.frames.length]!;
    b.quad(rf, p.x, p.y + 4, -58, r * 2.1, r * 2.1 * 0.8, 0, false, this.evo ? GOLD : 0xff8a1e, 1, 0.45);
    const n = this.evo ? 8 : 6;
    const s = 16 / this.anim.refH;
    const f = this.anim.frames[0]!;
    for (let i = 0; i < n; i++) {
      const a = this.t * 0.4 + (i / n) * TAU;
      const x = p.x + Math.cos(a) * r;
      const y = p.y + 6 + Math.sin(a) * r * 0.8;
      b.sprite(f, x, y, Z_WEAPON - (y - g.camY) * 0.0005, s, 0, false, this.tint, this.tmix);
    }
  }
}

// ---------------------------------------------------------------- Registry
const R = (rows: number[][]): number[][] => rows;

export const WEAPONS: WeaponDef[] = [
  {
    id: 'drill', icon: 'w_drill', max: 8,
    uses: ['dmg', 'cd', 'amount', 'projSpeed', 'kb', 'pierce'],
    cols: ['damage', 'cooldown', 'bits', 'pierce'],
    rows: R([[10, 1.0, 1, 1], [13, 1.0, 1, 1], [13, 1.0, 2, 1], [13, 0.9, 2, 2], [17, 0.9, 2, 2], [17, 0.85, 3, 2], [21, 0.8, 3, 3], [25, 0.75, 4, 3]]),
    evo: { passive: 'ibeam', row: [35, 0.6, 4, 99] },
    create: (g) => new Drill(WEAPONS[0]!, g),
  },
  {
    id: 'nailgun', icon: 'w_nailgun', max: 8,
    uses: ['dmg', 'cd', 'amount', 'projSpeed', 'kb', 'pierce'],
    cols: ['damage', 'cooldown', 'nails', 'pierce'],
    rows: R([[6, 0.55, 1, 0], [6, 0.55, 2, 0], [8, 0.55, 2, 0], [8, 0.5, 3, 0], [8, 0.5, 3, 1], [10, 0.45, 4, 1], [10, 0.45, 4, 1], [13, 0.4, 5, 2]]),
    create: (g) => new Nailgun(WEAPONS[1]!, g),
  },
  {
    id: 'saw', icon: 'w_saw', max: 8,
    uses: ['dmg', 'cd', 'amount', 'projSpeed', 'area', 'kb'],
    cols: ['damage', 'cooldown', 'blades', 'range'],
    rows: R([[12, 1.8, 1, 200], [16, 1.8, 1, 200], [16, 1.8, 2, 200], [20, 1.8, 2, 240], [20, 1.5, 2, 240], [20, 1.5, 3, 240], [26, 1.5, 3, 260], [32, 1.3, 3, 280]]),
    evo: { passive: 'blueprint', row: [40, 1.3, 4, 280] },
    create: (g) => new Saw(WEAPONS[2]!, g),
  },
  {
    id: 'hammer', icon: 'w_hammer', max: 8,
    uses: ['dmg', 'cd', 'area', 'kb'],
    cols: ['damage', 'cooldown', 'radius', 'slams'],
    rows: R([[20, 2.2, 70, 1], [26, 2.2, 78, 1], [32, 2.2, 86, 1], [32, 2.0, 86, 2], [40, 2.0, 94, 2], [46, 1.8, 94, 2], [46, 1.8, 104, 3], [58, 1.6, 110, 3]]),
    evo: { passive: 'gloves', row: [90, 1.5, 140, 3] },
    create: (g) => new Hammer(WEAPONS[3]!, g),
  },
  {
    id: 'jackhammer', icon: 'w_jackhammer', max: 8,
    uses: ['dmg', 'cd', 'amount', 'area'],
    cols: ['damage', 'cooldown', 'fields', 'radius'],
    rows: R([[14, 2.0, 2, 34], [18, 2.0, 2, 34], [18, 2.0, 3, 34], [22, 2.0, 3, 40], [22, 1.8, 4, 40], [28, 1.8, 4, 40], [28, 1.8, 5, 46], [36, 1.6, 6, 46]]),
    evo: { passive: 'boots', row: [40, 1.4, 10, 46] },
    create: (g) => new Jackhammer(WEAPONS[4]!, g),
  },
  {
    id: 'chainsaw', icon: 'w_chainsaw', max: 8,
    uses: ['dmg', 'cd', 'area', 'kb'],
    cols: ['damage', 'cooldown', 'range', 'sides'],
    rows: R([[12, 1.1, 90, 1], [15, 1.1, 100, 1], [18, 1.1, 100, 1], [18, 1.1, 100, 2], [22, 1.0, 115, 2], [26, 1.0, 115, 2], [26, 0.9, 130, 2], [34, 0.9, 140, 2]]),
    create: (g) => new Chainsaw(WEAPONS[5]!, g),
  },
  {
    id: 'wrench', icon: 'w_wrench', max: 8,
    uses: ['dmg', 'amount', 'area', 'projSpeed', 'kb'],
    cols: ['damage', 'wrenches', 'radius'],
    rows: R([[8, 2, 54], [10, 2, 54], [10, 3, 58], [13, 3, 58], [13, 4, 62], [16, 4, 66], [16, 5, 70], [20, 5, 75]]),
    evo: { passive: 'cone', row: [26, 7, 80] },
    create: (g) => new Wrench(WEAPONS[6]!, g),
  },
  {
    id: 'pipewrench', icon: 'w_pipewrench', max: 8,
    uses: ['dmg', 'cd', 'amount', 'area', 'projSpeed'],
    cols: ['damage', 'cooldown', 'throws', 'blast'],
    rows: R([[16, 2.0, 1, 40], [22, 2.0, 1, 46], [22, 2.0, 2, 46], [22, 2.0, 2, 54], [30, 1.8, 2, 54], [30, 1.8, 3, 54], [30, 1.6, 3, 60], [40, 1.6, 3, 66]]),
    create: (g) => new Pipewrench(WEAPONS[7]!, g),
  },
  {
    id: 'caulkgun', icon: 'w_caulkgun', max: 8,
    uses: ['dmg', 'cd', 'amount', 'area', 'duration'],
    cols: ['tickDamage', 'cooldown', 'puddles', 'radius', 'duration'],
    rows: R([[5, 3.0, 1, 40, 3.0], [5, 3.0, 1, 48, 3.0], [7, 3.0, 1, 48, 3.0], [7, 3.0, 2, 48, 3.0], [7, 3.0, 2, 48, 4.0], [9, 2.7, 2, 48, 4.0], [9, 2.7, 3, 48, 4.0], [12, 2.7, 3, 56, 4.5]]),
    evo: { passive: 'steelbar', row: [15, 2.7, 3, 56, 7] },
    create: (g) => new Caulk(WEAPONS[8]!, g),
  },
  {
    id: 'turret', icon: 'w_turret', max: 8,
    uses: ['dmg', 'cd', 'amount', 'duration', 'projSpeed', 'kb', 'pierce'],
    cols: ['damage', 'shotsPerSec', 'duration', 'turrets', 'cooldown', 'pierce'],
    rows: R([[6, 2, 8, 1, 10, 0], [8, 2, 8, 1, 10, 0], [8, 2, 12, 1, 10, 0], [8, 2, 12, 2, 10, 0], [8, 3, 12, 2, 9, 0], [11, 3, 12, 2, 9, 0], [11, 3, 12, 2, 9, 1], [11, 3.5, 14, 3, 8, 1]]),
    create: (g) => new Turret(WEAPONS[9]!, g),
  },
  {
    id: 'drone', icon: 'w_drone', max: 8,
    uses: ['dmg', 'cd', 'amount', 'projSpeed', 'kb', 'pierce'],
    cols: ['damage', 'interval', 'drones', 'pierce'],
    rows: R([[8, 0.8, 1, 0], [11, 0.8, 1, 0], [11, 0.65, 1, 0], [11, 0.65, 2, 0], [14, 0.65, 2, 0], [14, 0.65, 2, 1], [14, 0.55, 3, 1], [18, 0.55, 3, 1]]),
    evo: { passive: 'cementbag', row: [20, 0.45, 5, 1] },
    create: (g) => new Drone(WEAPONS[10]!, g),
  },
  {
    id: 'mixer', icon: 'w_mixer', max: 8,
    uses: ['dmg', 'cd', 'amount', 'projSpeed', 'kb', 'pierce'],
    cols: ['damage', 'cooldown', 'chunks', 'pierce'],
    rows: R([[14, 2.4, 4, 0], [14, 2.4, 5, 0], [18, 2.4, 5, 0], [18, 2.4, 6, 0], [18, 2.4, 6, 1], [18, 2.2, 7, 1], [23, 2.2, 7, 1], [23, 2.0, 8, 2]]),
    create: (g) => new Mixer(WEAPONS[11]!, g),
  },
  {
    id: 'barrier', icon: 'w_barrier', max: 8,
    uses: ['dmg', 'cd', 'area', 'kb'],
    cols: ['tickDamage', 'tick', 'radius', 'knockback', 'slow'],
    rows: R([[4, 0.6, 52, 40, 0], [4, 0.6, 60, 40, 0], [6, 0.6, 60, 50, 0], [6, 0.55, 68, 50, 0.1], [8, 0.55, 68, 60, 0.1], [8, 0.5, 76, 60, 0.15], [10, 0.5, 84, 70, 0.15], [12, 0.45, 90, 80, 0.2]]),
    evo: { passive: 'hook', row: [16, 0.35, 110, 80, 0.35] },
    create: (g) => new Barrier(WEAPONS[12]!, g),
  },
];

export const WEAPON_BY_ID: Record<string, WeaponDef> = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));


/** Level-up text: differences between level n-1 and n (numbers formatted per language). */
export function describeLevel(def: WeaponDef, level: number): string {
  if (level <= 1) return weaponText(def.id).desc;
  const a = def.rows[level - 2]!;
  const b = def.rows[level - 1]!;
  const parts: string[] = [];
  def.cols.forEach((c, i) => {
    if (a[i] !== b[i]) parts.push(`${t().cols[c]} ${num(a[i]!, 2)}→${num(b[i]!, 2)}`);
  });
  return parts.join(', ') || t().cols.stronger;
}
