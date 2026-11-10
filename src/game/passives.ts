export interface Mods {
  dmg: number;
  /** Cooldown multiplier (lower = faster), floor 0.5 */
  cd: number;
  area: number;
  projSpeed: number;
  amount: number;
  duration: number;
  regen: number;
  /** Factor on the pickup radius (base radius lives in TUNE.magnet) */
  magnet: number;
  xp: number;
  move: number;
  armor: number;
  maxHp: number;
  luck: number;
  kb: number;
}

export function baseMods(): Mods {
  return { dmg: 1, cd: 1, area: 1, projSpeed: 1, amount: 0, duration: 1, regen: 0, magnet: 1, xp: 1, move: 1, armor: 0, maxHp: 0, luck: 1, kb: 1 };
}

export interface PassiveDef {
  id: string;
  icon: string;
  max: number;
  /** Texts (name, description) come from i18n: `passiveText(id)` */
  apply(m: Mods, lvl: number): void;
}

export const PASSIVES: PassiveDef[] = [
  { id: 'helmet', icon: 'i_helmet', max: 5, apply: (m, l) => { m.maxHp += 20 * l; } },
  { id: 'vest', icon: 'i_vest', max: 5, apply: (m, l) => { m.armor += l; } },
  { id: 'boots', icon: 'i_boots', max: 5, apply: (m, l) => { m.move += 0.08 * l; } },
  { id: 'gloves', icon: 'i_gloves', max: 5, apply: (m, l) => { m.dmg += 0.1 * l; } },
  { id: 'clipboard', icon: 'i_clipboard', max: 5, apply: (m, l) => { m.cd -= 0.08 * l; } },
  { id: 'blueprint', icon: 'i_blueprint', max: 5, apply: (m, l) => { m.area += 0.1 * l; } },
  { id: 'steelbar', icon: 'i_steelbar', max: 5, apply: (m, l) => { m.duration += 0.15 * l; } },
  { id: 'hook', icon: 'i_hook', max: 5, apply: (m, l) => { m.magnet *= 1 + 0.3 * l; } },
  { id: 'cementbag', icon: 'i_cementbag', max: 5, apply: (m, l) => { m.xp += 0.1 * l; } },
  { id: 'grate', icon: 'i_grate', max: 2, apply: (m, l) => { m.amount += l; } },
  { id: 'ibeam', icon: 'i_ibeam', max: 5, apply: (m, l) => { m.projSpeed += 0.12 * l; m.kb += 0.1 * l; } },
  { id: 'brick', icon: 'i_brick', max: 5, apply: (m, l) => { m.regen += 0.3 * l; } },
  { id: 'cone', icon: 'i_cone', max: 5, apply: (m, l) => { m.luck += 0.1 * l; } },
];

export const PASSIVE_BY_ID: Record<string, PassiveDef> = Object.fromEntries(PASSIVES.map((p) => [p.id, p]));

export type ModKey = keyof Mods;
/** Stat keys used to map stats to weapons: mod fields + the character's pierce bonus */
export type StatKey = ModKey | 'pierce';
