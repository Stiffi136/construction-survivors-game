/**
 * Balance knobs (central, so the simulated run can adjust them in the dev server).
 * The formulas from design section 8 (xpFor, hpMul, dmgMul, speedMul, spawn table) stay unchanged;
 * these values only soften the ramp-up (minutes 0–8) so a passive player survives >= 3 min.
 * Result of the simulated run (walk in circles, random upgrades, 240 runs, 4 characters): 99.6% >= 180 s (min 177 s), P10 263 s, median 330 s.
 */
export const TUNE = {
  /** Invulnerability after a hit (s); additionally a 0.5 s lock per enemy */
  iframes: 0.5,
  /** Enemy damage at the start as a fraction (grows linearly to 1 within warmMin minutes) */
  warmDmg: 0.3,
  warmMin: 6,
  /** Player damage at the start: +earlyDmg, fading linearly to 0 within earlyMin minutes */
  earlyDmg: 1.5,
  earlyMin: 6,
  /** XP needed for levels 1..xpEarlyN (factor) */
  xpEarly: 0.4,
  xpEarlyN: 6,
  /** Spawn rate factor at the start, grows to 1 over rateMin minutes */
  rateEarly: 0.5,
  rateMin: 6,
  /** Base pickup radius (u) */
  magnet: 110,
  /** Early recovery (HP/s), fades to 0 over regenMin minutes */
  baseRegen: 1.4,
  regenMin: 8,
};
