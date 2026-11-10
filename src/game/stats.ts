import { num, pct, signed, signedPct, t } from '../i18n';
import type { Game } from './game';
import type { StatKey } from './passives';
import { TUNE } from './tune';

export interface StatWeapon {
  icon: string;
  name: string;
}

export interface StatRow {
  id: string;
  name: string;
  /** Current value, e.g. "120%" */
  value: string;
  /** Bonus over the base value, e.g. "+20%" (empty = no bonus) */
  bonus: string;
  /** 1 = advantage, -1 = disadvantage, 0 = neutral */
  good: number;
  desc: string;
  /** Extra note line (e.g. early bonus) */
  note?: string;
  /** Instead of a weapon list: text saying what the value affects (non-weapon stat) */
  scope?: string;
  /** Weapons of the player that use the value (from WeaponDef.uses) */
  weapons: StatWeapon[];
}

/** All player values that really exist in the code (mods, character, early bonus, site yard, revive). */
export function buildStats(g: Game): StatRow[] {
  const m = g.mods;
  const p = g.player;
  const c = g.char;
  const tx = t().stats;
  const rows: StatRow[] = [];

  const weaponsFor = (key: StatKey): StatWeapon[] =>
    g.weapons.filter((w) => w.def.uses.includes(key)).map((w) => ({ icon: w.def.icon, name: w.displayName }));

  /** Ratio stat (100% = base). lowerIsBetter: a smaller value is an advantage (cooldown). */
  const ratio = (id: 'cd' | 'area' | 'projSpeed' | 'duration' | 'kb' | 'luck', v: number, key: StatKey, lowerIsBetter = false): void => {
    const d = Math.round((v - 1) * 100);
    rows.push({
      id, name: tx[id].name, value: pct(Math.round(v * 100)), bonus: signedPct(d),
      good: d === 0 ? 0 : (d < 0) === lowerIsBetter ? 1 : -1, desc: tx[id].desc, weapons: weaponsFor(key),
    });
  };
  const own = (id: 'maxhp' | 'regen' | 'armor' | 'speed' | 'magnet' | 'xp' | 'revive' | 'cards', value: string, bonus: string, desc: string, scope: string): void => {
    rows.push({ id, name: tx[id].name, value, bonus, good: bonus ? 1 : 0, desc, scope, weapons: [] });
  };

  // Damage: the factor that actually applies (incl. early bonus and fury)
  const dmgV = g.dmg(1);
  const early = TUNE.earlyDmg > 0 ? TUNE.earlyDmg * Math.max(0, 1 - g.time / 60 / TUNE.earlyMin) : 0;
  const dd = Math.round((dmgV - 1) * 100);
  const noteParts: string[] = [];
  if (early > 0.005) noteParts.push(tx.earlyNote(pct(Math.round(early * 100)), TUNE.earlyMin));
  if (c.rageBelow && p.hp < p.maxHp * c.rageBelow) noteParts.push(tx.rageNote(pct(Math.round(((c.rageDmg ?? 1) - 1) * 100))));
  rows.push({
    id: 'dmg', name: tx.dmg.name, value: pct(Math.round(dmgV * 100)), bonus: signedPct(dd),
    good: dd > 0 ? 1 : dd < 0 ? -1 : 0, desc: tx.dmg.desc, note: noteParts.join(' · ') || undefined, weapons: weaponsFor('dmg'),
  });

  own('maxhp', `${Math.round(p.maxHp)}`, signed(Math.round(p.maxHp - c.hp)), tx.maxhp.desc, tx.scopePlayer);

  const regen = m.regen + TUNE.baseRegen * Math.max(0, 1 - g.time / 60 / TUNE.regenMin);
  own('regen', `${num(regen)} ${tx.perSecond}`, regen > 0 ? signed(regen) : '', tx.regen.desc, tx.scopePlayer);

  own('armor', `${m.armor}`, m.armor > 0 ? `+${m.armor}` : '', tx.armor.desc, tx.scopePlayer);

  const speedNow = p.speed * (g.overtimeT > 0 ? 1.3 : 1);
  const sd = Math.round((speedNow / c.speed - 1) * 100);
  own('speed', `${Math.round(speedNow)}`, signedPct(sd), g.overtimeT > 0 ? tx.speed.descOvertime : tx.speed.desc, tx.scopePlayer);

  ratio('cd', g.cdOf(1), 'cd', true);
  ratio('area', m.area, 'area');
  rows.push({
    id: 'amount', name: tx.amount.name, value: `+${m.amount}`, bonus: m.amount > 0 ? `+${m.amount}` : '', good: m.amount > 0 ? 1 : 0,
    desc: tx.amount.desc, weapons: weaponsFor('amount'),
  });
  ratio('projSpeed', m.projSpeed, 'projSpeed');
  ratio('duration', m.duration, 'duration');
  ratio('kb', m.kb, 'kb');
  const pierceBonus = c.pierceBonus ?? 0;
  rows.push({
    id: 'pierce', name: tx.pierce.name, value: `+${pierceBonus}`, bonus: pierceBonus > 0 ? `+${pierceBonus}` : '', good: pierceBonus > 0 ? 1 : 0,
    desc: tx.pierce.desc, weapons: weaponsFor('pierce'),
  });
  ratio('luck', m.luck, 'luck');
  const luckRow = rows[rows.length - 1]!;
  luckRow.weapons = [];
  luckRow.scope = tx.scopeDrops;

  const magNow = TUNE.magnet * m.magnet;
  own('magnet', `${Math.round(magNow)} u`, signedPct(Math.round((m.magnet - 1) * 100)), tx.magnet.desc, tx.scopePickups);

  own('xp', pct(Math.round(m.xp * 100)), signedPct(Math.round((m.xp - 1) * 100)), tx.xp.desc, tx.scopeXp);

  own('revive', `${g.reviveLeft}`, g.reviveLeft > 0 ? `+${g.reviveLeft}` : '', tx.revive.desc, tx.scopePlayer);

  own('cards', `${c.cards ?? 3}`, (c.cards ?? 3) > 3 ? `+${(c.cards ?? 3) - 3}` : '', tx.cards.desc, tx.scopeLevelups);

  if (c.rageBelow) {
    const act = p.hp < p.maxHp * c.rageBelow;
    rows.push({
      id: 'rage', name: tx.rage.name, value: act ? tx.active : tx.inactive, bonus: signedPct(Math.round(((c.rageDmg ?? 1) - 1) * 100)), good: act ? 1 : 0,
      desc: tx.rage.desc(pct(Math.round(c.rageBelow * 100))), scope: tx.scopeAllDamage, weapons: [],
    });
  }
  return rows;
}
