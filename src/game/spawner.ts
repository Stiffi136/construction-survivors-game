import { TAU, rand, pick } from '../core/util';
import { bossName, t } from '../i18n';
import { ENEMIES, Mode, type EnemyDef } from './enemies';
import { Variant } from './entities';
import { TUNE } from './tune';
import type { Game } from './game';

/** Schedule (design 1.3): target, rate, weights zombie cone zombie2 barrel barrier brute mixer */
const SCHED: number[][] = [
  [15, 1.5, 100, 0, 0, 0, 0, 0, 0],
  [30, 2.5, 80, 20, 0, 0, 0, 0, 0],
  [45, 3.0, 60, 15, 25, 0, 0, 0, 0],
  [60, 3.5, 50, 15, 35, 0, 0, 0, 0],
  [75, 4.0, 40, 10, 35, 15, 0, 0, 0],
  [60, 3.0, 40, 10, 35, 15, 0, 0, 0],
  [100, 5.0, 30, 10, 35, 15, 0, 10, 0],
  [120, 5.5, 25, 0, 30, 15, 15, 15, 0],
  [140, 6.0, 15, 0, 30, 15, 15, 15, 10],
  [160, 7.0, 10, 0, 30, 15, 15, 15, 15],
  [140, 6.0, 10, 0, 30, 15, 15, 15, 15],
  [190, 8.0, 0, 0, 35, 15, 15, 20, 15],
  [210, 9.0, 0, 0, 30, 15, 20, 20, 15],
  [240, 10.0, 0, 0, 30, 15, 15, 25, 15],
  [270, 11.0, 0, 0, 25, 20, 15, 25, 15],
];
const IDS = ['zombie', 'cone', 'zombie2', 'barrel', 'barrier', 'brute', 'mixer'];

export interface Sched {
  target: number;
  rate: number;
  w: number[];
}
const tmp: Sched = { target: 0, rate: 0, w: [0, 0, 0, 0, 0, 0, 0] };

export function schedule(m: number): Sched {
  const mm = Math.min(Math.max(m, 0), 14);
  const i = Math.min(13, Math.floor(mm));
  const f = mm - i;
  const a = SCHED[i]!;
  const b = SCHED[i + 1]!;
  tmp.target = a[0]! + (b[0]! - a[0]!) * f;
  tmp.rate = a[1]! + (b[1]! - a[1]!) * f;
  for (let k = 0; k < 7; k++) tmp.w[k] = a[2 + k]! + (b[2 + k]! - a[2 + k]!) * f;
  return tmp;
}

interface Ev {
  t: number;
  run: (g: Game, s: Spawner) => void;
  done?: boolean;
}

export class Spawner {
  private acc = 0;
  private events: Ev[] = [];
  /** Quitting-time rush active until (game time) */
  rushUntil = 0;
  rushFrom = 0;
  /** Final phase started */
  finale = false;
  /** Event telegraphs for the renderer */
  warn: { t: number; x: number; y: number; dx: number; dy: number }[] = [];

  constructor(private readonly g: Game) {
    this.reset();
  }

  reset(): void {
    this.acc = 0;
    this.rushUntil = 0;
    this.rushFrom = 0;
    this.finale = false;
    this.warn.length = 0;
    const E = (t: number, run: Ev['run']): Ev => ({ t, run });
    this.events = [
      E(120, (_g, s) => s.coneSwarm(30)),
      E(180, (_g, s) => s.elite('zombie2', 1)),
      E(240, (_g, s) => s.ring(24, false)),
      E(300, (_g, s) => s.boss(ENEMIES.boss1!)),
      E(390, (_g, s) => s.barrelRain()),
      E(420, (_g, s) => s.elite('brute', 1)),
      E(450, (_g, s) => s.coneSwarm(40)),
      E(480, (_g, s) => s.dumpTruck()),
      E(540, (_g, s) => s.shiftChange()),
      E(600, (_g, s) => s.boss(ENEMIES.boss2!)),
      E(660, (_g, s) => s.ring(36, true)),
      E(720, (_g, s) => s.elite('mixer', 2)),
      E(750, (_g, s) => s.dumpTruck()),
      E(780, (_g, s) => s.coneSwarm(60)),
      E(810, (_g, s) => s.elite('zombie2', 3, Variant.Fast)),
      E(840, (_g, s) => s.rush()),
      E(900, (_g, s) => s.finaleStart()),
    ];
  }

  update(dt: number): void {
    const g = this.g;
    const t = g.time;
    for (const ev of this.events) {
      if (!ev.done && t >= ev.t) {
        ev.done = true;
        ev.run(g, this);
      }
    }
    for (let i = this.warn.length - 1; i >= 0; i--) {
      this.warn[i]!.t -= dt;
      if (this.warn[i]!.t <= 0) this.warn.splice(i, 1);
    }
    if (this.finale || t >= 900) return;
    const m = t / 60;
    const s = schedule(m);
    const alive = g.enemies.length;
    const rush = t >= this.rushFrom && t < this.rushUntil ? 2 : 1;
    this.acc += s.rate * dt * (alive < 0.5 * s.target ? 2 : 1) * (g.bossRef ? 0.6 : 1) * rush * g.spawnRateMul * (TUNE.rateEarly + (1 - TUNE.rateEarly) * Math.min(1, m / TUNE.rateMin));
    while (this.acc >= 1) {
      this.acc -= 1;
      if (alive >= g.cap) {
        this.acc = Math.min(this.acc, 1);
        break;
      }
      this.spawnOne(m, s);
    }
  }

  /** Weighted choice of an enemy type. */
  private choose(s: Sched): EnemyDef {
    let total = 0;
    for (let k = 0; k < 7; k++) total += s.w[k]!;
    let r = Math.random() * total;
    for (let k = 0; k < 7; k++) {
      r -= s.w[k]!;
      if (r <= 0) return ENEMIES[IDS[k]!]!;
    }
    return ENEMIES.zombie!;
  }

  /** Spawn position: 60% in the half circle of the walking direction, 40% all around. */
  spawnPos(): [number, number] {
    const g = this.g;
    const p = g.player;
    let a: number;
    if (Math.random() < 0.6 && (p.fx !== 0 || p.fy !== 0)) a = Math.atan2(p.fy, p.fx) + rand(-Math.PI / 2, Math.PI / 2);
    else a = rand(0, TAU);
    const d = g.spawnR + rand(30, 90) - 40;
    return [p.x + Math.cos(a) * d, p.y + Math.sin(a) * d];
  }

  private spawnOne(m: number, s: Sched): void {
    const g = this.g;
    const def = this.choose(s);
    let v = Variant.Normal;
    if (def.id !== 'cone' && def.id !== 'barrel') {
      const pv = Math.min(0.08, Math.max(0, (m - 5) * 0.01));
      const r = Math.random();
      if (r < pv) v = Variant.Tank;
      else if (r < pv * 2) v = Variant.Fast;
    }
    for (let tries = 0; tries < 3; tries++) {
      const [x, y] = this.spawnPos();
      if (g.world.blocked(x, y)) continue;
      g.addEnemy(def, x, y, v);
      return;
    }
  }

  // ------------------------------------------------------------ Events
  elite(id: string, n: number, v: Variant = Variant.Elite): void {
    const g = this.g;
    for (let i = 0; i < n; i++) {
      const [x, y] = this.spawnPos();
      const e = g.addEnemy(ENEMIES[id]!, x, y, v === Variant.Fast ? Variant.Elite : v, true);
      if (e && v === Variant.Fast) {
        // Fast elite: quick + golden
        e.speed *= 1.5;
        e.speedMul = 1;
      }
    }
    g.banner(n > 1 ? t().banners.elites(n) : t().banners.elite, '#ffc83d');
  }

  boss(def: EnemyDef): void {
    const g = this.g;
    const [x, y] = this.spawnPos();
    const e = g.addEnemy(def, x, y, Variant.Normal, true);
    if (e) {
      g.bossRef = e;
      g.banner(t().banners.bossWarn(bossName(def.boss ?? 0)), '#ff4a2e');
      g.shake = Math.max(g.shake, 4);
    }
  }

  coneSwarm(n: number): void {
    const g = this.g;
    const p = g.player;
    const a = rand(0, TAU);
    const dirx = -Math.cos(a);
    const diry = -Math.sin(a);
    const px = -diry;
    const py = dirx;
    const dist = g.spawnR + 30;
    const rows = n > 40 ? 2 : 1;
    const per = Math.ceil(n / rows);
    const sx = p.x + Math.cos(a) * dist;
    const sy = p.y + Math.sin(a) * dist;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < per; i++) {
        const o = (i - (per - 1) / 2) * 26;
        const e = g.addEnemy(ENEMIES.cone!, sx + px * o - dirx * r * 30, sy + py * o - diry * r * 30);
        if (e) {
          e.mode = Mode.Straight;
          e.mvx = dirx;
          e.mvy = diry;
          e.speed = 110;
          e.life = 8;
          e.maxHp = e.hp = ENEMIES.cone!.hp;
        }
      }
    }
    this.warn.push({ t: 1.5, x: Math.cos(a), y: Math.sin(a), dx: px, dy: py });
    g.banner(t().banners.coneSwarm, '#ff7a1a');
  }

  ring(n: number, withBrutes: boolean): void {
    const g = this.g;
    g.ringR = 300;
    for (let i = 0; i < n; i++) {
      const brute = withBrutes && i % 4 === 3;
      const e = g.addEnemy(ENEMIES[brute ? 'brute' : 'barrier']!, g.player.x, g.player.y, Variant.Normal, true);
      if (e) {
        e.mode = Mode.Ring;
        e.ringA = (i / n) * TAU;
        if (!brute) e.maxHp = e.hp = Math.round(e.hp * 0.5);
      }
    }
    g.ringActive = true;
    g.banner(t().banners.ring, '#ff9a2e');
  }

  barrelRain(): void {
    const g = this.g;
    const a = rand(0, TAU);
    const dirx = Math.cos(a);
    const diry = Math.sin(a);
    const px = -diry;
    const py = dirx;
    const sx = g.player.x + dirx * (g.spawnR + 40);
    const sy = g.player.y + diry * (g.spawnR + 40);
    for (let i = 0; i < 20; i++) {
      const col = i % 5;
      const row = Math.floor(i / 5);
      g.addEnemy(ENEMIES.barrel!, sx + px * (col - 2) * 30 + dirx * row * 30, sy + py * (col - 2) * 30 + diry * row * 30);
    }
    g.banner(t().banners.barrelRain, '#e0602a');
  }

  shiftChange(): void {
    const g = this.g;
    const a = rand(0, TAU);
    const dirx = Math.cos(a);
    const diry = Math.sin(a);
    const px = -diry;
    const py = dirx;
    const d0 = g.spawnR + 40;
    let k = 0;
    for (let row = 0; row < 8; row++) {
      const cnt = Math.min(60 - k, 4 + row * 2);
      for (let i = 0; i < cnt; i++) {
        const o = (i - (cnt - 1) / 2) * 24;
        const e = g.addEnemy(ENEMIES[pick(['zombie', 'zombie', 'zombie2'])]!, g.player.x + dirx * (d0 + row * 26) + px * o, g.player.y + diry * (d0 + row * 26) + py * o);
        if (e) e.speedMul = 1.3;
        k++;
      }
    }
    g.banner(t().banners.shiftChange, '#ffc83d');
  }

  rush(): void {
    this.rushFrom = this.g.time;
    this.rushUntil = this.g.time + 30;
    this.g.banner(t().banners.rush, '#ff8a1e');
  }

  dumpTruck(): void {
    this.g.startDumpTruck();
  }

  finaleStart(): void {
    const g = this.g;
    this.finale = true;
    g.startFinale();
  }

}
