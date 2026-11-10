import { TAU, rand } from '../core/util';
import { t } from '../i18n';
import type { Game } from './game';
import { Variant, type Enemy } from './entities';

export type EnemyAI = 'kamikaze' | 'charge' | 'ranged' | 'zigzag';

export interface EnemyDef {
  id: string;
  anim: string;
  color: number;
  height: number;
  r: number;
  hp: number;
  speed: number;
  dmg: number;
  xp: number;
  /** Knockback factor */
  kb: number;
  ai?: EnemyAI;
  /** 1 = Mixing Machine, 2 = Site Manager, 3 = Demolition Grab */
  boss?: 1 | 2 | 3;
  /** Machines leave rubble behind */
  machine?: boolean;
  /** The sprite faces left in the atlas (measured: zombies, brute, grab, mixer) */
  facesLeft?: boolean;
}

export const ENEMIES: Record<string, EnemyDef> = {
  zombie: { id: 'zombie', anim: 'e_zombie', color: 0x7a9a4a, height: 40, r: 11, hp: 10, speed: 40, dmg: 5, xp: 1, kb: 1.0, facesLeft: true },
  cone: { id: 'cone', anim: 'e_cone', color: 0xff7a1a, height: 34, r: 10, hp: 6, speed: 70, dmg: 4, xp: 1, kb: 1.2, ai: 'zigzag' },
  zombie2: { id: 'zombie2', anim: 'e_zombie2', color: 0x6a8a3a, height: 43, r: 12, hp: 22, speed: 48, dmg: 7, xp: 2, kb: 0.9, facesLeft: true },
  barrel: { id: 'barrel', anim: 'e_barrel', color: 0xc0462a, height: 42, r: 14, hp: 24, speed: 45, dmg: 12, xp: 3, kb: 0.8, ai: 'kamikaze', machine: true },
  barrier: { id: 'barrier', anim: 'e_barrier', color: 0xd8d0c0, height: 42, r: 15, hp: 70, speed: 26, dmg: 10, xp: 5, kb: 0.2, machine: true },
  brute: { id: 'brute', anim: 'e_brute', color: 0x8a6a4a, height: 60, r: 19, hp: 160, speed: 38, dmg: 14, xp: 12, kb: 0.3, ai: 'charge', facesLeft: true },
  mixer: { id: 'mixer', anim: 'e_mixer', color: 0xc8a020, height: 60, r: 22, hp: 60, speed: 32, dmg: 8, xp: 6, kb: 0.5, ai: 'ranged', machine: true, facesLeft: true },
  boss1: { id: 'boss1', anim: 'e_mixer', color: 0xc8a020, height: 132, r: 46, hp: 2000, speed: 30, dmg: 15, xp: 100, kb: 0, boss: 1, machine: true, facesLeft: true },
  boss2: { id: 'boss2', anim: 'e_brute', color: 0x8a6a4a, height: 156, r: 46, hp: 7000, speed: 42, dmg: 22, xp: 150, kb: 0, boss: 2, facesLeft: true },
  boss3: { id: 'boss3', anim: 'e_claw', color: 0xe0a010, height: 120, r: 42, hp: 22000, speed: 36, dmg: 25, xp: 300, kb: 0, boss: 3, machine: true, facesLeft: true },
};

export const hpMulAt = (m: number): number => 1 + 0.08 * m + 0.01 * m * m;
export const dmgMulAt = (m: number): number => 1 + 0.04 * m;
export const speedMulAt = (m: number): number => 1 + 0.01 * m;

interface VariantDef {
  tint: number;
  mix: number;
  scale: number;
  hp: number;
  speed: number;
  dmg: number;
  xp: number;
  kb: number;
}
export const VARIANTS: Record<number, VariantDef> = {
  [Variant.Normal]: { tint: 0xffffff, mix: 0, scale: 1, hp: 1, speed: 1, dmg: 1, xp: 1, kb: 1 },
  [Variant.Elite]: { tint: 0xffc83d, mix: 0.45, scale: 1.5, hp: 12, speed: 1, dmg: 1.5, xp: 10, kb: 0 },
  [Variant.Tank]: { tint: 0x7f9bb5, mix: 0.4, scale: 1.25, hp: 3, speed: 0.85, dmg: 1.2, xp: 3, kb: 0.3 },
  [Variant.Fast]: { tint: 0xff4a3a, mix: 0.4, scale: 0.9, hp: 0.8, speed: 1.5, dmg: 1, xp: 2, kb: 1 },
};

export const enum Mode {
  Normal = 0,
  Straight = 1,
  Ring = 2,
  Flee = 3,
}

/** Movement + AI per frame. */
export function updateEnemy(g: Game, e: Enemy, dt: number): void {
  const p = g.player;
  e.t += dt;
  if (e.flash > 0) e.flash -= dt;
  if (e.orbitCd > 0) e.orbitCd -= dt;
  if (e.orbitCd2 > 0) e.orbitCd2 -= dt;
  if (e.contactCd > 0) e.contactCd -= dt;
  if (e.ignoreProps > 0) e.ignoreProps -= dt;
  if (e.numCd > 0) e.numCd -= dt;

  let sp = e.speed * e.speedMul;
  if (e.slowT > 0) {
    e.slowT -= dt;
    sp *= 1 - e.slowF;
  }
  let dx = p.x - e.x;
  let dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d;
  dy /= d;
  const def = e.def;
  let still = false;

  if (g.freezeT > 0 || e.stunT > 0) {
    still = true;
    if (e.stunT > 0) e.stunT -= dt;
  } else if (e.mode === Mode.Straight) {
    dx = e.mvx;
    dy = e.mvy;
    sp = e.speed;
    e.life -= dt;
    if (e.life <= 0) {
      e.dead = true;
      e.noDrop = true;
    }
  } else if (e.mode === Mode.Flee) {
    dx = -dx;
    dy = -dy;
    sp = 130;
    e.alpha -= dt;
    if (e.alpha <= 0) {
      e.dead = true;
      e.noDrop = true;
    }
  } else if (e.mode === Mode.Ring) {
    // Position is set by the ring event
    still = true;
    const rr = g.ringR;
    e.x = p.x + Math.cos(e.ringA) * rr;
    e.y = p.y + Math.sin(e.ringA) * rr;
    if (rr <= 90) e.mode = Mode.Normal;
  } else if (def.boss) {
    const r = bossAI(g, e, dt, dx, dy, d);
    dx = r.dx;
    dy = r.dy;
    sp = r.sp;
  } else if (def.ai === 'zigzag') {
    const a = ((Math.sin((e.t * TAU) / 0.8) >= 0 ? 1 : -1) * 20 * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const ndx = dx * c - dy * s;
    dy = dx * s + dy * c;
    dx = ndx;
  } else if (def.ai === 'kamikaze') {
    if (e.st === 0) {
      if (d < 120) {
        e.st = 1;
        e.timer = 0;
      }
    } else if (e.st === 1) {
      still = true;
      e.timer += dt;
      e.flash = 0;
      if (e.timer >= 0.5) {
        e.st = 2;
        e.timer = 0;
        e.dx = dx;
        e.dy = dy;
      }
    } else {
      dx = e.dx;
      dy = e.dy;
      sp = 130;
      e.timer += dt;
      if (e.timer >= 1) {
        e.st = 0;
        e.timer = 0;
      }
    }
  } else if (def.ai === 'charge') {
    e.timer += dt;
    if (e.st === 0) {
      if (e.timer >= 6 && d < 220) {
        e.st = 1;
        e.timer = 0;
        e.dx = dx;
        e.dy = dy;
        g.spawnFx('fx_dust', e.x, e.y, 36, { fps: 14 });
      }
    } else if (e.st === 1) {
      still = true;
      if (e.timer >= 0.6) {
        e.st = 2;
        e.timer = 0;
      }
    } else {
      dx = e.dx;
      dy = e.dy;
      sp = 200;
      if (e.timer >= 0.7) {
        e.st = 0;
        e.timer = 0;
      }
    }
  } else if (def.ai === 'ranged') {
    e.timer += dt;
    if (d > 220) {
      /* move closer */
    } else if (d < 180) {
      dx = -dx;
      dy = -dy;
    } else {
      still = true;
    }
    if (e.timer >= 3.5 && d < 330) {
      e.timer = 0;
      g.fireEnemy(e.x, e.y + 20, Math.atan2(p.y - e.y, p.x - e.x), 140, 8, 2.5);
    }
  }

  // Trail of the fast variant
  if (e.variant === Variant.Fast && e.mode === Mode.Normal) {
    e.trailT -= dt;
    if (e.trailT <= 0) {
      e.trailT = 0.3;
      g.spawnFx('fx_dust', e.x, e.y, 20, { fps: 16, alpha: 0.6, ground: true });
    }
  }

  // Limit the approach to the player (they surround him)
  if (!still && !def.boss && d < p.r + e.r * 0.7 && e.mode === Mode.Normal && e.st !== 2) sp = 0;

  const px = e.x;
  const py = e.y;
  const vx = still ? 0 : dx * sp;
  const vy = still ? 0 : dy * sp;
  e.x += (vx + e.kx) * dt;
  e.y += (vy + e.ky) * dt;
  const decay = Math.exp(-10 * dt);
  e.kx *= decay;
  e.ky *= decay;
  if (!still && Math.abs(dx) > 0.15) e.flip = def.facesLeft ? dx > 0 : dx < 0;

  // Obstacles
  if (e.mode !== Mode.Ring && e.ignoreProps <= 0 && g.world.hasObstacles) {
    const bx = e.x;
    const by = e.y;
    let moved = g.world.resolve(e, e.r * 0.6, false);
    if (moved > 0.01 && sp > 0) {
      // push out along the normal, keep sliding tangentially
      const nx = e.x - bx;
      const ny = e.y - by;
      const nl = Math.hypot(nx, ny) || 1;
      let tx = -ny / nl;
      let ty = nx / nl;
      const dot = tx * dx + ty * dy;
      if (Math.abs(dot) < 0.15) {
        if (e.uid & 1) {
          tx = -tx;
          ty = -ty;
        }
      } else if (dot < 0) {
        tx = -tx;
        ty = -ty;
      }
      e.x += tx * sp * dt;
      e.y += ty * sp * dt;
      moved += g.world.resolve(e, e.r * 0.6, false) + sp * dt * 0.3;
    }
    const step = Math.hypot(e.x - px, e.y - py) + moved;
    if (step > 0.01 && moved > step * 0.5 && sp > 0) e.stuckT += dt;
    else e.stuckT = Math.max(0, e.stuckT - dt);
    if (e.stuckT > 1) {
      e.stuckT = 0;
      e.ignoreProps = 1.5;
    }
  }

  // too far away -> place on the spawn ring ahead of the player (HP is kept)
  if (!def.boss && e.mode === Mode.Normal && d > g.spawnR + 300) g.respawnEnemy(e);
}

function bossAI(g: Game, e: Enemy, dt: number, dx: number, dy: number, d: number): { dx: number; dy: number; sp: number } {
  const p = g.player;
  const def = e.def;
  let sp = e.speed;
  e.timer += dt;
  e.timer2 += dt;
  e.timer3 += dt;
  if (def.boss === 1) {
    if (e.timer >= 4) {
      e.timer = 0;
      const a0 = rand(0, TAU);
      for (let i = 0; i < 12; i++) g.fireEnemy(e.x, e.y + 30, a0 + (i / 12) * TAU, 130, 10, 3);
      g.spawnFx('fx_smoke_small', e.x, e.y + 20, 70, { fps: 12 });
    }
    if (e.timer2 >= 8) {
      e.timer2 = 0;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        g.addEnemy(ENEMIES.cone!, e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 60);
      }
    }
  } else if (def.boss === 2) {
    if (e.st === 0) {
      if (e.timer >= 5) {
        e.st = 1;
        e.timer = 0;
        e.dx = dx;
        e.dy = dy;
      }
      if (e.timer2 >= 7) {
        e.timer2 = 0;
        g.spawnFx('fx_ring', e.x, e.y, 280, { fps: 10, ground: true });
        g.spawnFx('fx_dust', e.x, e.y, 120, { fps: 12 });
        g.shake = Math.max(g.shake, 4);
        if (d < 140 + p.r) g.hurtPlayer(15, dx * 120, dy * 120);
      }
    } else if (e.st === 1) {
      sp = 0;
      e.dx = dx;
      e.dy = dy;
      if (e.timer >= 0.8) {
        e.st = 2;
        e.timer = 0;
      }
    } else {
      dx = e.dx;
      dy = e.dy;
      sp = 260;
      if (e.timer >= 0.7) {
        e.st = 0;
        e.timer = 0;
        e.timer2 = Math.min(e.timer2, 5);
      }
    }
  } else if (def.boss === 3) {
    if (e.timer >= 4) {
      e.timer = 0;
      const z = g.spawnZone(p.x, p.y);
      z.r = 70;
      z.dmg = 30;
      z.delay = z.delay0 = 1;
      z.life = 0.15;
      z.visual = 1;
      z.hostile = true;
      z.kb = 0;
    }
    if (e.timer2 >= 9) {
      e.timer2 = 0;
      for (let i = 0; i < 3; i++) g.addEnemy(ENEMIES.barrel!, e.x + (i - 1) * 50, e.y - 30);
    }
    if (e.timer3 >= 12) {
      e.timer3 = 0;
      g.suckT = 1.5;
      g.suckX = e.x;
      g.suckY = e.y;
      g.banner(t().banners.suction, '#ff9a2e');
    }
  }
  return { dx, dy, sp };
}
