/** Meta progress (localStorage `bs_meta_v1`): coins, site yard, unlocks, settings. */
import { t } from '../i18n';

/** Site-yard upgrade. Name/description live in i18n: `yardText(id)`. */
export interface YardDef {
  id: string;
  icon: string;
  max: number;
  base: number;
}

export const YARD_ITEMS: YardDef[] = [
  { id: 'might', icon: 'i_gloves', max: 5, base: 100 },
  { id: 'maxhp', icon: 'i_helmet', max: 3, base: 100 },
  { id: 'armor', icon: 'i_vest', max: 2, base: 200 },
  { id: 'regen', icon: 'i_brick', max: 3, base: 150 },
  { id: 'speed', icon: 'i_boots', max: 2, base: 150 },
  { id: 'area', icon: 'i_blueprint', max: 2, base: 200 },
  { id: 'cd', icon: 'i_clipboard', max: 2, base: 300 },
  { id: 'magnet', icon: 'i_hook', max: 2, base: 100 },
  { id: 'growth', icon: 'i_cementbag', max: 3, base: 150 },
  { id: 'luck', icon: 'i_cone', max: 3, base: 150 },
  { id: 'revive', icon: 'i_coffee', max: 1, base: 1500 },
];

export interface Settings {
  volume: number;
  vibrate: boolean;
  numbers: boolean;
}

export interface Flags {
  survived10: boolean;
  level25: boolean;
  mixerBeaten: boolean;
  kills500: boolean;
  won: boolean;
}

export interface Meta {
  coins: number;
  yard: Record<string, number>;
  totalKills: number;
  best: number;
  flags: Flags;
  settings: Settings;
}

const KEY = 'bs_meta_v1';

export function defaultMeta(): Meta {
  return {
    coins: 0,
    yard: {},
    totalKills: 0,
    best: 0,
    flags: { survived10: false, level25: false, mixerBeaten: false, kills500: false, won: false },
    settings: { volume: 0.6, vibrate: true, numbers: true },
  };
}

export function loadMeta(): Meta {
  const d = defaultMeta();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    // Older saves stored the site-yard levels under the key `bauhof`.
    const j = JSON.parse(raw) as Partial<Meta> & { bauhof?: Record<string, number> };
    return {
      coins: Number(j.coins) || 0,
      yard: { ...(j.yard ?? j.bauhof ?? {}) },
      totalKills: Number(j.totalKills) || 0,
      best: Number(j.best) || 0,
      flags: { ...d.flags, ...(j.flags ?? {}) },
      settings: { ...d.settings, ...(j.settings ?? {}) },
    };
  } catch {
    return d;
  }
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* sandbox without storage */
  }
}

export const yardLevel = (m: Meta, id: string): number => m.yard[id] ?? 0;
/** Cost of the next level n = lvl + 1 */
export const yardCost = (def: YardDef, lvl: number): number => def.base * (lvl + 1);

/** Unlocks */
export function charUnlocked(m: Meta, id: string, cheat: boolean): boolean {
  if (cheat) return true;
  if (id === 'driller') return m.totalKills >= 1000;
  if (id === 'engineer') return m.flags.survived10;
  return true;
}

export function weaponUnlocked(m: Meta, id: string, cheat: boolean): boolean {
  if (cheat) return true;
  switch (id) {
    case 'drone': return charUnlocked(m, 'engineer', false);
    case 'turret': return m.flags.level25;
    case 'mixer': return m.flags.mixerBeaten;
    case 'pipewrench': return m.flags.kills500;
    default: return true;
  }
}

export function weaponLockText(id: string): string {
  return (t().weaponLocks as Record<string, string>)[id] ?? '';
}
