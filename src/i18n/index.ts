import { de } from './de';
import { en, type Dict } from './en';

export type Lang = 'en' | 'de';
export const LANGS: readonly Lang[] = ['en', 'de'];

const KEY = 'bs_lang';

/** Reads the saved language; localStorage may be missing (sandboxed iframe) -> English. */
function load(): Lang {
  try {
    return localStorage.getItem(KEY) === 'de' ? 'de' : 'en';
  } catch {
    return 'en';
  }
}

let lang: Lang = load();
const listeners: Array<(l: Lang) => void> = [];
const nfCache = new Map<string, Intl.NumberFormat>();

export const getLang = (): Lang => lang;

/** The dictionary of the current language. */
export const t = (): Dict => (lang === 'de' ? de : en);

function applyDocument(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.title = t().docTitle;
}

export function setLang(l: Lang): void {
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* sandbox without storage: the choice lasts until reload */
  }
  applyDocument();
  for (const cb of listeners) cb(l);
}

export function onLangChange(cb: (l: Lang) => void): void {
  listeners.push(cb);
}

export function initLang(): void {
  applyDocument();
}

/** Locale-aware number formatting (Intl): decimal comma/point, thousands separator. */
export function num(v: number, maxFrac = 1): string {
  const loc = lang === 'de' ? 'de-DE' : 'en-US';
  const key = `${loc}:${maxFrac}`;
  let nf = nfCache.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(loc, { maximumFractionDigits: maxFrac });
    nfCache.set(key, nf);
  }
  return nf.format(v);
}

/** "120%" / "120 %" */
export const pct = (v: number): string => t().fmt.percent(num(v, 0));
/** Signed value with a real minus sign, e.g. "+20" / "−3,5". */
export const signed = (v: number, maxFrac = 1): string => (v === 0 ? '' : `${v > 0 ? '+' : '−'}${num(Math.abs(v), maxFrac)}`);
/** Signed percentage, e.g. "+20%" / "−16 %". */
export const signedPct = (v: number): string => (v === 0 ? '' : `${v > 0 ? '+' : '−'}${pct(Math.abs(v))}`);

interface WeaponText { name: string; desc: string; evoName?: string; evoDesc?: string }
interface NameDesc { name: string; desc: string }
interface CharText { name: string; title: string; desc: string; strength: string; weakness: string; passive: string; lock: string }

export const weaponText = (id: string): WeaponText => (t().weapons as Record<string, WeaponText>)[id]!;
export const passiveText = (id: string): NameDesc => (t().passives as Record<string, NameDesc>)[id]!;
export const charText = (id: string): CharText => (t().chars as Record<string, CharText>)[id]!;
export const yardText = (id: string): NameDesc => (t().yardItems as Record<string, NameDesc>)[id]!;
export const bossName = (boss: number): string => (t().bosses as Record<string, string>)[`boss${boss}`] ?? t().hud.boss;

/** Native display name of a language (for the language switch). */
export const langName = (l: Lang): string => (l === 'de' ? de : en).langName;
