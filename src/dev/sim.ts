import type { Game } from '../game/game';
import { TUNE } from '../game/tune';
import { hitTest } from './hittest';

/** Dev server only: simulated passive run (walk in circles, random upgrades). */
export function install(game: Game): void {
  const w = window as unknown as Record<string, unknown>;
  w.__tune = TUNE;
  w.__hit = (n?: number) => hitTest(game, n);
  // Hitbox debug view: key H
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH') game.debugHit = !game.debugHit;
  });
  w.__sim = (char: string, maxSec: number, opts: { radius?: number; stand?: boolean; god?: boolean } = {}) => {
    const g = game;
    let res: unknown = null;
    g.ui.levelUp = (o) => g.choose(o[Math.floor(Math.random() * o.length)]!);
    g.ui.chest = () => g.closeChest();
    g.ui.gameOver = (s) => { res = s; };
    g.ui.win = (s) => { res = s; };
    g.start(char);
    let ang = 0;
    const om = 0.72 * (155 / (opts.radius ?? 155));
    g.input.update = function (this: { x: number; y: number }) {
      ang += om / 60;
      this.x = opts.stand ? 0 : Math.cos(ang);
      this.y = opts.stand ? 0 : Math.sin(ang * 0.8);
    };
    const t0 = performance.now();
    let maxEn = 0;
    let i = 0;
    const log: unknown[] = [];
    while (g.state !== 'gameover' && g.state !== 'win' && g.time < maxSec && i < 60 * maxSec * 1.3 + 600) {
      if (opts.god) g.player.hp = g.player.maxHp;
      g.update(1 / 60);
      i++;
      if (g.enemies.length > maxEn) maxEn = g.enemies.length;
      if (i % 1800 === 0) {
        log.push({ m: i / 3600,  lvl: g.level, hp: Math.round(g.player.hp), en: g.enemies.length, kills: g.kills, w: g.weapons.map((x) => x.def.id + x.level + (x.evo ? '*' : '')).join(',') });
      }
    }
    return { char, t: Math.round(g.time), state: g.state, lvl: g.level, kills: g.kills, maxEn, ms: Math.round(performance.now() - t0), log, res: res ? 'summary' : null };
  };
}
