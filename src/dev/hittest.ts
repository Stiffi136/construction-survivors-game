import { TAU, rand } from '../core/util';
import { ENEMIES } from '../game/enemies';
import type { Game } from '../game/game';

/**
 * Hit test: fast projectiles against enemies at fixed positions.
 * Shots aim at a random point inside the visible body core of the sprite (60% width, 12–88% height),
 * so every shot "should" hit. Measured:
 *  - "before": the old rule (per-frame point test against a circle around the FEET, radius e.r + p.r),
 *  - "after": the real engine (swept test against the body center, radius e.hr + p.r).
 */
interface Shot { name: string; speed: number; r: number }
const SHOTS: Shot[] = [
  { name: 'Bohrer', speed: 380, r: 6 },
  { name: 'Nagel', speed: 520, r: 5 },
  { name: 'Laser', speed: 600, r: 6 },
  { name: 'Turm', speed: 500, r: 5 },
  { name: 'Betonbrocken', speed: 220, r: 10 },
];
const TYPES = ['zombie', 'cone', 'zombie2', 'barrel', 'brute', 'mixer'];

export interface HitRow { weapon: string; dt: string; before: number; after: number; shots: number }

export function hitTest(g: Game, shotsPer = 300): HitRow[] {
  g.start('hammer');
  g.weapons.length = 0;
  g.state = 'playing';
  const priv = g as unknown as { updateProjectiles(dt: number): void };
  const rows: HitRow[] = [];
  const anim = g.atlas.anim('proj_bullet');
  for (const dtDen of [60, 20]) {
    const dt = 1 / dtDen;
    for (const s of SHOTS) {
      let before = 0;
      let after = 0;
      let n = 0;
      for (const type of TYPES) {
        const def = ENEMIES[type]!;
        const an = g.atlas.anim(def.anim);
        const fr = an.frames[0]!;
        for (let i = 0; i < shotsPer / TYPES.length; i++) {
          g.enemies.length = 0;
          g.projs.length = 0;
          const ang = rand(0, TAU);
          const dist = rand(60, 330);
          const e = g.addEnemy(def, Math.cos(ang) * dist, Math.sin(ang) * dist)!;
          e.speed = 0;
          e.hp = e.maxHp = 1e9;
          e.kbF = 0;
          const sc = def.height / an.refH;
          const w = fr.w * sc;
          const h = def.height;
          const ax = e.x + rand(-0.3, 0.3) * w;
          const ay = e.y + rand(0.12, 0.88) * h;
          const ox = 0;
          const oy = 20;
          const a = Math.atan2(ay - oy, ax - ox);
          const vx = Math.cos(a) * s.speed;
          const vy = Math.sin(a) * s.speed;
          n++;
          // before: old point test against a circle around the feet
          let x = ox;
          let y = oy;
          for (let k = 0; k < 2 / dt; k++) {
            x += vx * dt;
            y += vy * dt;
            if (Math.hypot(x - e.x, y - e.y) < s.r + e.r) {
              before++;
              break;
            }
          }
          // after: real engine
          g.fire(anim, ox, oy, a, s.speed, 1, 0, 2, 16, s.r, 0, true);
          const hp0 = e.hp;
          for (let k = 0; k < 2 / dt && g.projs.length > 0; k++) {
            g.hash.clear();
            g.enemies.forEach((en, idx) => g.hash.insert(idx, en.x, en.y));
            priv.updateProjectiles(dt);
          }
          if (e.hp < hp0) after++;
        }
      }
      rows.push({ weapon: s.name, dt: `1/${dtDen}`, before: Math.round((before / n) * 1000) / 10, after: Math.round((after / n) * 1000) / 10, shots: n });
    }
  }
  g.enemies.length = 0;
  g.projs.length = 0;
  return rows;
}
