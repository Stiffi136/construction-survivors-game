/**
 * English texts (default language). `de.ts` must provide exactly the same keys (checked by tsc).
 * Dynamic texts are functions; numbers are formatted by the caller via `num()` from `index.ts`.
 */
export const en = {
  langName: 'English',
  docTitle: 'Construction Survivors',

  fmt: {
    /** "120%" – already formatted number n */
    percent: (n: string): string => `${n}%`,
  },

  menu: {
    title: 'CONSTRUCTION<br>SURVIVORS',
    tagline: (coins: string): string => `Survive the 15-minute shift and take down the Demolition Grab! <b class="coin">⚙ ${coins}</b> coins`,
    start: 'START SHIFT',
    yard: 'Site Yard',
    settings: 'Settings',
    hint: 'Move: drag a finger (joystick) or WASD / arrow keys. Attacks are automatic. Pause: Esc / P.',
    locked: (what: string): string => `Locked: ${what}`,
    language: 'Language',
  },

  yard: {
    title: 'SITE YARD',
    sub: (coins: string): string => `<b class="coin">⚙ ${coins}</b> coins – permanent upgrades`,
    level: (lvl: number, max: number): string => `Level ${lvl} / ${max}`,
    max: 'MAX',
    reset: 'Reset all (full refund)',
    back: 'Back',
  },

  settings: {
    title: 'SETTINGS',
    volume: 'Volume',
    vibration: 'Vibration',
    numbers: 'Damage numbers',
    language: 'Language',
    back: 'Back',
  },

  levelup: {
    title: 'LEVEL UP!',
    chestTitle: 'CHEST OPENED!',
    kindWeapon: 'Tool',
    kindPassive: 'Gear',
    kindInstant: 'Instant',
    isNew: 'NEW',
    levelStep: (from: number, to: number): string => `Lv ${from} → ${to}`,
    evolution: (name: string): string => `★ Evolution: ${name}`,
    withPartner: (partner: string): string => `with ${partner}`,
    healName: 'Take a Break',
    healDesc: 'Heals 40% of your health',
  },

  chest: {
    next: 'CONTINUE',
    evoPrefix: 'EVOLUTION! ',
    levelReward: (lvl: number, desc: string): string => `Level ${lvl} – ${desc}`,
    coinsName: (n: string): string => `${n} coins`,
    healText: '+30 health',
  },

  pause: {
    title: 'PAUSE',
    resume: 'RESUME',
    settings: 'Settings',
    restart: 'Restart',
    charSelect: 'Character select',
    gear: 'Equipment',
    stats: 'Stats',
    statsHint: 'Tap a stat to see its effect and the weapons it affects.',
    evoTag: '★ Evolution',
    levelOf: (lvl: number, max: number): string => `Lv ${lvl}/${max}`,
    pause: 'Pause',
  },

  end: {
    gameOver: 'SHIFT OVER!',
    won: 'QUITTING TIME!',
    survivedShift: (who: string): string => `${who} survived the shift – but not the boss.`,
    wipedOut: (who: string): string => `${who} was swept off the construction site.`,
    victory: (who: string): string => `The Demolition Grab is down – ${who} won the night shift!`,
    time: 'Time',
    kills: 'Kills',
    level: 'Level',
    best: 'Best',
    restart: 'RESTART',
    charSelect: 'Character select',
    yard: 'Site Yard',
    coinsLine: (total: string, kills: string, time: string, boss: string): string =>
      `<b class="coin">⚙ +${total}</b> coins<br><span>${kills} collected · ${time} time bonus${boss ? ` · ${boss} boss bonus` : ''}</span>`,
    unlockPrefix: 'New: ',
  },

  hud: {
    level: 'LV',
    boss: 'Boss',
  },

  banners: {
    elite: 'Elite enemy!',
    elites: (n: number): string => `${n}× elite enemies!`,
    bossWarn: (name: string): string => `WARNING: ${name}!`,
    bossDown: (name: string): string => `${name} defeated!`,
    coneSwarm: 'Cone swarm!',
    ring: 'Barricade ring!',
    barrelRain: 'Barrel rain!',
    shiftChange: 'Shift change!',
    rush: 'Quitting-time rush!',
    dumpTruck: 'Dump truck incoming!',
    arena: 'Fence arena!',
    suction: 'Suction!',
    revive: 'Second shift!',
    magnet: 'Magnet!',
    overtime: 'Overtime! Speed +30%',
    workStop: 'Work stoppage!',
  },

  bosses: {
    boss1: 'The Mixing Machine',
    boss2: 'The Site Manager',
    boss3: 'The Demolition Grab',
  },

  evoHint: {
    chest: 'chest from an elite/boss after 5:00',
    maxReached: (chest: string): string => `Max level reached – ${chest}`,
    weaponToMax: (max: number, lvl: number, chest: string): string => `Weapon to Lv ${max} (Lv ${lvl} after the upgrade) + ${chest}`,
    weaponReady: (max: number, chest: string): string => `Weapon Lv ${max} ready – ${chest}`,
    weaponNow: (max: number, lvl: number, chest: string): string => `Weapon to Lv ${max} (now Lv ${lvl}) + ${chest}`,
  },

  cols: {
    damage: 'Damage',
    cooldown: 'Cooldown',
    bits: 'Bits',
    nails: 'Nails',
    blades: 'Blades',
    wrenches: 'Wrenches',
    throws: 'Throws',
    chunks: 'Chunks',
    pierce: 'Pierce',
    range: 'Range',
    radius: 'Radius',
    slams: 'Slams',
    fields: 'Fields',
    sides: 'Sides',
    blast: 'Blast',
    tickDamage: 'Tick damage',
    puddles: 'Puddles',
    duration: 'Duration',
    shotsPerSec: 'Shots/s',
    turrets: 'Turrets',
    interval: 'Interval',
    drones: 'Drones',
    tick: 'Tick',
    knockback: 'Knockback',
    slow: 'Slow',
    stronger: 'Stronger',
  },

  weapons: {
    drill: { name: 'Power Drill', desc: 'Fires piercing drill bits at the nearest enemy.', evoName: 'Tunnel Borer', evoDesc: 'Giant drill bits, unlimited piercing' },
    nailgun: { name: 'Nail Gun', desc: 'Fast nail fans in your walking direction.' },
    saw: { name: 'Circular Saw', desc: 'Throws saw blades that fly back and shred everything.', evoName: 'Diamond Blade', evoDesc: '4 big diamond blades that orbit you at the end' },
    hammer: { name: 'Sledgehammer', desc: 'Ground slam around you that knocks enemies back.', evoName: 'Wrecking Ball', evoDesc: 'Huge slams that stun enemies' },
    jackhammer: { name: 'Jackhammer', desc: 'Makes spike fields erupt under enemies.', evoName: 'Earthquake', evoDesc: '10 fields, spikes along your path too' },
    chainsaw: { name: 'Chainsaw', desc: 'Fast melee arc in your aim direction.' },
    wrench: { name: 'Wrench', desc: 'Wrenches orbit around you permanently.', evoName: 'Torque', evoDesc: '7 wrenches, 15% chance of double damage' },
    pipewrench: { name: 'Pipe Wrench', desc: 'Throws wrenches that explode on impact.' },
    caulkgun: { name: 'Caulk Gun', desc: 'Sticky puddles slow and damage enemies.', evoName: 'Expanding Foam', evoDesc: 'Growing foam puddles, strong slowdown' },
    turret: { name: 'Gun Turret', desc: 'Places automatic turrets.' },
    drone: { name: 'Combat Drone', desc: 'Companion drones shoot enemies with lasers.', evoName: 'Drone Swarm', evoDesc: '5 drones that also collect nearby XP' },
    mixer: { name: 'Cement Mixer', desc: 'Hurls chunks of concrete in all directions.' },
    barrier: { name: 'Barricade', desc: 'Damage aura around you: hits every enemy in the ring and pushes it back.', evoName: 'Exclusion Zone', evoDesc: 'Huge aura that pulls in XP' },
  },

  passives: {
    helmet: { name: 'Hard Hat', desc: '+20 max health' },
    vest: { name: 'Hi-Vis Vest', desc: '+1 armor' },
    boots: { name: 'Safety Boots', desc: '+8% move speed' },
    gloves: { name: 'Work Gloves', desc: '+10% damage' },
    clipboard: { name: 'Clipboard', desc: '−8% cooldown' },
    blueprint: { name: 'Blueprint', desc: '+10% effect area' },
    steelbar: { name: 'Rebar', desc: '+15% duration' },
    hook: { name: 'Crane Hook', desc: '+30% pickup radius' },
    cementbag: { name: 'Cement Bag', desc: '+10% experience' },
    grate: { name: 'Steel Grate', desc: '+1 amount (projectiles, fields, objects)' },
    ibeam: { name: 'I-Beam', desc: '+12% projectile speed, +10% knockback' },
    brick: { name: 'Brick', desc: '+0.3 health per second' },
    cone: { name: 'Traffic Cone', desc: '+10% luck' },
  },

  chars: {
    wrench: {
      name: 'Fitter Susi', title: 'Wrench', desc: 'Wrenches orbit around you.',
      strength: 'fast, safe close protection', weakness: 'low HP, hardly any reach', passive: 'Maintenance: cooldown −10%', lock: '',
    },
    hammer: {
      name: 'Foreman Hans', title: 'Sledgehammer', desc: 'Ground slam around you.',
      strength: 'tough, armor +1', weakness: 'slow, short reach', passive: 'Thick Skin: below 30% HP damage +25%', lock: '',
    },
    driller: {
      name: 'Drillmaster Kalle', title: 'Power Drill', desc: 'Aimed shots at the nearest enemy.',
      strength: 'ranged, piercing', weakness: 'weak in melee', passive: 'Precision: all projectiles pierce +1', lock: 'Defeat 1,000 enemies in total',
    },
    engineer: {
      name: 'Engineer Ida', title: 'Combat Drone', desc: 'A drone fires lasers.',
      strength: 'fast leveling, flexible builds', weakness: 'low damage early (−10%)', passive: 'Planning: XP +15%, 4 instead of 3 cards', lock: 'Survive 10:00 once',
    },
  },

  yardItems: {
    might: { name: 'Strength Training', desc: '+5% damage' },
    maxhp: { name: 'Health Check', desc: '+10 max HP' },
    armor: { name: 'Safety Gear', desc: '+1 armor' },
    regen: { name: 'Break Room', desc: '+0.1 HP/s' },
    speed: { name: 'Good Shoes', desc: '+5% speed' },
    area: { name: 'Bigger Plans', desc: '+5% area' },
    cd: { name: 'Routine', desc: '−3% cooldown' },
    magnet: { name: 'Long Hook', desc: '+20% pickup radius' },
    growth: { name: 'Training Course', desc: '+5% XP' },
    luck: { name: 'Lucky Cone', desc: '+5% luck' },
    revive: { name: 'Second Shift', desc: '1× revive with 50% HP' },
  },

  unlocks: {
    ida: 'Ida and the Combat Drone unlocked',
    turret: 'Gun Turret unlocked',
    mixer: 'Cement Mixer unlocked',
    pipewrench: 'Pipe Wrench unlocked',
    kalle: 'Kalle unlocked',
  },

  weaponLocks: {
    drone: 'Unlock Ida',
    turret: 'Reach level 25',
    mixer: 'Defeat the Mixing Machine',
    pipewrench: '500 kills in one run',
  },

  stats: {
    appliesTo: 'Applies to:',
    noWeapon: 'None of your weapons uses this value.',
    scopePlayer: 'Applies to the player',
    scopeDrops: 'Applies to drops and chests',
    scopePickups: 'Applies to pickups',
    scopeXp: 'Applies to experience',
    scopeLevelups: 'Applies to level-ups',
    scopeAllDamage: 'Applies to the damage of all weapons',
    earlyNote: (pct: string, min: number): string => `Early bonus +${pct} (fades by minute ${min})`,
    rageNote: (pct: string): string => `Fury active: +${pct}`,
    active: 'active',
    inactive: 'inactive',
    perSecond: 'HP/s',
    dmg: { name: 'Damage', desc: 'Increases the damage of all weapons.' },
    maxhp: { name: 'Max health', desc: 'How much damage you can take before the shift ends.' },
    regen: { name: 'Regeneration', desc: 'Health you regain per second. You start with an early recovery that fades over the first minutes.' },
    armor: { name: 'Armor', desc: 'Subtracted from every hit you take (minimum 1 damage).' },
    speed: { name: 'Move speed', desc: 'How fast you run. On roads you run 10% faster.', descOvertime: 'How fast you run (overtime active: +30%).' },
    cd: { name: 'Cooldown', desc: 'Wait time between weapon triggers. Lower is better (floor 50%).' },
    area: { name: 'Area', desc: 'Enlarges radius, reach and size of weapon effects.' },
    amount: { name: 'Amount', desc: 'Extra projectiles, fields, puddles, drones and orbiting objects (Cement Mixer: double).' },
    projSpeed: { name: 'Projectile speed', desc: 'How fast projectiles fly, wrenches orbit and throws land.' },
    duration: { name: 'Duration', desc: 'How long puddles and turrets last.' },
    kb: { name: 'Knockback', desc: 'How far hits push enemies away.' },
    pierce: { name: 'Pierce', desc: 'Extra enemies a projectile passes through (character trait).' },
    luck: { name: 'Luck', desc: 'Better drops: more coins and rare pickups, bigger chests, and at 130% sometimes a 4th level-up card.' },
    magnet: { name: 'Pickup radius', desc: 'XP bolts and coins fly to you from this distance.' },
    xp: { name: 'XP bonus', desc: 'Multiplies the experience you collect.' },
    revive: { name: 'Revives', desc: 'On death you come back once with 50% health (Site Yard: Second Shift).' },
    cards: { name: 'Level-up cards', desc: 'How many upgrades you can choose from on a level-up.' },
    rage: { name: 'Thick Skin', desc: (pct: string): string => `Below ${pct} health your damage rises (character trait).` },
  },
};

/** Structural type shared by all languages: same keys, same function signatures. */
type DeepStr<T> = {
  [K in keyof T]: T[K] extends string ? string : T[K] extends (...a: infer A) => string ? (...a: A) => string : DeepStr<T[K]>;
};
export type Dict = DeepStr<typeof en>;
