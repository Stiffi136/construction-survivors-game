import * as THREE from 'three';
import type { Anim, Atlas } from '../atlas';
import { AudioFx } from '../core/audio';
import type { Input } from '../core/input';
import { SpatialHash } from '../core/spatialhash';
import { TAU, clamp, rand } from '../core/util';
import type { SpriteBatch } from '../render/batch';
import type { Ground } from '../render/ground';
import { CHARACTERS, type CharacterDef } from './characters';
import { ENEMIES, Mode, VARIANTS, dmgMulAt, hpMulAt, speedMulAt, updateEnemy, type EnemyDef } from './enemies';
import { DamageNumber, EProj, Enemy, Fx, PKind, PickKind, Pickup, Projectile, Variant, Zone } from './entities';
import { YARD_ITEMS, yardLevel, charUnlocked, loadMeta, saveMeta, weaponUnlocked, type Meta } from './meta';
import { PASSIVES, PASSIVE_BY_ID, baseMods, type Mods } from './passives';
import { Spawner } from './spawner';
import { bossName, num, passiveText, t, weaponText } from '../i18n';
import { TUNE } from './tune';
import { WEAPON_BY_ID, WEAPONS, describeLevel, type Weapon } from './weapons';
import { World, type Destructible } from './world';

export type GameState = 'menu' | 'playing' | 'paused' | 'levelup' | 'dying' | 'gameover' | 'win';

export interface UpgradeOption {
  id: string;
  kind: 'weapon' | 'passive' | 'heal';
  name: string;
  icon: string;
  level: number;
  max: number;
  desc: string;
  isNew: boolean;
  /** Evolution hint: the counterpart (icon, name) is already owned */
  evo?: { icon: string; partner: string; name: string; cond: string };
}

export interface ChestReward {
  icon: string;
  name: string;
  text: string;
  evo: boolean;
}

export interface Summary {
  time: number;
  kills: number;
  level: number;
  /** Character ID (name is resolved per language in the UI) */
  character: string;
  best: number;
  coins: number;
  coinsKills: number;
  coinsTime: number;
  coinsBoss: number;
  won: boolean;
  survivedShift: boolean;
  /** Unlock IDs (texts: i18n `unlocks`) */
  unlocks: string[];
}

export interface UIHooks {
  levelUp(opts: UpgradeOption[]): void;
  chest(rewards: ChestReward[]): void;
  gameOver(s: Summary): void;
  win(s: Summary): void;
  banner(text: string, color: string): void;
  hud(g: Game): void;
  hideAll(): void;
  hurt(strength: number): void;
}

export class Player {
  x = 0;
  y = 0;
  hp = 100;
  maxHp = 100;
  speed = 110;
  r = 12;
  flip = false;
  iframes = 0;
  animT = 0;
  attackT = 0;
  hurtT = 0;
  moving = false;
  fx = 1;
  fy = 0;
  kx = 0;
  ky = 0;
}

const Z_SHADOW = -60;
const Z_PICK = -40;
const Z_UNIT = -20;
const Z_PROJ = -10;
const Z_FX = -5;
const Z_NUM = 0;

export const MAX_WEAPONS = 6;
export const MAX_PASSIVES = 6;

interface Truck {
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** negative = telegraph */
  t: number;
  travelled: number;
  total: number;
  hit: Set<number>;
  hitPlayer: boolean;
}

interface Arena {
  x: number;
  y: number;
  t: number;
  fade: number;
}

export class Game {
  state: GameState = 'menu';
  ui!: UIHooks;
  readonly world: World;
  readonly audio = new AudioFx();
  meta: Meta;
  cheat = false;

  readonly camera: THREE.OrthographicCamera;
  readonly player = new Player();
  char: CharacterDef = CHARACTERS[0]!;
  mods: Mods = baseMods();

  viewW = 400;
  viewH = 700;
  camX = 0;
  camY = 0;
  shake = 0;
  mobile = true;

  time = 0;
  kills = 0;
  level = 1;
  xp = 0;
  xpNeed = 5;
  pendingLevelUps = 0;
  pendingChests = 0;
  frameNo = 0;
  lvSlow = 0;
  lvSlowDone = false;
  hitStop = 0;
  hitStopCd = 0;
  dyingT = 0;
  runCoins = 0;
  coinsBoss = 0;
  coinsKills = 0;
  reviveLeft = 0;
  overtimeT = 0;
  freezeT = 0;
  suckT = 0;
  suckX = 0;
  suckY = 0;
  ringR = 300;
  ringActive = false;
  mixerBeatenRun = false;
  unlocksNow: string[] = [];

  // Limits (section 8.1)
  cap = 300;
  capMax = 300;
  fxCap = 120;
  projCap = 300;
  eprojCap = 40;
  numCap = 50;
  spawnRateMul = 1;
  spawnR = 400;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private goodT = 0;
  halfFx = false;

  enemies: Enemy[] = [];
  private enemyPool: Enemy[] = [];
  readonly hash = new SpatialHash(768, 64);
  readonly scratch = new Int32Array(768);
  projs: Projectile[] = [];
  private projPool: Projectile[] = [];
  eprojs: EProj[] = [];
  private eprojPool: EProj[] = [];
  zones: Zone[] = [];
  private zonePool: Zone[] = [];
  fxs: Fx[] = [];
  private fxPool: Fx[] = [];
  nums: DamageNumber[] = [];
  private numPool: DamageNumber[] = [];
  pickups: Pickup[] = [];
  private pickPool: Pickup[] = [];
  weapons: Weapon[] = [];
  passiveLevels = new Map<string, number>();
  private uidCounter = 1;
  bossRef: Enemy | null = null;
  truck: Truck | null = null;
  arena: Arena | null = null;
  finaleOn = false;

  readonly spawner: Spawner;
  private readonly enemyAnims = new Map<string, Anim>();
  private walk!: Anim;
  private attack!: Anim;
  private readonly aBolt: Anim;
  private readonly aCoin: Anim;
  private readonly aHeal: Anim;
  private readonly aMagnet: Anim;
  private readonly aChest: Anim;
  private readonly aEnergy: Anim;
  private readonly aBeacon: Anim;
  private readonly aRock: Anim;
  private readonly aTruck: Anim;
  private readonly aLight: Anim;
  private readonly aFence: Anim;
  private readonly aFenceSign: Anim;
  private readonly aRing: Anim;
  private readonly hitT = new Float64Array(32);
  private readonly hitE: (Enemy | undefined)[] = new Array<Enemy | undefined>(32);
  debugHit = false;
  private runRand = 1;

  constructor(
    readonly atlas: Atlas,
    readonly batch: SpriteBatch,
    readonly ground: Ground,
    readonly input: Input,
  ) {
    this.camera = new THREE.OrthographicCamera(-200, 200, 350, -350, 1, 500);
    this.camera.position.z = 100;
    this.world = new World(atlas);
    this.spawner = new Spawner(this);
    for (const d of Object.values(ENEMIES)) this.enemyAnims.set(d.id, atlas.anim(d.anim, d.color, true));
    this.aBolt = atlas.anim('i_bolt', 0x5ae0ff);
    this.aCoin = atlas.anim('i_gear', 0xffc83d);
    this.aHeal = atlas.anim('m_medkit', 0xffffff);
    this.aMagnet = atlas.anim('i_magnet', 0xff4444);
    this.aChest = atlas.anim('i_toolbox', 0xffc400);
    this.aEnergy = atlas.anim('i_energy', 0xffe14a);
    this.aBeacon = atlas.anim('i_beacon', 0xff9a2e);
    this.aRock = atlas.anim(['proj_rock', 'proj_3'], 0xff8a6a);
    this.aTruck = atlas.anim('v_dump_truck', 0xe0a010, true);
    this.aLight = atlas.anim('s_trafficlight', 0xff3333, true);
    this.aFence = atlas.anim('b_fence', 0x777777, true);
    this.aFenceSign = atlas.anim('b_fence_sign', 0xaaaa33, true);
    this.aRing = atlas.anim('fx_ring', 0xffc400);
    this.meta = loadMeta();
    this.audio.volume = this.meta.settings.volume;
    this.cheat = /[?&]unlock/.test(location.search);
  }

  // ------------------------------------------------------------------ Setup
  resize(w: number, h: number): void {
    const short = Math.min(w, h);
    const viewMin = 400;
    const k = viewMin / short;
    this.viewW = w * k;
    this.viewH = h * k;
    this.mobile = short < 700 || (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
    this.capMax = this.mobile ? 300 : 450;
    this.cap = Math.min(this.cap || this.capMax, this.capMax);
    if (this.state === 'menu') this.cap = this.capMax;
    this.fxCap = this.mobile ? 120 : 250;
    this.projCap = this.mobile ? 300 : 500;
    this.eprojCap = this.mobile ? 40 : 60;
    this.numCap = this.mobile ? 50 : 100;
    this.world.maxProps = this.mobile ? 60 : 120;
    this.world.maxDestruct = this.mobile ? 12 : 20;
    this.spawnR = 0.5 * Math.hypot(this.viewW, this.viewH) + 60;
    const c = this.camera;
    c.left = -this.viewW / 2;
    c.right = this.viewW / 2;
    c.top = this.viewH / 2;
    c.bottom = -this.viewH / 2;
    c.updateProjectionMatrix();
    this.ground.resize(this.viewW, this.viewH);
  }

  start(charId: string): void {
    this.char = CHARACTERS.find((c) => c.id === charId) ?? CHARACTERS[0]!;
    for (const e of this.enemies) this.enemyPool.push(e);
    this.enemies.length = 0;
    this.hash.clear();
    this.projPool.push(...this.projs);
    this.projs.length = 0;
    this.eprojPool.push(...this.eprojs);
    this.eprojs.length = 0;
    this.zonePool.push(...this.zones);
    this.zones.length = 0;
    this.fxPool.push(...this.fxs);
    this.fxs.length = 0;
    this.numPool.push(...this.nums);
    this.nums.length = 0;
    this.pickPool.push(...this.pickups);
    this.pickups.length = 0;
    this.weapons = [];
    this.passiveLevels.clear();
    this.bossRef = null;
    this.truck = null;
    this.arena = null;
    this.finaleOn = false;
    this.time = 0;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNeed = this.xpFor(1);
    this.pendingLevelUps = 0;
    this.pendingChests = 0;
    this.lvSlow = 0;
    this.lvSlowDone = false;
    this.hitStop = 0;
    this.dyingT = 0;
    this.shake = 0;
    this.runCoins = 0;
    this.coinsBoss = 0;
    this.coinsKills = 0;
    this.overtimeT = 0;
    this.freezeT = 0;
    this.suckT = 0;
    this.ringActive = false;
    this.mixerBeatenRun = false;
    this.unlocksNow = [];
    this.cap = this.capMax;
    this.halfFx = false;
    this.spawnRateMul = 1;
    this.reviveLeft = yardLevel(this.meta, 'revive');
    this.runRand = 1 + Math.floor(Math.random() * 100000);
    this.world.reset(this.runRand);
    this.world.time = 0;
    this.spawner.reset();
    this.ground.setNight(false);
    const p = this.player;
    p.x = p.y = 0;
    p.flip = false;
    p.iframes = 0;
    p.attackT = 0;
    p.hurtT = 0;
    p.animT = 0;
    p.fx = 1;
    p.fy = 0;
    p.kx = p.ky = 0;
    this.walk = this.atlas.anim(this.char.walk, this.char.color, true);
    this.attack = this.atlas.anim(this.char.attack, this.char.color, true);
    this.state = 'playing';
    this.recalc();
    p.hp = p.maxHp;
    this.addWeapon(this.char.weapon);
    this.input.reset();
    this.audio.unlock();
    this.ui.hideAll();
  }

  /** Design 8: XP needed for level L → L+1 */
  xpFor(L: number): number {
    let n = 5;
    for (let l = 2; l <= L; l++) n += l < 20 ? 10 : l < 40 ? 13 : 16;
    return L <= TUNE.xpEarlyN ? Math.max(2, Math.round(n * TUNE.xpEarly)) : n;
  }

  recalc(): void {
    const m = baseMods();
    for (const [id, lvl] of this.passiveLevels) PASSIVE_BY_ID[id]?.apply(m, lvl);
    // Site yard
    const bh = (id: string): number => yardLevel(this.meta, id);
    m.dmg += 0.05 * bh('might');
    m.maxHp += 10 * bh('maxhp');
    m.armor += bh('armor');
    m.regen += 0.1 * bh('regen');
    m.move += 0.05 * bh('speed');
    m.area += 0.05 * bh('area');
    m.cd -= 0.03 * bh('cd');
    m.magnet *= 1 + 0.2 * bh('magnet');
    m.xp += 0.05 * bh('growth');
    m.luck += 0.05 * bh('luck');
    // Character
    const c = this.char;
    m.dmg *= c.dmg ?? 1;
    m.xp *= c.xp ?? 1;
    m.cd -= c.cd ?? 0;
    m.armor += c.armor ?? 0;
    m.cd = Math.max(0.5, m.cd);
    this.mods = m;
    const p = this.player;
    const old = p.maxHp;
    p.maxHp = c.hp + m.maxHp;
    if (p.maxHp > old && this.state !== 'menu') p.hp += p.maxHp - old;
    p.hp = Math.min(p.hp, p.maxHp);
    p.speed = c.speed * m.move;
  }

  /** Damage: base × mods.dmg × fury bonus. */
  dmg(base: number): number {
    let m = this.mods.dmg;
    const c = this.char;
    if (TUNE.earlyDmg > 0) m *= 1 + TUNE.earlyDmg * Math.max(0, 1 - this.time / 60 / TUNE.earlyMin);
    if (c.rageBelow && this.player.hp < this.player.maxHp * c.rageBelow) m *= c.rageDmg ?? 1;
    return base * m;
  }

  cdOf(base: number): number {
    return base * this.mods.cd * (this.overtimeT > 0 ? 0.75 : 1);
  }

  addWeapon(id: string): void {
    const def = WEAPON_BY_ID[id];
    if (!def) return;
    this.weapons.push(def.create(this));
  }

  banner(text: string, color = '#ffc400'): void {
    this.ui.banner(text, color);
  }

  // ------------------------------------------------------------------ Pauses / states
  /** Calm the camera: no leftover shake from a pause. */
  private calm(): void {
    this.shake = 0;
  }

  togglePause(): void {
    if (this.state === 'playing') {
      this.calm();
      this.state = 'paused';
      this.input.reset();
      this.ui.hud(this);
    } else if (this.state === 'paused') {
      this.resume();
    }
  }

  resume(): void {
    if (this.state === 'paused') {
      this.state = 'playing';
      this.ui.hideAll();
    }
  }

  toMenu(): void {
    this.calm();
    this.state = 'menu';
    this.ui.hideAll();
  }

  // ------------------------------------------------------------------ Spawning helpers
  addEnemy(def: EnemyDef, x: number, y: number, variant: Variant = Variant.Normal, ignoreCap = false): Enemy | null {
    if (!ignoreCap && !def.boss && this.enemies.length >= this.cap + 40) return null;
    const e = this.enemyPool.pop() ?? new Enemy();
    const v = VARIANTS[variant]!;
    const m = this.time / 60;
    e.uid = this.uidCounter++;
    e.def = def;
    e.x = x;
    e.y = y;
    e.kx = e.ky = 0;
    e.variant = variant;
    e.scaleMul = v.scale;
    e.tint = v.tint;
    e.tintMix = v.mix;
    e.kbF = def.kb * v.kb;
    e.maxHp = e.hp = Math.max(1, def.boss ? def.hp : Math.floor(def.hp * hpMulAt(m) * v.hp + 1e-6));
    e.r = def.r * v.scale;
    {
      // Body center and hit radius from the visible sprite: projectiles hit what you can see
      const an = this.enemyAnims.get(def.id)!;
      const fr = an.frames[0]!;
      const sc = (def.height * v.scale) / an.refH;
      e.cy = def.height * v.scale * 0.42;
      e.hr = Math.max(e.r, fr.w * sc * 0.34);
    }
    e.speed = def.speed * speedMulAt(m) * v.speed * rand(0.95, 1.05);
    e.speedMul = 1;
    e.dmg = Math.max(1, Math.round(def.dmg * dmgMulAt(m) * v.dmg * (TUNE.warmDmg + (1 - TUNE.warmDmg) * Math.min(1, m / TUNE.warmMin))));
    e.flash = 0;
    e.slowT = 0;
    e.slowF = 0.5;
    e.stunT = 0;
    e.t = rand(0, 5);
    e.flip = false;
    e.dead = false;
    e.boss = !!def.boss;
    e.xp = def.xp * v.xp;
    e.st = 0;
    e.timer = 0;
    e.timer2 = 0;
    e.timer3 = 0;
    e.orbitCd = e.orbitCd2 = 0;
    e.contactCd = 0;
    e.mode = Mode.Normal;
    e.life = 0;
    e.alpha = 1;
    e.ignoreProps = 0;
    e.stuckT = 0;
    e.trailT = 0;
    e.numCd = 0;
    e.numAcc = 0;
    e.noDrop = false;
    e.exploded = false;
    this.enemies.push(e);
    return e;
  }

  respawnEnemy(e: Enemy): void {
    for (let tries = 0; tries < 3; tries++) {
      const [x, y] = this.spawner.spawnPos();
      if (this.world.blocked(x, y)) continue;
      e.x = x;
      e.y = y;
      e.kx = e.ky = 0;
      return;
    }
  }

  fire(anim: Anim, x: number, y: number, angle: number, speed: number, dmg: number, pierce: number, life: number, size: number, r: number, kb = 40, noBonus = false): Projectile {
    const p = this.projPool.pop() ?? new Projectile();
    if (this.projs.length >= this.projCap) {
      const old = this.projs.shift()!;
      this.projPool.push(old);
    }
    p.kind = PKind.Linear;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.dmg = dmg;
    p.pierce = pierce + (noBonus || pierce >= 99 ? 0 : this.char.pierceBonus ?? 0);
    p.life = life;
    p.size = size;
    p.r = r;
    p.kb = kb * this.mods.kb;
    p.anim = anim;
    p.spin = 0;
    p.rot = angle;
    p.t = 0;
    p.nHits = 0;
    p.rehit = 0;
    p.rehitT = 0;
    p.phase = 0;
    p.tint = 0xffffff;
    p.mix = 0;
    p.hitFx = 'fx_spark';
    p.hitFxSize = 18;
    p.orbitEnd = false;
    p.trail = false;
    p.trailT = 0;
    this.projs.push(p);
    return p;
  }

  /** Thrown object in an arc (height 60 u). */
  lob(anim: Anim, sx: number, sy: number, tx: number, ty: number, dur: number, size: number): Projectile {
    const p = this.fire(anim, sx, sy, 0, 0, 0, 0, 99, size, 0, 0);
    p.kind = PKind.Lob;
    p.sx = sx;
    p.sy = sy;
    p.tx = tx;
    p.ty = ty;
    p.dur = dur;
    p.vx = p.vy = 0;
    return p;
  }

  fireEnemy(x: number, y: number, angle: number, speed: number, dmg: number, life: number): void {
    if (this.eprojs.length >= this.eprojCap) return;
    const q = this.eprojPool.pop() ?? new EProj();
    q.x = x;
    q.y = y;
    q.vx = Math.cos(angle) * speed;
    q.vy = Math.sin(angle) * speed;
    q.dmg = dmg;
    q.life = life;
    q.t = 0;
    q.r = 8;
    q.rot = angle;
    this.eprojs.push(q);
  }

  spawnZone(x: number, y: number): Zone {
    const z = this.zonePool.pop() ?? new Zone();
    z.shape = 0;
    z.x = x;
    z.y = y;
    z.r = 40;
    z.dir = 0;
    z.half = 1;
    z.dmg = 1;
    z.kb = 60;
    z.delay = z.delay0 = 0;
    z.life = z.life0 = 0.1;
    z.tick = 0;
    z.tickT = 0;
    z.slow = 0;
    z.activated = false;
    z.visual = 0;
    z.color = 0xffffff;
    z.t = 0;
    z.r0 = z.r1 = 0;
    z.stun = 0;
    z.fxT = 0;
    z.shake = 0;
    z.hostile = false;
    this.zones.push(z);
    return z;
  }

  spawnFx(name: string, x: number, y: number, size: number, o?: Partial<Fx>): Fx | null {
    if (this.fxs.length > this.fxCap) return null;
    const f = this.fxPool.pop() ?? new Fx();
    f.anim = this.atlas.anim(name, 0xffaa22);
    f.x = x;
    f.y = y;
    f.size = size;
    f.delay = 0;
    f.t = 0;
    f.fps = 14;
    f.loop = false;
    f.life = 0;
    f.alpha = 1;
    f.tint = 0xffffff;
    f.mix = 0;
    f.rot = 0;
    f.vy = 0;
    f.followPlayer = false;
    f.zOff = 0;
    f.flip = false;
    f.shrink = false;
    f.ground = false;
    if (o) Object.assign(f, o);
    this.fxs.push(f);
    return f;
  }

  /** Hit FX (only every second time under adaptive load). */
  fxHit(x: number, y: number, size: number, name = 'fx_spark'): void {
    if (this.fxs.length > this.fxCap * 0.7) return;
    if (this.halfFx && (this.frameNo & 1) === 0) return;
    this.spawnFx(name, x, y, size, { fps: 22 });
  }

  spawnNumber(x: number, y: number, val: number, tint = 0xffffff, scale = 1): void {
    if (!this.meta.settings.numbers) return;
    if (this.nums.length > this.numCap) return;
    const n = this.numPool.pop() ?? new DamageNumber();
    n.x = x + rand(-6, 6);
    n.y = y;
    n.vy = 46;
    n.t = 0;
    n.life = 0.65;
    n.val = Math.max(1, Math.round(val));
    n.tint = tint;
    n.scale = scale;
    this.nums.push(n);
  }

  spawnPickup(kind: PickKind, x: number, y: number, value = 1): void {
    if (kind === PickKind.Magnet && this.pickups.some((p) => p.kind === PickKind.Magnet)) return;
    if (kind === PickKind.Gem && this.pickups.length > 350) this.mergeGems();
    const p = this.pickPool.pop() ?? new Pickup();
    p.kind = kind;
    p.x = x + rand(-6, 6);
    p.y = y + rand(-6, 6);
    p.value = value;
    p.pulled = false;
    p.speed = 0;
    p.t = rand(0, 6);
    this.pickups.push(p);
  }

  /** Merging: the 50 farthest XP bolts become one. */
  private mergeGems(): void {
    const pl = this.player;
    const gems = this.pickups.filter((p) => p.kind === PickKind.Gem);
    if (gems.length < 60) return;
    gems.sort((a, b) => Math.hypot(b.x - pl.x, b.y - pl.y) - Math.hypot(a.x - pl.x, a.y - pl.y));
    const take = gems.slice(0, 50);
    const keep = take[0]!;
    let sum = 0;
    for (const g of take) sum += g.value;
    keep.value = sum;
    const drop = new Set(take.slice(1));
    this.pickups = this.pickups.filter((p) => {
      if (drop.has(p)) {
        this.pickPool.push(p);
        return false;
      }
      return true;
    });
  }

  pullGems(x: number, y: number, r: number): void {
    const r2 = r * r;
    for (const p of this.pickups) {
      if (p.kind !== PickKind.Gem && p.kind !== PickKind.Coin) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      if (dx * dx + dy * dy < r2) p.pulled = true;
    }
  }

  // ------------------------------------------------------------------ Queries
  /** Angle from (x,y) to the body center of an enemy. */
  aimAt(x: number, y: number, e: Enemy): number {
    return Math.atan2(e.y + e.cy - y, e.x - x);
  }

  nearest(x: number, y: number, maxR: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxR * maxR;
    for (const e of this.enemies) {
      if (e.dead || e.mode === Mode.Flee) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** Is an enemy inside the cone (direction dir, half angle half, range)? */
  enemyInCone(x: number, y: number, dir: number, half: number, range: number): boolean {
    const r2 = range * range;
    for (const e of this.enemies) {
      if (e.dead || e.mode === Mode.Flee) continue;
      const dx = e.x - x;
      const dy = e.y + e.cy - y;
      if (dx * dx + dy * dy > r2) continue;
      let da = Math.atan2(dy, dx) - dir;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) <= half) return true;
    }
    return false;
  }

  randomEnemy(x: number, y: number, maxR: number): Enemy | null {
    let pickE: Enemy | null = null;
    let n = 0;
    const r2 = maxR * maxR;
    for (const e of this.enemies) {
      if (e.dead || e.mode === Mode.Flee) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy < r2) {
        n++;
        if (Math.random() * n < 1) pickE = e;
      }
    }
    return pickE;
  }

  // ------------------------------------------------------------------ Damage
  damageEnemy(e: Enemy, dmg: number, kx = 0, ky = 0, crit = false): void {
    if (e.dead || e.mode === Mode.Flee) return;
    e.hp -= dmg;
    e.flash = 0.08;
    const kbMul = e.kbF;
    e.kx += kx * kbMul;
    e.ky += ky * kbMul;
    e.numAcc += dmg;
    if (e.numCd <= 0) {
      this.spawnNumber(e.x, e.y + e.r * 2.2, e.numAcc, crit ? 0xffd54a : 0xffffff, crit ? 1.4 : e.numAcc >= 30 ? 1.25 : 1);
      e.numAcc = 0;
      e.numCd = 0.15;
    }
    this.audio.hit();
    if (e.boss && dmg >= 50 && this.hitStopCd <= 0) {
      this.hitStop = 0.04;
      this.hitStopCd = 0.3;
    }
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e: Enemy): void {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    const def = e.def;
    const luck = this.mods.luck;
    this.audio.kill();
    if (!e.noDrop) {
      this.spawnPickup(PickKind.Gem, e.x, e.y, e.xp);
      if (e.boss) {
        this.spawnPickup(PickKind.Chest, e.x, e.y);
        this.spawnPickup(PickKind.Magnet, e.x + 24, e.y);
        this.spawnPickup(PickKind.Gem, e.x - 24, e.y, 0);
        const bonus = def.boss === 1 ? 25 : def.boss === 2 ? 40 : 60;
        this.coinsBoss += bonus;
        this.runCoins += bonus;
        this.spawnFx('fx_explosion', e.x, e.y, 150);
        this.spawnFx('fx_smoke_big', e.x, e.y, 150, { fps: 9 });
        this.shake = Math.max(this.shake, 6);
        this.audio.explosion();
        this.banner(t().banners.bossDown(bossName(def.boss ?? 0)), '#6aff6a');
        if (def.boss === 1) this.mixerBeatenRun = true;
        if (this.bossRef === e) this.bossRef = null;
        if (def.boss === 3) this.onFinalBossDead();
      } else {
        const r = Math.random();
        if (e.variant === Variant.Elite) {
          this.spawnPickup(PickKind.Chest, e.x, e.y);
          this.spawnPickup(PickKind.Heal, e.x + 20, e.y, 30);
          this.spawnPickup(PickKind.Coin, e.x - 20, e.y, 5);
        } else {
          if (Math.random() < 0.02 * luck) this.spawnPickup(PickKind.Coin, e.x, e.y, 1);
          if (r < 0.004 * luck) this.spawnPickup(PickKind.Heal, e.x, e.y, 30);
          else if (r < 0.006 * luck) this.spawnPickup(PickKind.Magnet, e.x, e.y);
          else if (r < 0.0075 * luck) this.spawnPickup(PickKind.Energy, e.x, e.y);
          else if (r < 0.0083 * luck) this.spawnPickup(PickKind.Beacon, e.x, e.y);
        }
      }
    }
    // Corpse (shrinks + fades out)
    if (!e.boss) {
      this.spawnFx(def.anim, e.x, e.y, def.height * e.scaleMul, { life: 0.15, shrink: true, flip: e.flip, tint: e.tintMix > 0 ? e.tint : 0xffffff, mix: e.tintMix, alpha: e.alpha });
      this.spawnFx('fx_smoke_small', e.x, e.y, 30 + e.r, { fps: 12, alpha: 0.85 });
      if (def.machine) this.spawnFx('fx_rubble', e.x, e.y, 28 + e.r * 0.6, { fps: 14 });
    }
    // Barrel enemy: chain reaction
    if (def.ai === 'kamikaze' && !e.exploded && !e.noDrop) {
      e.exploded = true;
      this.areaDamage(e.x, e.y, 48, 30, 140);
      this.spawnFx('fx_explosion', e.x, e.y, 100);
      this.spawnFx('fx_smoke_big', e.x, e.y, 90, { fps: 11 });
      this.audio.explosion();
      this.shake = Math.max(this.shake, 2);
    }
  }

  areaDamage(x: number, y: number, r: number, dmg: number, kb: number, stun = 0): number {
    const n = this.hash.query(x, y, r + 40, this.scratch);
    let hits = 0;
    for (let i = 0; i < n; i++) {
      const e = this.enemies[this.scratch[i]!];
      if (!e || e.dead) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = Math.hypot(dx, dy);
      if (d < r + e.r) {
        const inv = d > 0.001 ? 1 / d : 0;
        this.damageEnemy(e, dmg, dx * inv * kb, dy * inv * kb);
        if (stun > 0 && !e.boss && !e.dead) e.stunT = stun;
        hits++;
      }
    }
    this.hitProps(x, y, r, dmg);
    return hits;
  }

  arcDamage(x: number, y: number, r: number, dir: number, half: number, dmg: number, kb: number): void {
    const n = this.hash.query(x, y, r + 40, this.scratch);
    for (let i = 0; i < n; i++) {
      const e = this.enemies[this.scratch[i]!];
      if (!e || e.dead) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = Math.hypot(dx, dy);
      if (d > r + e.r) continue;
      let da = Math.atan2(dy, dx) - dir;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) <= half || d < e.r + 14) {
        const inv = d > 0.001 ? 1 / d : 0;
        this.damageEnemy(e, dmg, dx * inv * kb, dy * inv * kb);
        this.fxHit(e.x, e.y + e.r, 18);
      }
    }
    this.hitProps(x + Math.cos(dir) * r * 0.6, y + Math.sin(dir) * r * 0.6, r * 0.5, dmg);
  }

  explode(x: number, y: number, r: number, dmg: number, kb = 120): void {
    this.areaDamage(x, y, r, dmg, kb);
    this.spawnFx('fx_explosion', x, y, r * 2.2);
    this.shake = Math.max(this.shake, 2);
    this.audio.explosion();
  }

  hitProps(x: number, y: number, r: number, dmg: number, cd = 0): void {
    const live = this.world.live;
    for (let i = live.length - 1; i >= 0; i--) {
      const d = live[i]!;
      if (d.dead || d.fuse >= 0) continue;
      if (cd > 0 && d.hitCd > 0) continue;
      const dx = d.x - x;
      const dy = d.y + d.h * 0.4 - y;
      if (dx * dx + dy * dy < (r + d.hitR) * (r + d.hitR)) {
        if (cd > 0) d.hitCd = cd;
        this.damageProp(d, dmg);
      }
    }
  }

  damageProp(d: Destructible, dmg: number): void {
    if (d.dead) return;
    d.hp -= dmg;
    d.flash = 0.08;
    d.wobble = rand(-0.12, 0.12);
    this.audio.hit();
    if (d.hp <= 0) this.destroyProp(d);
  }

  private destroyProp(d: Destructible): void {
    if (d.dead) return;
    this.world.markDestroyed(d);
    const luck = this.mods.luck;
    this.spawnFx(d.kind === 'barrel' ? 'm_barrel_red' : d.anim.name, d.x, d.y, d.h, { life: 0.15, shrink: true });
    this.spawnFx('fx_rubble', d.x, d.y, 34, { fps: 14 });
    this.spawnFx('fx_dust', d.x, d.y, 40, { fps: 14 });
    if (d.kind === 'barrel') {
      this.audio.explosion();
      const R = 70;
      this.spawnFx('fx_explosion', d.x, d.y, R * 2 * 1.4);
      this.spawnFx('fx_smoke_big', d.x, d.y, 110, { fps: 10 });
      this.shake = Math.max(this.shake, 4);
      // 40 damage to enemies (fixed, no hpMul), 10 to the player
      const n = this.hash.query(d.x, d.y, R + 40, this.scratch);
      for (let i = 0; i < n; i++) {
        const e = this.enemies[this.scratch[i]!];
        if (!e || e.dead) continue;
        const dx = e.x - d.x;
        const dy = e.y - d.y;
        const dist = Math.hypot(dx, dy);
        if (dist < R + e.r) {
          const inv = dist > 0.001 ? 1 / dist : 0;
          this.damageEnemy(e, 40, dx * inv * 200, dy * inv * 200);
        }
      }
      const p = this.player;
      if (Math.hypot(p.x - d.x, p.y - d.y) < R + p.r) this.hurtPlayer(10);
      for (const o of this.world.live) {
        if (o.kind === 'barrel' && o.fuse < 0 && !o.dead && Math.hypot(o.x - d.x, o.y - d.y) < R) o.fuse = 0.12;
      }
      return;
    }
    const r = Math.random();
    if (d.kind === 'toolbox') {
      if (r < 0.4) this.spawnPickup(PickKind.Beacon, d.x, d.y);
      else if (r < 0.7) this.spawnPickup(PickKind.Magnet, d.x, d.y);
      else for (let i = 0; i < 3; i++) this.spawnPickup(PickKind.Coin, d.x, d.y, 10 / 3);
      return;
    }
    const small = d.kind === 'crateSmall';
    const lk = luck;
    const xpP = small ? 0.6 : 0.45;
    const coinP = xpP + (small ? 0.18 : 0.25);
    const medP = coinP + (small ? 0.1 : 0.15) * lk;
    const magP = medP + (small ? 0.07 : 0.1) * lk;
    const enP = magP + 0.05 * lk;
    if (r < xpP) this.spawnPickup(PickKind.Gem, d.x, d.y, small ? 2 : 5);
    else if (r < coinP) for (let i = 0; i < 3; i++) this.spawnPickup(PickKind.Coin, d.x, d.y, 1);
    else if (r < medP) this.spawnPickup(PickKind.Heal, d.x, d.y, 30);
    else if (r < magP) this.spawnPickup(PickKind.Magnet, d.x, d.y);
    else if (r < enP) this.spawnPickup(PickKind.Energy, d.x, d.y);
  }

  hurtPlayer(dmg: number, kx = 0, ky = 0): void {
    const p = this.player;
    if (this.state !== 'playing') return;
    if (kx !== 0 || ky !== 0) {
      p.kx += kx;
      p.ky += ky;
    }
    if (p.iframes > 0) return;
    const d = Math.max(1, Math.round(dmg - this.mods.armor));
    p.hp -= d;
    p.iframes = TUNE.iframes;
    p.hurtT = 0.12;
    this.shake = Math.max(this.shake, 3);
    this.spawnNumber(p.x, p.y + 50, d, 0xff5a4a, 1.2);
    this.ui.hurt(0.35);
    this.audio.hurt();
    if (this.meta.settings.vibrate) {
      try {
        navigator.vibrate?.(10);
      } catch {
        /* sandbox */
      }
    }
    if (p.hp <= 0) this.playerDied();
  }

  private playerDied(): void {
    const p = this.player;
    if (this.reviveLeft > 0) {
      this.reviveLeft--;
      p.hp = p.maxHp * 0.5;
      p.iframes = 3;
      this.spawnFx('fx_heal', p.x, p.y + 20, 60, { followPlayer: true, fps: 10 });
      this.spawnFx('fx_shield', p.x, p.y + 20, 90, { followPlayer: true, life: 2.5, loop: true, fps: 8 });
      this.areaDamage(p.x, p.y, 160, 30, 300);
      this.banner(t().banners.revive, '#6aff6a');
      return;
    }
    p.hp = 0;
    this.calm();
    this.state = 'dying';
    this.dyingT = 1.2;
    this.input.reset();
    this.spawnFx('fx_smoke_big', p.x, p.y + 10, 80, { fps: 9 });
  }

  heal(v: number): void {
    const p = this.player;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + v);
    this.spawnFx('fx_heal', p.x, p.y + 20, 52, { followPlayer: true, fps: 10 });
    if (p.hp > before) this.spawnNumber(p.x, p.y + 56, p.hp - before, 0x6aff6a, 1.1);
  }

  addXp(v: number): void {
    this.xp += v * this.mods.xp;
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      this.xpNeed = this.xpFor(this.level);
      this.pendingLevelUps++;
      this.spawnFx('fx_levelup', this.player.x, this.player.y + 30, 56, { followPlayer: true, fps: 10 });
      this.spawnFx('fx_ring', this.player.x, this.player.y, 80, { fps: 10, tint: 0xffd54a, mix: 0.6, ground: true });
      if (this.level >= 25) this.meta.flags.level25 = true;
    }
  }

  // ------------------------------------------------------------------ Events (dump truck, finale)
  startDumpTruck(): void {
    const p = this.player;
    const a = rand(0, TAU);
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const R = this.spawnR + 120;
    const off = rand(-110, 110);
    const x = p.x - dx * R - dy * off;
    const y = p.y - dy * R + dx * off;
    this.truck = { x, y, dx, dy, t: -1.5, travelled: 0, total: R * 2, hit: new Set<number>(), hitPlayer: false };
    this.banner(t().banners.dumpTruck, '#ffc83d');
  }

  startFinale(): void {
    this.finaleOn = true;
    for (const e of this.enemies) {
      if (!e.boss) {
        e.mode = Mode.Flee;
        e.alpha = 1;
      }
    }
    const p = this.player;
    this.arena = { x: p.x, y: p.y, t: 0, fade: 1 };
    this.shake = Math.max(this.shake, 4);
    this.audio.boss();
    this.banner(t().banners.arena, '#ff4a2e');
    const e = this.addEnemy(ENEMIES.boss3!, p.x, p.y + 200, Variant.Normal, true);
    if (e) {
      this.bossRef = e;
      e.speed = ENEMIES.boss3!.speed;
    }
    this.banner(t().banners.bossWarn(bossName(3)), '#ff4a2e');
  }

  private onFinalBossDead(): void {
    if (this.arena) this.arena.fade = 0.999;
    this.pendingVictory = 1.2;
  }
  pendingVictory = 0;

  // ------------------------------------------------------------------ Upgrades
  private cardCount(): number {
    let n = this.char.cards ?? 3;
    if (this.mods.luck >= 1.3 && Math.random() < 0.25) n++;
    return Math.min(5, n);
  }

  rollOptions(): UpgradeOption[] {
    const pool: UpgradeOption[] = [];
    for (const w of this.weapons) {
      if (w.level < w.def.max && !w.evo) {
        pool.push({ id: w.def.id, kind: 'weapon', name: weaponText(w.def.id).name, icon: w.def.icon, level: w.level + 1, max: w.def.max, desc: describeLevel(w.def, w.level + 1), isNew: false });
      }
    }
    if (this.weapons.length < MAX_WEAPONS) {
      for (const d of WEAPONS) {
        if (this.weapons.some((w) => w.def.id === d.id)) continue;
        if (!weaponUnlocked(this.meta, d.id, this.cheat) && d.id !== this.char.weapon) continue;
        pool.push({ id: d.id, kind: 'weapon', name: weaponText(d.id).name, icon: d.icon, level: 1, max: d.max, desc: weaponText(d.id).desc, isNew: true });
      }
    }
    for (const p of PASSIVES) {
      const lvl = this.passiveLevels.get(p.id) ?? 0;
      if (lvl > 0 && lvl < p.max) {
        pool.push({ id: p.id, kind: 'passive', name: passiveText(p.id).name, icon: p.icon, level: lvl + 1, max: p.max, desc: passiveText(p.id).desc, isNew: false });
      } else if (lvl === 0 && this.passiveLevels.size < MAX_PASSIVES) {
        pool.push({ id: p.id, kind: 'passive', name: passiveText(p.id).name, icon: p.icon, level: 1, max: p.max, desc: passiveText(p.id).desc, isNew: true });
      }
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    const out = pool.slice(0, this.cardCount());
    for (const o of out) o.evo = this.evoHint(o);
    if (out.length === 0) {
      out.push({ id: 'heal', kind: 'heal', name: t().levelup.healName, icon: 'm_medkit', level: 1, max: 1, desc: t().levelup.healDesc, isNew: false });
    }
    return out;
  }

  /** Evolution hint if this card brings an evolution closer and the counterpart is already owned. */
  private evoHint(o: UpgradeOption): UpgradeOption['evo'] {
    const eh = t().evoHint;
    const chest = eh.chest;
    if (o.kind === 'weapon') {
      const ev = WEAPON_BY_ID[o.id]?.evo;
      if (!ev || (this.passiveLevels.get(ev.passive) ?? 0) < 1) return undefined;
      const pd = PASSIVE_BY_ID[ev.passive]!;
      const cond = o.level >= o.max ? eh.maxReached(chest) : eh.weaponToMax(o.max, o.level, chest);
      return { icon: pd.icon, partner: passiveText(pd.id).name, name: weaponText(o.id).evoName ?? '', cond };
    }
    if (o.kind === 'passive' && o.isNew) {
      const w = this.weapons.find((x) => !x.evo && x.def.evo?.passive === o.id);
      if (!w || !w.def.evo) return undefined;
      const cond = w.level >= w.def.max ? eh.weaponReady(w.def.max, chest) : eh.weaponNow(w.def.max, w.level, chest);
      return { icon: w.def.icon, partner: weaponText(w.def.id).name, name: weaponText(w.def.id).evoName ?? '', cond };
    }
    return undefined;
  }

  choose(opt: UpgradeOption): void {
    if (this.state !== 'levelup') return;
    this.applyOption(opt);
    this.state = 'playing';
    this.ui.hideAll();
    this.ui.hud(this);
    this.lvSlowDone = false;
  }

  private applyOption(opt: UpgradeOption): void {
    if (opt.kind === 'weapon') {
      const w = this.weapons.find((x) => x.def.id === opt.id);
      if (w) w.level = Math.min(w.def.max, w.level + 1);
      else this.addWeapon(opt.id);
    } else if (opt.kind === 'passive') {
      this.passiveLevels.set(opt.id, opt.level);
      this.recalc();
    } else {
      this.heal(this.player.maxHp * 0.4);
    }
  }

  private openLevelUp(): void {
    this.pendingLevelUps--;
    this.calm();
    this.state = 'levelup';
    this.input.reset();
    this.audio.levelup();
    this.ui.levelUp(this.rollOptions());
  }

  /** Chest: 1/3/5 items, evolution takes priority (from 5:00). */
  private openChest(): void {
    this.pendingChests--;
    this.calm();
    this.state = 'levelup';
    this.input.reset();
    this.audio.levelup();
    const r = Math.random();
    const luck = this.mods.luck;
    const count = r < 0.03 * luck ? 5 : r < 0.1 * luck ? 3 : 1;
    const rewards: ChestReward[] = [];
    for (let i = 0; i < count; i++) {
      const evo = this.time >= 300 ? this.weapons.find((w) => !w.evo && w.def.evo && w.level >= w.def.max && (this.passiveLevels.get(w.def.evo.passive) ?? 0) >= 1) : undefined;
      if (evo) {
        evo.evo = true;
        rewards.push({ icon: evo.def.icon, name: weaponText(evo.def.id).evoName ?? '', text: t().chest.evoPrefix + (weaponText(evo.def.id).evoDesc ?? ''), evo: true });
        continue;
      }
      const opts: UpgradeOption[] = [];
      for (const w of this.weapons) {
        if (w.level < w.def.max && !w.evo) opts.push({ id: w.def.id, kind: 'weapon', name: weaponText(w.def.id).name, icon: w.def.icon, level: w.level + 1, max: w.def.max, desc: describeLevel(w.def, w.level + 1), isNew: false });
      }
      for (const [id, lvl] of this.passiveLevels) {
        const pd = PASSIVE_BY_ID[id]!;
        if (lvl < pd.max) opts.push({ id, kind: 'passive', name: passiveText(id).name, icon: pd.icon, level: lvl + 1, max: pd.max, desc: passiveText(id).desc, isNew: false });
      }
      if (opts.length > 0) {
        const o = opts[Math.floor(Math.random() * opts.length)]!;
        this.applyOption(o);
        rewards.push({ icon: o.icon, name: o.name, text: t().chest.levelReward(o.level, o.desc), evo: false });
      } else {
        this.runCoins += 25;
        this.heal(30);
        rewards.push({ icon: 'i_gear', name: t().chest.coinsName(num(25, 0)), text: t().chest.healText, evo: false });
      }
    }
    this.ui.chest(rewards);
  }

  closeChest(): void {
    if (this.state !== 'levelup') return;
    this.state = 'playing';
    this.ui.hideAll();
    this.ui.hud(this);
    this.lvSlowDone = false;
  }

  // ------------------------------------------------------------------ Update
  update(dtRaw: number): void {
    if (this.state === 'dying') {
      const dt = Math.min(dtRaw, 0.05);
      this.dyingT -= dt;
      this.updateFx(dt);
      if (this.dyingT <= 0) this.endGame(false);
      return;
    }
    if (this.state !== 'playing') return;
    if (this.hitStopCd > 0) this.hitStopCd -= dtRaw;
    if (this.hitStop > 0) {
      this.hitStop -= dtRaw;
      return;
    }
    let dt = Math.min(dtRaw, 0.05);
    // Level-up: 0.3 s slow motion, then pause
    if (this.lvSlow > 0) {
      this.lvSlow -= dt;
      dt *= 0.25;
      if (this.lvSlow <= 0) {
        this.lvSlow = 0;
        if (this.pendingLevelUps > 0) this.openLevelUp();
        else if (this.pendingChests > 0) this.openChest();
        return;
      }
    }
    this.frameNo++;
    this.time += dt;
    this.world.time = this.time;
    const p = this.player;
    if (this.overtimeT > 0) this.overtimeT -= dt;
    if (this.freezeT > 0) this.freezeT -= dt;

    // Movement
    this.input.update();
    const ix = this.input.x;
    const iy = this.input.y;
    p.moving = ix !== 0 || iy !== 0;
    let sp = p.speed * (this.overtimeT > 0 ? 1.3 : 1);
    if (this.world.onRoad(p.x, p.y)) sp *= 1.1;
    if (p.moving) {
      p.x += ix * sp * dt;
      p.y += iy * sp * dt;
      p.animT += dt;
      const l = Math.hypot(ix, iy);
      p.fx = ix / l;
      p.fy = iy / l;
      if (Math.abs(ix) > 0.1) p.flip = ix < 0;
    }
    if (p.kx !== 0 || p.ky !== 0) {
      p.x += p.kx * dt;
      p.y += p.ky * dt;
      const dc = Math.exp(-8 * dt);
      p.kx *= dc;
      p.ky *= dc;
    }
    if (this.suckT > 0) {
      this.suckT -= dt;
      const dx = this.suckX - p.x;
      const dy = this.suckY - p.y;
      const d = Math.hypot(dx, dy) || 1;
      p.x += (dx / d) * 40 * dt;
      p.y += (dy / d) * 40 * dt;
      if ((this.frameNo & 7) === 0) this.spawnFx('fx_dust', p.x, p.y, 24, { fps: 18 });
    }
    // Obstacles + arena
    this.world.resolve(p, p.r * 0.7, true);
    if (this.arena && this.arena.fade > 0) {
      const dx = p.x - this.arena.x;
      const dy = p.y - this.arena.y;
      const d = Math.hypot(dx, dy);
      const lim = 345;
      if (d > lim) {
        p.x = this.arena.x + (dx / d) * lim;
        p.y = this.arena.y + (dy / d) * lim;
      }
    }
    if (p.iframes > 0) p.iframes -= dt;
    if (p.attackT > 0) p.attackT -= dt;
    if (p.hurtT > 0) p.hurtT -= dt;
    const regen = this.mods.regen + TUNE.baseRegen * Math.max(0, 1 - this.time / 60 / TUNE.regenMin);
    if (regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + regen * dt);
    this.world.update(dt, p.x, p.y);
    for (const d of this.world.live) {
      d.t += dt;
      if (d.flash > 0) d.flash -= dt;
      if (d.hitCd > 0) d.hitCd -= dt;
      d.wobble *= Math.exp(-12 * dt);
      if (d.fuse >= 0) {
        d.fuse -= dt;
        if (d.fuse <= 0) this.damageProp(d, 999);
      }
    }

    // Rebuild the spatial hash
    const hash = this.hash;
    hash.clear();
    const en = this.enemies;
    for (let i = 0; i < en.length; i++) hash.insert(i, en[i]!.x, en[i]!.y);

    this.spawner.update(dt);
    if (this.ringActive) {
      this.ringR -= 22 * dt;
      if (this.ringR <= 90) this.ringActive = false;
    }
    this.updateTruck(dt);
    if (this.arena) this.updateArena(dt);

    // Enemies
    for (let i = 0; i < en.length; i++) {
      const e = en[i]!;
      if (e.dead) continue;
      updateEnemy(this, e, dt);
    }
    // Separation (every second frame per enemy)
    const par = this.frameNo & 1;
    const buf = this.scratch;
    for (let i = par; i < en.length; i += 2) {
      const e = en[i]!;
      if (e.dead || e.mode === Mode.Ring) continue;
      const n = hash.query(e.x, e.y, e.r * 2 + 4, buf);
      const force = e.def.id === 'barrier' ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const j = buf[k]!;
        if (j === i) continue;
        const o = en[j]!;
        if (o.dead || o.mode === Mode.Straight) continue;
        const dx = e.x - o.x;
        const dy = e.y - o.y;
        const min = (e.r + o.r) * 0.85;
        const d2 = dx * dx + dy * dy;
        if (d2 < min * min && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (min - d) * (e.boss ? 0 : o.boss ? 1 : 0.5) * force;
          e.x += (dx / d) * push;
          e.y += (dy / d) * push;
        } else if (d2 <= 0.0001) {
          e.x += rand(-0.5, 0.5);
          e.y += rand(-0.5, 0.5);
        }
      }
      // Player: enemies surround him instead of stacking
      if (e.mode === Mode.Normal && !e.boss) {
        const pdx = e.x - p.x;
        const pdy = e.y - p.y;
        const pm = p.r + e.r * 0.7;
        const pd2 = pdx * pdx + pdy * pdy;
        if (pd2 < pm * pm && pd2 > 0.01 && e.st !== 2) {
          const pd = Math.sqrt(pd2);
          e.x = p.x + (pdx / pd) * pm;
          e.y = p.y + (pdy / pd) * pm;
        }
      }
    }
    // Contact damage
    if (this.freezeT <= 0) {
      const n = hash.query(p.x, p.y, p.r + 50, buf);
      for (let k = 0; k < n; k++) {
        const e = en[buf[k]!]!;
        if (e.dead || e.contactCd > 0 || e.mode === Mode.Flee) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < p.r + e.r + 2) {
          e.contactCd = 0.5;
          if (e.def.ai === 'kamikaze') {
            this.kamikazeHit(e);
          } else {
            this.hurtPlayer(e.dmg);
          }
          if (this.state !== 'playing') break;
        }
      }
    }

    // Weapons
    for (const w of this.weapons) w.update(this, dt);
    this.updateProjectiles(dt);
    this.updateEProjs(dt);
    this.updateZones(dt);
    this.updatePickups(dt);
    this.updateFx(dt);

    // Remove dead enemies
    for (let i = en.length - 1; i >= 0; i--) {
      if (en[i]!.dead) {
        this.enemyPool.push(en[i]!);
        en[i] = en[en.length - 1]!;
        en.pop();
      }
    }
    if (this.bossRef && this.bossRef.dead) this.bossRef = null;

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 14);

    if (this.pendingVictory > 0) {
      this.pendingVictory -= dt;
      if (this.pendingVictory <= 0 && this.state === 'playing') this.endGame(true);
      return;
    }
    if (this.state === 'playing' && this.lvSlow <= 0 && (this.pendingLevelUps > 0 || this.pendingChests > 0)) {
      this.lvSlow = 0.3;
    }
  }

  private kamikazeHit(e: Enemy): void {
    if (e.exploded) return;
    e.exploded = true;
    e.dead = true;
    e.noDrop = true;
    this.kills++;
    this.spawnFx('fx_explosion', e.x, e.y, 110);
    this.spawnFx('fx_smoke_big', e.x, e.y, 90, { fps: 11 });
    this.shake = Math.max(this.shake, 3);
    this.audio.explosion();
    const p = this.player;
    if (Math.hypot(p.x - e.x, p.y - e.y) < 48 + p.r) this.hurtPlayer(e.dmg);
  }

  private updateTruck(dt: number): void {
    const t = this.truck;
    if (!t) return;
    t.t += dt;
    if (t.t < 0) return;
    const sp = 420;
    t.x += t.dx * sp * dt;
    t.y += t.dy * sp * dt;
    t.travelled += sp * dt;
    const R = 46;
    const n = this.hash.query(t.x, t.y, R + 40, this.scratch);
    for (let i = 0; i < n; i++) {
      const e = this.enemies[this.scratch[i]!]!;
      if (e.dead || t.hit.has(e.uid)) continue;
      if (Math.hypot(e.x - t.x, e.y - t.y) < R + e.r) {
        t.hit.add(e.uid);
        const k = 400;
        const d = Math.hypot(e.x - t.x, e.y - t.y) || 1;
        this.damageEnemy(e, 200, ((e.x - t.x) / d) * k, ((e.y - t.y) / d) * k);
        e.kx += t.dx * 300 * e.kbF;
        e.ky += t.dy * 300 * e.kbF;
      }
    }
    const p = this.player;
    if (!t.hitPlayer && Math.hypot(p.x - t.x, p.y - t.y) < R + p.r) {
      t.hitPlayer = true;
      p.iframes = 0;
      this.hurtPlayer(15, t.dx * 250, t.dy * 250);
      this.shake = Math.max(this.shake, 4);
    }
    if (t.travelled >= t.total) this.truck = null;
  }

  private updateArena(dt: number): void {
    const a = this.arena!;
    a.t += dt;
    if (a.fade < 1) {
      a.fade -= dt;
      if (a.fade <= 0) this.arena = null;
    }
    // Enemies inside stay inside
    for (const e of this.enemies) {
      if (e.dead || e.mode === Mode.Flee) continue;
      const dx = e.x - a.x;
      const dy = e.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 340) {
        e.x = a.x + (dx / d) * 340;
        e.y = a.y + (dy / d) * 340;
      }
    }
  }

  private updateEProjs(dt: number): void {
    const arr = this.eprojs;
    const p = this.player;
    for (let i = arr.length - 1; i >= 0; i--) {
      const q = arr[i]!;
      q.t += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      let rm = q.t >= q.life;
      if (!rm && this.freezeT <= 0) {
        const dx = p.x - q.x;
        const dy = p.y + 20 - (q.y + 8);
        if (dx * dx + dy * dy < (q.r + p.r) * (q.r + p.r)) {
          this.hurtPlayer(q.dmg);
          rm = true;
        }
      }
      if (rm) {
        this.eprojPool.push(q);
        arr[i] = arr[arr.length - 1]!;
        arr.pop();
      }
    }
  }

  private updateProjectiles(dt: number): void {
    const ps = this.projs;
    const hash = this.hash;
    const buf = this.scratch;
    const pl = this.player;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]!;
      let remove = false;
      p.t += dt;
      p.rot += p.spin * dt;
      if (p.kind === PKind.Lob) {
        const k = Math.min(1, p.t / p.dur);
        p.x = p.sx + (p.tx - p.sx) * k;
        p.y = p.sy + (p.ty - p.sy) * k;
        if (k >= 1) {
          if (p.land === 0) {
            this.explode(p.tx, p.ty, p.blast, p.dmg, 140);
          } else {
            const z = this.spawnZone(p.tx, p.ty);
            z.r = p.blast;
            z.life = z.life0 = p.puddle;
            z.tick = 0.5;
            z.tickT = 0.1;
            z.dmg = p.dmg;
            z.kb = 5;
            z.slow = p.phase === 1 ? 0.6 : 0.4;
            z.visual = 2;
            z.color = p.phase === 1 ? 0xfff6d0 : 0xe8e2c8;
            if (p.phase === 1) {
              z.r0 = p.blast;
              z.r1 = 90;
            }
            this.spawnFx('fx_smoke_small', p.tx, p.ty, p.blast * 1.4, { fps: 10, alpha: 0.3, ground: true });
          }
          remove = true;
        }
      } else {
        const px0 = p.x;
        const py0 = p.y;
        if (p.kind === PKind.Boomerang) {
          if (p.phase === 0) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (Math.hypot(p.x - p.ox, p.y - p.oy) >= p.range) {
              p.phase = 1;
              p.nHits = 0;
            }
          } else if (p.phase === 1) {
            const dx = pl.x - p.x;
            const dy = pl.y + 16 - p.y;
            const d = Math.hypot(dx, dy) || 1;
            const sp = Math.hypot(p.vx, p.vy) * 1.2;
            p.x += (dx / d) * sp * dt;
            p.y += (dy / d) * sp * dt;
            if (d < 16) {
              if (p.orbitEnd) {
                p.phase = 2;
                p.orbitT = 1;
                p.orbitA = Math.atan2(p.y - pl.y, p.x - pl.x);
              } else remove = true;
            }
          } else {
            p.orbitT -= dt;
            p.orbitA += 6 * dt;
            p.x = pl.x + Math.cos(p.orbitA) * 50;
            p.y = pl.y + 16 + Math.sin(p.orbitA) * 40;
            if (p.orbitT <= 0) remove = true;
          }
          p.rehitT += dt;
          if (p.rehitT >= p.rehit) {
            p.rehitT = 0;
            p.nHits = 0;
          }
        } else {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.t >= p.life) remove = true;
          if (p.trail) {
            p.trailT -= dt;
            if (p.trailT <= 0) {
              p.trailT = 0.06;
              this.spawnFx('fx_dust', p.x, p.y, 14, { fps: 20, alpha: 0.6 });
            }
          }
        }
        if (!remove) {
          // Swept test: segment old -> new position against a circle around the BODY CENTER (feet + cy), radius p.r + hr.
          const sx = p.x - px0;
          const sy = p.y - py0;
          const len2 = sx * sx + sy * sy;
          const mx = (p.x + px0) * 0.5;
          const my = (p.y + py0) * 0.5;
          const n = hash.query(mx, my, Math.sqrt(len2) * 0.5 + p.r + 70, buf);
          let nh = 0;
          for (let k = 0; k < n; k++) {
            const e = this.enemies[buf[k]!];
            if (!e || e.dead || p.hasHit(e.uid)) continue;
            const ex = e.x;
            const ey = e.y + e.cy;
            let t = len2 > 1e-9 ? ((ex - px0) * sx + (ey - py0) * sy) / len2 : 0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const dx = ex - (px0 + sx * t);
            const dy = ey - (py0 + sy * t);
            const rr = p.r + e.hr;
            if (dx * dx + dy * dy < rr * rr && nh < 32) {
              // insert sorted by t (enemy hit first comes first)
              let j = nh++;
              while (j > 0 && this.hitT[j - 1]! > t) {
                this.hitT[j] = this.hitT[j - 1]!;
                this.hitE[j] = this.hitE[j - 1]!;
                j--;
              }
              this.hitT[j] = t;
              this.hitE[j] = e;
            }
          }
          for (let h = 0; h < nh; h++) {
            const e = this.hitE[h]!;
            if (e.dead) continue;
            const sp = Math.hypot(p.vx, p.vy) || 1;
            const ddx = e.x - p.x;
            const ddy = e.y + e.cy - p.y;
            const dl = Math.hypot(ddx, ddy) || 1;
            const kx = p.kind === PKind.Linear ? (p.vx / sp) * p.kb : (ddx / dl) * p.kb;
            const ky = p.kind === PKind.Linear ? (p.vy / sp) * p.kb : (ddy / dl) * p.kb;
            this.damageEnemy(e, p.dmg, kx, ky);
            p.addHit(e.uid);
            this.fxHit(e.x, e.y + e.cy, p.hitFxSize, p.hitFx);
            if (p.kind === PKind.Linear) {
              p.pierce--;
              if (p.pierce < 0) {
                remove = true;
                break;
              }
            }
          }
          // destructible objects
          if (!remove && this.world.live.length > 0) {
            for (const d of this.world.live) {
              if (d.dead || d.fuse >= 0 || p.hasHit(-d.id - 1)) continue;
              const cxp = d.x;
              const cyp = d.y + d.h * 0.4;
              let t = len2 > 1e-9 ? ((cxp - px0) * sx + (cyp - py0) * sy) / len2 : 0;
              t = t < 0 ? 0 : t > 1 ? 1 : t;
              const dx = cxp - (px0 + sx * t);
              const dy = cyp - (py0 + sy * t);
              if (dx * dx + dy * dy < (p.r + d.hitR) * (p.r + d.hitR)) {
                p.addHit(-d.id - 1);
                this.damageProp(d, p.dmg);
                this.fxHit(d.x, d.y + d.h * 0.4, 16);
                if (p.kind === PKind.Linear) {
                  p.pierce--;
                  if (p.pierce < 0) {
                    remove = true;
                    break;
                  }
                }
              }
            }
          }
        }
      }
      if (remove) {
        this.projPool.push(p);
        ps[i] = ps[ps.length - 1]!;
        ps.pop();
      }
    }
  }

  private updateZones(dt: number): void {
    const zs = this.zones;
    const pl = this.player;
    for (let i = zs.length - 1; i >= 0; i--) {
      const z = zs[i]!;
      z.t += dt;
      let remove = false;
      if (z.delay > 0) z.delay -= dt;
      if (z.delay <= 0) {
        if (z.tick > 0) {
          // persistent zone (puddle)
          z.life -= dt;
          z.tickT -= dt;
          if (z.r1 > 0) z.r = z.r0 + (z.r1 - z.r0) * (1 - Math.max(0, z.life) / Math.max(0.01, z.life0));
          if (z.slow > 0) {
            const n = this.hash.query(z.x, z.y, z.r + 40, this.scratch);
            for (let k = 0; k < n; k++) {
              const e = this.enemies[this.scratch[k]!]!;
              if (!e.dead && Math.hypot(e.x - z.x, e.y - z.y) < z.r + e.r) {
                e.slowT = 0.3;
                e.slowF = z.slow;
              }
            }
          }
          if (z.tickT <= 0) {
            z.tickT = z.tick;
            this.areaDamage(z.x, z.y, z.r, z.dmg, z.kb);
          }
          z.fxT -= dt;
          if (z.fxT <= 0) {
            z.fxT = 0.9;
            this.spawnFx('fx_smoke_small', z.x + rand(-z.r, z.r) * 0.5, z.y + rand(-z.r, z.r) * 0.3, 26, { fps: 8, alpha: 0.3, ground: true });
          }
          if (z.life <= 0) remove = true;
        } else {
          if (!z.activated) {
            z.activated = true;
            if (z.hostile) {
              this.spawnFx('fx_spikes', z.x, z.y + 2, z.r * 2.4, { fps: 16 });
              this.spawnFx('fx_rubble', z.x, z.y, z.r, { fps: 14 });
              this.shake = Math.max(this.shake, 3);
              if (Math.hypot(pl.x - z.x, pl.y - z.y) < z.r + pl.r) this.hurtPlayer(z.dmg);
            } else if (z.shape === 0) {
              this.areaDamage(z.x, z.y, z.r, z.dmg, z.kb, z.stun);
            } else {
              this.arcDamage(z.x, z.y, z.r, z.dir, z.half, z.dmg, z.kb);
            }
            if (z.shake > 0) this.shake = Math.max(this.shake, z.shake);
          }
          z.life -= dt;
          if (z.life <= 0) remove = true;
        }
      }
      if (remove) {
        this.zonePool.push(z);
        zs[i] = zs[zs.length - 1]!;
        zs.pop();
      }
    }
  }

  private updatePickups(dt: number): void {
    const pl = this.player;
    const arr = this.pickups;
    const mag = TUNE.magnet * this.mods.magnet;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i]!;
      p.t += dt;
      const dx = pl.x - p.x;
      const dy = pl.y - p.y;
      const d = Math.hypot(dx, dy);
      let collect = false;
      if (p.kind === PickKind.Gem || p.kind === PickKind.Coin) {
        if (!p.pulled && d < mag) p.pulled = true;
        if (p.pulled) {
          p.speed = Math.min(700, p.speed + 1200 * dt);
          const k = Math.min(d, p.speed * dt) / (d || 1);
          p.x += dx * k;
          p.y += dy * k;
        }
        collect = d < 14;
      } else {
        if (d < 36) {
          const k = Math.min(d, 160 * dt) / (d || 1);
          p.x += dx * k;
          p.y += dy * k;
        }
        collect = d < 22;
      }
      if (collect) {
        switch (p.kind) {
          case PickKind.Gem:
            if (p.value > 0) this.addXp(p.value);
            this.audio.pickup();
            break;
          case PickKind.Coin:
            this.runCoins += p.value;
            this.coinsKills += p.value;
            this.audio.pickup();
            break;
          case PickKind.Heal:
            this.heal(p.value);
            break;
          case PickKind.Magnet:
            for (const o of arr) {
              if (o.kind === PickKind.Gem || o.kind === PickKind.Coin) {
                o.pulled = true;
                o.speed = 600;
              }
            }
            this.spawnFx('fx_ring', pl.x, pl.y, 90, { fps: 10, tint: 0xff5a5a, mix: 0.6, ground: true });
            this.banner(t().banners.magnet, '#ff6a6a');
            break;
          case PickKind.Chest:
            this.pendingChests++;
            this.spawnFx('fx_levelup', pl.x, pl.y + 30, 64, { followPlayer: true, fps: 10 });
            this.spawnFx('fx_ring', pl.x, pl.y, 90, { fps: 10, tint: 0xffd54a, mix: 0.6, ground: true });
            break;
          case PickKind.Energy:
            this.overtimeT = 10;
            this.banner(t().banners.overtime, '#ffe14a');
            break;
          case PickKind.Beacon:
            this.freezeT = 5;
            this.spawnFx('fx_shield', pl.x, pl.y + 20, 100, { followPlayer: true, life: 5, loop: true, fps: 8 });
            this.banner(t().banners.workStop, '#9ad8ff');
            break;
        }
        this.pickPool.push(p);
        arr[i] = arr[arr.length - 1]!;
        arr.pop();
      }
    }
  }

  private updateFx(dt: number): void {
    const fxs = this.fxs;
    const pl = this.player;
    for (let i = fxs.length - 1; i >= 0; i--) {
      const f = fxs[i]!;
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      f.t += dt;
      f.y += f.vy * dt;
      let done = false;
      if (f.followPlayer) {
        f.x = pl.x;
        f.y = pl.y + 20;
      }
      const frame = f.t * f.fps;
      if (f.life > 0) done = f.t >= f.life;
      else if (!f.loop && frame >= f.anim.frames.length) done = true;
      if (done) {
        this.fxPool.push(f);
        fxs[i] = fxs[fxs.length - 1]!;
        fxs.pop();
      }
    }
    const ns = this.nums;
    for (let i = ns.length - 1; i >= 0; i--) {
      const n = ns[i]!;
      n.t += dt;
      n.y += n.vy * dt;
      n.vy *= 0.94;
      if (n.t >= n.life) {
        this.numPool.push(n);
        ns[i] = ns[ns.length - 1]!;
        ns.pop();
      }
    }
  }

  // ------------------------------------------------------------------ End
  private endGame(win: boolean): void {
    this.calm();
    this.state = win ? 'win' : 'gameover';
    this.input.reset();
    const m = this.meta;
    const minutes = Math.floor(this.time / 60);
    const coinsTime = minutes * 10;
    const coins = this.runCoins + coinsTime;
    const before = { ...m.flags };
    m.coins += coins;
    m.totalKills += this.kills;
    if (this.time > m.best) m.best = this.time;
    if (this.time >= 600) m.flags.survived10 = true;
    if (this.kills >= 500) m.flags.kills500 = true;
    if (this.mixerBeatenRun) m.flags.mixerBeaten = true;
    if (win) m.flags.won = true;
    if (this.level >= 25) m.flags.level25 = true;
    const unlocks: string[] = [];
    if (!before.survived10 && m.flags.survived10) unlocks.push('ida');
    if (!before.level25 && m.flags.level25) unlocks.push('turret');
    if (!before.mixerBeaten && m.flags.mixerBeaten) unlocks.push('mixer');
    if (!before.kills500 && m.flags.kills500) unlocks.push('pipewrench');
    if (m.totalKills >= 1000 && m.totalKills - this.kills < 1000) unlocks.push('kalle');
    saveMeta(m);
    void charUnlocked;
    const s: Summary = {
      time: this.time, kills: this.kills, level: this.level, character: this.char.id, best: m.best,
      coins, coinsKills: this.runCoins - this.coinsBoss, coinsTime, coinsBoss: this.coinsBoss,
      won: win, survivedShift: this.time >= 900, unlocks,
    };
    if (win) this.ui.win(s);
    else this.ui.gameOver(s);
  }

  saveSettings(): void {
    saveMeta(this.meta);
  }

  buyYard(id: string): boolean {
    const def = YARD_ITEMS.find((b) => b.id === id);
    if (!def) return false;
    const lvl = yardLevel(this.meta, id);
    const cost = def.base * (lvl + 1);
    if (lvl >= def.max || this.meta.coins < cost) return false;
    this.meta.coins -= cost;
    this.meta.yard[id] = lvl + 1;
    saveMeta(this.meta);
    return true;
  }

  resetYard(): void {
    let refund = 0;
    for (const def of YARD_ITEMS) {
      const lvl = yardLevel(this.meta, def.id);
      for (let n = 1; n <= lvl; n++) refund += def.base * n;
    }
    this.meta.coins += refund;
    this.meta.yard = {};
    saveMeta(this.meta);
  }

  // ------------------------------------------------------------------ Render
  private trackFps(dt: number): void {
    if (this.state !== 'playing') return;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 3) {
      const fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      if (fps < 50) {
        this.cap = Math.max(150, Math.floor(this.cap * 0.85));
        this.halfFx = true;
        this.goodT = 0;
      } else if (fps > 58) {
        this.goodT += 3;
        if (this.goodT >= 10) {
          this.goodT = 0;
          this.cap = Math.min(this.capMax, Math.ceil(this.cap * 1.1));
          if (this.cap >= this.capMax) this.halfFx = false;
        }
      }
    }
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, dtFrame = 0.016): void {
    this.trackFps(dtFrame);
    const p = this.player;
    // Camera shake only while playing (also in slow motion); the camera stays still in every pause.
    const shaking = this.state === 'playing' && this.shake > 0;
    if (!shaking && this.state !== 'playing' && this.shake > 0) this.shake = 0;
    const sx = shaking ? rand(-this.shake, this.shake) : 0;
    const sy = shaking ? rand(-this.shake, this.shake) : 0;
    this.camX = p.x;
    this.camY = p.y + 8;
    this.camera.position.x = this.camX + sx;
    this.camera.position.y = this.camY + sy;
    this.ground.update(this.camX + sx, this.camY + sy, this.world);

    const b = this.batch;
    b.begin();
    const cx = this.camX;
    const cy = this.camY;
    const halfW = this.viewW / 2 + 70;
    const halfH = this.viewH / 2 + 70;
    const inGame = this.state !== 'menu';
    this.world.draw(b, cx, cy, this.viewW, this.viewH, p.x, p.y);

    if (inGame) {
      this.drawZones(b);
      this.drawPickups(b, cx, cy, halfW, halfH);
      this.drawTruck(b, cx, cy);
      this.drawArena(b, cy);
      // Shadows + enemies
      const dying = this.state === 'dying';
      if (!dying) b.quad(b.shadow, p.x, p.y + 1, Z_SHADOW, 34, 16, 0, false, 0x000000, 1, 0.45);
      for (const e of this.enemies) {
        if (Math.abs(e.x - cx) > halfW || Math.abs(e.y - cy) > halfH) continue;
        b.quad(b.shadow, e.x, e.y + 1, Z_SHADOW, e.r * 2.8, e.r * 1.4, 0, false, 0x000000, 1, 0.4 * e.alpha);
        if (e.variant === Variant.Elite || e.boss) {
          const rf = this.aRing.frames[Math.floor(this.time * 6) % this.aRing.frames.length]!;
          b.quad(rf, e.x, e.y + 2, Z_SHADOW + 2, e.r * 3, e.r * 2, 0, false, e.boss ? 0xff4a2e : 0xffc83d, 1, 0.6);
        }
      }
      for (const e of this.enemies) {
        if (Math.abs(e.x - cx) > halfW || Math.abs(e.y - cy) > halfH) continue;
        this.drawEnemy(b, e, cy);
      }
      // Boss telegraph (charge attack)
      if (this.bossRef && this.bossRef.def.boss === 2 && this.bossRef.st === 1) {
        const e = this.bossRef;
        const a = Math.atan2(e.dy, e.dx);
        const len = 260 * 0.7;
        const on = Math.floor(e.timer * 10) % 2 === 0;
        b.quad(b.tape, e.x + Math.cos(a) * len * 0.5, e.y + Math.sin(a) * len * 0.5, Z_SHADOW + 3, len + e.r, 14, a, false, 0xffffff, 0, on ? 0.9 : 0.4);
      }
      for (const w of this.weapons) w.draw(this, b);
      this.drawPlayer(b);
      // own projectiles
      for (const q of this.projs) {
        const a = q.anim;
        const fr = a.frames[Math.floor(q.t * 14) % a.frames.length]!;
        const s = q.size / a.refH;
        let yy = q.y;
        if (q.kind === PKind.Lob) {
          const k = Math.min(1, q.t / q.dur);
          yy += Math.sin(k * Math.PI) * 60;
          b.quad(b.shadow, q.x, q.y, Z_SHADOW + 1, 22, 10, 0, false, 0x000000, 1, 0.35);
        }
        b.sprite(fr, q.x, yy, Z_PROJ - (q.y - cy) * 0.0005, s, q.rot, false, q.tint, q.mix);
      }
      // enemy projectiles (reddish)
      const rock = this.aRock;
      for (const q of this.eprojs) {
        const fr = rock.frames[Math.floor(q.t * 8) % rock.frames.length]!;
        b.sprite(fr, q.x, q.y + 8, Z_PROJ - (q.y - cy) * 0.0005, 20 / rock.refH, q.t * 6, false, 0xff8a6a, 0.55);
      }
      // Effects
      for (const f of this.fxs) {
        if (f.delay > 0) continue;
        if (Math.abs(f.x - cx) > halfW + 80 || Math.abs(f.y - cy) > halfH + 80) continue;
        const a = f.anim;
        const idx = f.loop ? Math.floor(f.t * f.fps) % a.frames.length : Math.min(a.frames.length - 1, Math.floor(f.t * f.fps));
        let alpha = f.alpha;
        let size = f.size;
        if (f.life > 0) {
          if (f.shrink) {
            const k = clamp(f.t / f.life, 0, 1);
            size *= 1 - 0.4 * k;
            alpha *= 1 - k;
          } else alpha *= clamp((f.life - f.t) * 4, 0, 1);
        }
        const z = f.ground ? Z_SHADOW + 4 : Z_FX + f.zOff;
        b.sprite(a.frames[idx]!, f.x, f.y, z, size / a.refH, f.rot, f.flip, f.tint, f.mix, alpha);
      }
      if (this.debugHit) this.drawHitboxes(b);
      // Player health bar
      if (this.state !== 'dying') {
        const hw = 32;
        const fr = clamp(p.hp / p.maxHp, 0, 1);
        b.rect(p.x, p.y - 7, Z_NUM - 1, hw + 2, 6, 0x120d08, 0.85);
        b.rect(p.x - hw / 2 + (hw * fr) / 2, p.y - 7, Z_NUM - 0.5, hw * fr, 4, fr < 0.3 ? 0xff3a2a : 0xe83a2a);
      }
      // Damage numbers
      for (const n of this.nums) {
        const s = n.val.toString();
        const sc = n.scale * (n.t < 0.1 ? 0.6 + n.t * 4 : 1);
        const w = 10.5 * sc;
        const al = clamp((n.life - n.t) * 5, 0, 1);
        let x = n.x - (s.length * w) / 2 + w / 2;
        for (let i = 0; i < s.length; i++) {
          b.quad(b.digits[s.charCodeAt(i) - 48]!, x, n.y, Z_NUM, 13 * sc, 16 * sc, 0, false, n.tint, -1, al);
          x += w;
        }
      }
      this.drawOverlays(b, cx, cy);
    }
    b.end();
    renderer.render(scene, this.camera);
    this.ui.hud(this);
  }

  /** Debug (key H, dev only): hit circles of enemies (red), projectiles (cyan), props (yellow), player (green). */
  private drawHitboxes(b: SpriteBatch): void {
    for (const e of this.enemies) b.quad(b.disc, e.x, e.y + e.cy, Z_NUM - 2, e.hr * 2, e.hr * 2, 0, false, 0xff2a2a, 1, 0.35);
    for (const q of this.projs) if (q.r > 0) b.quad(b.disc, q.x, q.y, Z_NUM - 2, q.r * 2, q.r * 2, 0, false, 0x2affff, 1, 0.6);
    for (const d of this.world.live) b.quad(b.disc, d.x, d.y + d.h * 0.4, Z_NUM - 2, d.hitR * 2, d.hitR * 2, 0, false, 0xffe02a, 1, 0.35);
    const p = this.player;
    b.quad(b.disc, p.x, p.y + 20, Z_NUM - 2, p.r * 2, p.r * 2, 0, false, 0x2aff2a, 1, 0.35);
  }

  private drawEnemy(b: SpriteBatch, e: Enemy, cy: number): void {
    const a = this.enemyAnims.get(e.def.id)!;
    const f = a.frames[0]!;
    const scale = (e.def.height * e.scaleMul) / a.refH;
    const wob = e.boss ? 0.5 : 1;
    const bob = Math.abs(Math.sin(e.t * 8));
    const hop = bob * 2 * (e.boss ? 2 : 1) * scale * a.refH * 0.025;
    const rot = Math.sin(e.t * 8) * 0.1 * wob;
    const sq = 0.06 * (bob - 0.5) * 2;
    const z = Z_UNIT - (e.y - cy) * 0.0005;
    let tint = e.tintMix > 0 ? e.tint : 0xffffff;
    let mix = e.tintMix;
    if (e.flash > 0) {
      tint = 0xffffff;
      mix = e.boss ? 0.3 : 0.85;
    } else if (e.def.boss === 1 || e.def.ai === 'kamikaze' || e.def.ai === 'charge') {
      const warn = (e.def.ai === 'kamikaze' && e.st === 1) || (e.def.ai === 'charge' && e.st === 1);
      if (warn) {
        tint = 0xff3a2a;
        mix = Math.floor(e.t * 20) % 2 === 0 ? 0.7 : 0.25;
      }
    } else if (e.def.boss === 3 && e.timer > 3) {
      tint = 0xff6a3a;
      mix = 0.25;
    }
    if (this.freezeT > 0) {
      tint = 0x9ad8ff;
      mix = 0.5;
    } else if (e.stunT > 0) {
      tint = 0xffff88;
      mix = 0.35;
    }
    b.quad(f, e.x, e.y + hop, z, f.w * scale * (1 - sq), f.h * scale * (1 + sq), rot, e.flip, tint, mix, e.alpha * (e.ignoreProps > 0 ? 0.6 : 1));
  }

  private drawZones(b: SpriteBatch): void {
    for (const z of this.zones) {
      if (z.visual === 1 && z.delay > 0) {
        const k = 1 - z.delay / Math.max(0.01, z.delay0);
        const col = z.hostile ? 0xff3a1a : z.color;
        b.quad(b.disc, z.x, z.y, Z_SHADOW + 1, z.r * 2, z.r * 2 * 0.75, 0, false, col, 1, 0.2 + 0.3 * k);
      } else if (z.visual === 2) {
        const a = Math.min(0.45, z.life * 0.5);
        b.quad(b.disc, z.x, z.y, Z_SHADOW + 1, z.r * 2, z.r * 2 * 0.75, 0, false, z.color, 1, a);
      }
    }
  }

  private pickupTint(v: number): { c: number; h: number } {
    if (v >= 100) return { c: 0xffd54a, h: 22 };
    if (v >= 25) return { c: 0xff5a5a, h: 18 };
    if (v >= 5) return { c: 0x6aff6a, h: 15 };
    return { c: 0x5ae0ff, h: 12 };
  }

  private drawPickups(b: SpriteBatch, cx: number, cy: number, halfW: number, halfH: number): void {
    for (const k of this.pickups) {
      const off = Math.abs(k.x - cx) > halfW || Math.abs(k.y - cy) > halfH;
      if (off) continue;
      const bob = Math.sin(k.t * Math.PI * 3) * 2;
      const z = Z_PICK - (k.y - cy) * 0.0005;
      b.quad(b.shadow, k.x, k.y - 1, Z_SHADOW + 0.5, 16, 7, 0, false, 0x000000, 1, 0.35);
      if (k.kind === PickKind.Gem) {
        const t = this.pickupTint(k.value);
        const f = this.aBolt.frames[0]!;
        const pulse = 0.3 + 0.1 * Math.sin(k.t * 6);
        if (k.value >= 100) b.quad(b.disc, k.x, k.y + t.h * 0.5, z - 0.01, t.h * 2.4, t.h * 2, 0, false, t.c, 1, 0.4);
        else b.quad(b.disc, k.x, k.y + t.h * 0.5, z - 0.01, t.h * 1.5, t.h * 1.3, 0, false, t.c, 1, pulse);
        b.sprite(f, k.x, k.y + 2 + bob, z, t.h / this.aBolt.refH, 0, false, t.c, 0.55);
      } else if (k.kind === PickKind.Coin) {
        const big = k.value >= 5;
        const h = big ? 18 : 14;
        b.sprite(this.aCoin.frames[0]!, k.x, k.y + 2 + bob, z, h / this.aCoin.refH, 0, false, 0xffc83d, 0.5);
      } else {
        const a = k.kind === PickKind.Heal ? this.aHeal : k.kind === PickKind.Magnet ? this.aMagnet : k.kind === PickKind.Chest ? this.aChest : k.kind === PickKind.Energy ? this.aEnergy : this.aBeacon;
        const h = k.kind === PickKind.Chest ? 30 : k.kind === PickKind.Beacon ? 24 : 22;
        if (k.kind !== PickKind.Heal) {
          const glow = k.kind === PickKind.Chest ? 0xffd54a : k.kind === PickKind.Magnet ? 0xff5a5a : k.kind === PickKind.Energy ? 0xffe14a : 0xff9a2e;
          const rf = this.aRing.frames[Math.floor(k.t * 4) % this.aRing.frames.length]!;
          b.quad(rf, k.x, k.y + 4, z - 0.01, h * 1.8, h * 1.3, 0, false, glow, 1, 0.35 + 0.2 * Math.sin(k.t * 5));
        }
        let tint = 0xffffff;
        let mix = 0;
        if (k.kind === PickKind.Chest) {
          tint = 0xffc400;
          mix = 0.2;
        }
        let alpha = 1;
        if (k.kind === PickKind.Beacon) alpha = 0.75 + 0.25 * Math.sin(k.t * 8);
        b.sprite(a.frames[0]!, k.x, k.y + bob, z, h / a.refH, 0, false, tint, mix, alpha);
      }
    }
  }

  private drawTruck(b: SpriteBatch, cx: number, cy: number): void {
    const t = this.truck;
    if (!t) return;
    const len = t.total;
    if (t.t < 0) {
      // Telegraph: warning tape on the lane + blinking traffic light at the edge
      const a = Math.atan2(t.dy, t.dx);
      const mx = t.x + t.dx * len * 0.5;
      const my = t.y + t.dy * len * 0.5;
      b.quad(b.tape, mx, my, Z_SHADOW + 2, len, 40, a, false, 0xffffff, 0, 0.6);
      if (Math.floor(this.time * 6) % 2 === 0) {
        const hw = this.viewW / 2 - 24;
        const hh = this.viewH / 2 - 60;
        const lx = clamp(t.x - cx, -hw, hw) + cx;
        const ly = clamp(t.y - cy, -hh, hh) + cy;
        b.sprite(this.aLight.frames[0]!, lx, ly, Z_NUM + 1, 50 * 0.6 / this.aLight.refH);
      }
      return;
    }
    const s = 80 / this.aTruck.refH;
    b.quad(b.shadow, t.x, t.y, Z_SHADOW + 1, 120, 40, 0, false, 0, 1, 0.4);
    b.sprite(this.aTruck.frames[0]!, t.x, t.y + Math.sin(this.time * 40), Z_UNIT - (t.y - cy) * 0.0005, s, 0, t.dx < 0);
  }

  private drawArena(b: SpriteBatch, cy: number): void {
    const a = this.arena;
    if (!a) return;
    const n = 16;
    const R = 360;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU;
      const x = a.x + Math.cos(ang) * R;
      const y = a.y + Math.sin(ang) * R;
      const t0 = i * 0.06;
      const k = clamp((a.t - t0) / 0.3, 0, 1);
      if (a.t < t0) continue;
      if (k >= 1 && a.t - t0 < 0.34 && a.t - t0 >= 0.3 && this.fxs.length < this.fxCap) {
        // one-off dust on impact (only once per segment per time window)
        if (((this.frameNo + i) & 1) === 0) this.spawnFx('fx_dust', x, y, 50, { fps: 16 });
      }
      const f = (i % 4 === 0 ? this.aFenceSign : this.aFence);
      const fr = f.frames[0]!;
      const off = (1 - k) * 40;
      b.sprite(fr, x, y + off, Z_UNIT - (y - cy) * 0.0005, 60 / f.refH, 0, false, 0xffffff, 0, a.fade < 1 ? Math.max(0, a.fade) : 1);
    }
  }

  private drawPlayer(b: SpriteBatch): void {
    const p = this.player;
    const walk = this.walk;
    const scale = 46 / walk.refH;
    const z = Z_UNIT - (p.y - this.camY) * 0.0005;
    let f;
    if (p.attackT > 0) {
      const k = 1 - p.attackT / 0.25;
      f = this.attack.frames[Math.min(this.attack.frames.length - 1, Math.floor(clamp(k, 0, 0.99) * this.attack.frames.length))]!;
    } else if (p.moving) {
      f = walk.frames[Math.floor(p.animT * 8) % walk.frames.length]!;
    } else {
      f = walk.frames[0]!;
    }
    const hop = p.moving ? Math.abs(Math.sin(p.animT * 16)) * 1.2 : 0;
    if (this.state === 'dying') {
      const k = clamp(1 - this.dyingT / 1.2, 0, 1);
      b.sprite(walk.frames[0]!, p.x, p.y, z, scale, -k * (Math.PI / 2) * (p.flip ? -1 : 1), p.flip, 0x777777, 0.6, 1 - k * 0.8);
      return;
    }
    const blink = p.iframes > 0 && Math.floor(p.iframes * 20) % 2 === 0;
    const rage = this.char.rageBelow && p.hp < p.maxHp * this.char.rageBelow;
    let tint = 0xffffff;
    let mix = 0;
    if (p.hurtT > 0) {
      tint = 0xff3a2a;
      mix = 0.6;
    } else if (rage && Math.floor(this.time * 2) % 2 === 0) {
      tint = 0xff4a3a;
      mix = 0.3;
    } else if (this.overtimeT > 0) {
      tint = 0xffe14a;
      mix = 0.25;
    }
    b.sprite(f, p.x, p.y + hop, z, scale, 0, p.flip, tint, mix, blink ? 0.5 : 1);
  }

  /** Edge arrows, warnings, rush border. */
  private drawOverlays(b: SpriteBatch, cx: number, cy: number): void {
    const hw = this.viewW / 2 - 22;
    const hh = this.viewH / 2 - 56;
    const arrow = (tx: number, ty: number, color: number): void => {
      const dx = tx - cx;
      const dy = ty - cy;
      if (Math.abs(dx) < hw + 14 && Math.abs(dy) < hh + 14) return;
      const k = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
      const x = cx + dx * k;
      const y = cy + dy * k;
      const a = Math.atan2(dy, dx);
      b.quad(b.bar, x, y, Z_NUM + 1, 22, 5, a + 2.6, false, color, 1, 0.9);
      b.quad(b.bar, x, y, Z_NUM + 1, 22, 5, a - 2.6, false, color, 1, 0.9);
    };
    if (this.bossRef) arrow(this.bossRef.x, this.bossRef.y, 0xff3a2a);
    let n = 0;
    for (const e of this.enemies) {
      if (e.variant === Variant.Elite && !e.dead && n++ < 6) arrow(e.x, e.y, 0xffc83d);
    }
    for (const k of this.pickups) {
      if (k.kind === PickKind.Chest) arrow(k.x, k.y, 0xffd54a);
      else if (k.kind === PickKind.Magnet) arrow(k.x, k.y, 0xff6a6a);
    }
    // Cone swarm warning: red arrows at the edge
    for (const w of this.spawner.warn) {
      if (Math.floor(w.t * 4) % 2 === 1) continue;
      const k = Math.min(hw / Math.abs(w.x || 1e-6), hh / Math.abs(w.y || 1e-6));
      const x = cx + w.x * k;
      const y = cy + w.y * k;
      const a = Math.atan2(-w.y, -w.x);
      for (let i = -3; i <= 3; i++) {
        const px = x + w.dx * i * 26;
        const py = y + w.dy * i * 26;
        b.quad(b.bar, px, py, Z_NUM + 1, 22, 6, a + 0.6, false, 0xff3a2a, 1, 0.9);
        b.quad(b.bar, px, py, Z_NUM + 1, 22, 6, a - 0.6, false, 0xff3a2a, 1, 0.9);
      }
    }
    // Quitting-time rush: pulsing orange border
    if (this.time >= this.spawner.rushFrom && this.time < this.spawner.rushUntil && this.spawner.rushUntil > 0) {
      const al = 0.25 + 0.25 * (0.5 + 0.5 * Math.sin(this.time * 6));
      const W = this.viewW;
      const H = this.viewH;
      b.rect(cx, cy + H / 2 - 4, Z_NUM + 2, W, 8, 0xff8a1e, al);
      b.rect(cx, cy - H / 2 + 4, Z_NUM + 2, W, 8, 0xff8a1e, al);
      b.rect(cx - W / 2 + 4, cy, Z_NUM + 2, 8, H, 0xff8a1e, al);
      b.rect(cx + W / 2 - 4, cy, Z_NUM + 2, 8, H, 0xff8a1e, al);
    }
  }
}
