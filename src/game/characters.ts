/** Character data. Texts (name, title, strengths, …) live in i18n: `charText(id)`. */
export interface CharacterDef {
  id: string;
  walk: string;
  attack: string;
  weapon: string;
  hp: number;
  speed: number;
  /** Bonus multipliers and special values */
  dmg?: number;
  xp?: number;
  /** Cooldown reduction (added to mods.cd) */
  cd?: number;
  armor?: number;
  pierceBonus?: number;
  rageBelow?: number;
  rageDmg?: number;
  cards?: number;
  color: number;
  /** Has an unlock condition (text in i18n `chars.<id>.lock`) */
  locked?: boolean;
}

export const CHARACTERS: CharacterDef[] = [
  { id: 'wrench', walk: 'p_wrench_walk', attack: 'p_wrench_attack', weapon: 'wrench', hp: 90, speed: 122, cd: 0.1, color: 0xeeeeee },
  { id: 'hammer', walk: 'p_hammer_walk', attack: 'p_hammer_attack', weapon: 'hammer', hp: 140, speed: 100, armor: 1, rageBelow: 0.3, rageDmg: 1.25, color: 0xc0623a },
  { id: 'driller', walk: 'p_driller_walk', attack: 'p_driller_attack', weapon: 'drill', hp: 100, speed: 112, pierceBonus: 1, color: 0xf2c200, locked: true },
  { id: 'engineer', walk: 'p_engineer_walk', attack: 'p_engineer_attack', weapon: 'drone', hp: 95, speed: 112, dmg: 0.9, xp: 1.15, cards: 4, color: 0x58a8d8, locked: true },
];
