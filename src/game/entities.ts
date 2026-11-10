import type { Anim } from '../atlas';
import type { EnemyDef } from './enemies';

export const enum Variant {
  Normal = 0,
  Elite = 1,
  Tank = 2,
  Fast = 3,
}

export class Enemy {
  uid = 0;
  def!: EnemyDef;
  x = 0;
  y = 0;
  kx = 0;
  ky = 0;
  hp = 1;
  maxHp = 1;
  r = 10;
  /** Hit radius for projectiles (sprite width), center = feet + cy */
  hr = 10;
  /** Height of the body center above the feet */
  cy = 18;
  speed = 40;
  dmg = 5;
  flash = 0;
  /** Slow: remaining time, factor in slowF */
  slowT = 0;
  slowF = 0.5;
  stunT = 0;
  t = 0;
  flip = false;
  dead = false;
  boss = false;
  xp = 1;
  variant: Variant = Variant.Normal;
  scaleMul = 1;
  kbF = 1;
  tint = 0xffffff;
  tintMix = 0;
  /** Contact damage cooldown */
  contactCd = 0;
  /** AI state machine */
  st = 0;
  timer = 0;
  timer2 = 0;
  timer3 = 0;
  dx = 0;
  dy = 0;
  /** Cooldowns against multiple hits from orbit weapons */
  orbitCd = 0;
  orbitCd2 = 0;
  /** Currently active special AI (cone swarm, barricade ring, wedge …) */
  mode = 0;
  mvx = 0;
  mvy = 0;
  life = 0;
  ringA = 0;
  speedMul = 1;
  alpha = 1;
  ignoreProps = 0;
  stuckT = 0;
  trailT = 0;
  /** Accumulated damage number (at most every 0.15 s per enemy) */
  numCd = 0;
  numAcc = 0;
  noDrop = false;
  exploded = false;
}

export const enum PKind {
  Linear = 0,
  Boomerang = 1,
  Lob = 2,
}

export class Projectile {
  kind = PKind.Linear;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  r = 8;
  dmg = 1;
  pierce = 0;
  life = 1;
  kb = 40;
  anim!: Anim;
  /** Target height in world units */
  size = 16;
  spin = 0;
  rot = 0;
  t = 0;
  hits = new Int32Array(48);
  nHits = 0;
  rehit = 0;
  rehitT = 0;
  tint = 0xffffff;
  mix = 0;
  hitFx = 'fx_spark';
  hitFxSize = 18;
  // Boomerang
  phase = 0;
  ox = 0;
  oy = 0;
  range = 200;
  /** Evolution: orbit the player for 1 s after returning */
  orbitEnd = false;
  orbitT = 0;
  orbitA = 0;
  // Lob
  sx = 0;
  sy = 0;
  tx = 0;
  ty = 0;
  dur = 1;
  blast = 40;
  /** 0 = explosion, 1 = puddle */
  land = 0;
  puddle = 0;
  /** Trail made of fx_dust */
  trail = false;
  trailT = 0;
  hasHit(uid: number): boolean {
    for (let i = 0; i < this.nHits; i++) if (this.hits[i] === uid) return true;
    return false;
  }
  addHit(uid: number): void {
    if (this.nHits < this.hits.length) this.hits[this.nHits++] = uid;
  }
}

/** Enemy projectile (red tinted). */
export class EProj {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  r = 8;
  dmg = 8;
  life = 2;
  t = 0;
  rot = 0;
}

export class Zone {
  /** 0 = circle, 1 = cone/arc */
  shape = 0;
  x = 0;
  y = 0;
  r = 40;
  dir = 0;
  half = 1;
  dmg = 1;
  kb = 60;
  /** Delay until activation (telegraph) */
  delay = 0;
  delay0 = 0;
  /** Remaining lifetime after activation (persistent zone if tick > 0) */
  life = 0;
  life0 = 0;
  tick = 0;
  tickT = 0;
  slow = 0;
  activated = false;
  /** Visibility: 0 none, 1 telegraph disc, 2 persistent disc */
  visual = 0;
  color = 0xffffff;
  t = 0;
  /** Puddle grows from r0 to r1 (evolution) */
  r0 = 0;
  r1 = 0;
  stun = 0;
  fxT = 0;
  shake = 0;
  /** Hostile zone (boss grab): hurts the player */
  hostile = false;
}

export class Fx {
  anim!: Anim;
  x = 0;
  y = 0;
  size = 40;
  delay = 0;
  t = 0;
  fps = 14;
  loop = false;
  life = 0;
  alpha = 1;
  tint = 0xffffff;
  mix = 0;
  rot = 0;
  vy = 0;
  followPlayer = false;
  zOff = 0;
  flip = false;
  /** Corpses: shrink to ×0.6 */
  shrink = false;
  /** Ground level (below units) */
  ground = false;
}

export class DamageNumber {
  x = 0;
  y = 0;
  vy = 40;
  t = 0;
  life = 0.7;
  val = 0;
  tint = 0xffffff;
  scale = 1;
}

export const enum PickKind {
  Gem = 0,
  Heal = 1,
  Magnet = 2,
  Chest = 3,
  Coin = 4,
  Energy = 5,
  Beacon = 6,
}

export class Pickup {
  kind = PickKind.Gem;
  x = 0;
  y = 0;
  value = 1;
  pulled = false;
  speed = 0;
  t = 0;
}
