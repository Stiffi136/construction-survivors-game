import type { Atlas } from '../atlas';
import { fmtTime } from '../core/util';
import { CHARACTERS } from '../game/characters';
import type { ChestReward, Game, Summary, UIHooks, UpgradeOption } from '../game/game';
import { YARD_ITEMS, yardCost, yardLevel, charUnlocked } from '../game/meta';
import { PASSIVE_BY_ID } from '../game/passives';
import { LANGS, bossName, charText, getLang, langName, num, passiveText, setLang, t, yardText } from '../i18n';
import { buildStats } from '../game/stats';
import './style.css';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export class UI implements UIHooks {
  private readonly root: HTMLElement;
  private readonly hudEl: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly lvl: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly killsEl: HTMLElement;
  private readonly coinsEl: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly inv: HTMLElement;
  private readonly bossBar: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly bannerEl: HTMLElement;
  private readonly vig: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  /** Rebuilds the open panel (used when the language changes) */
  private rerender: (() => void) | null = null;
  private overlay: HTMLElement | null = null;
  private bannerT = 0;
  private game!: Game;
  private lastSig = '';
  private cache = { xp: -1, lvl: -1, time: '', kills: -1, coins: -1, hp: '', boss: '', low: false };
  private keyHandler: ((code: string) => void) | null = null;
  private selectedChar = 0;
  private timers: number[] = [];

  constructor(root: HTMLElement, private readonly atlas: Atlas) {
    this.root = root;
    this.hudEl = el('div', 'hud off');
    const xpbar = el('div', 'xpbar');
    this.xpFill = el('div', 'xpfill');
    xpbar.append(this.xpFill);
    this.lvl = el('div', 'stat lvl');
    this.timeEl = el('div', 'stat time');
    this.killsEl = el('div', 'stat kills');
    this.coinsEl = el('div', 'stat coins');
    const right = el('div', 'rightcol');
    right.append(this.killsEl, this.coinsEl);
    const hpw = el('div', 'hpwrap');
    this.hpFill = el('div', 'hpfill');
    this.hpText = el('div', 'hptext');
    hpw.append(this.hpFill, this.hpText);
    this.inv = el('div', 'inv');
    this.bossBar = el('div', 'bossbar');
    this.bossName = el('div');
    const bb = el('div', 'bb');
    this.bossFill = el('div', 'bf');
    bb.append(this.bossFill);
    this.bossBar.append(this.bossName, bb);
    this.bannerEl = el('div', 'banner');
    const pause = el('button', 'pausebtn', '❚❚');
    this.pauseBtn = pause;
    pause.setAttribute('aria-label', t().pause.pause);
    pause.addEventListener('click', () => {
      this.game.audio.unlock();
      this.game.togglePause();
    });
    this.vig = el('div', 'vig');
    this.hudEl.append(xpbar, this.lvl, this.timeEl, right, hpw, this.inv, this.bossBar, this.bannerEl, pause);
    root.append(this.vig, this.hudEl);
  }

  attach(game: Game): void {
    this.game = game;
    game.input.onKey = (code) => {
      if (this.keyHandler) this.keyHandler(code);
    };
  }

  // ------------------------------------------------------------ Panels
  /** Stops the timers of the previous panel (must run BEFORE a new panel is built). */
  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.length = 0;
  }

  private show(panel: HTMLElement, keys?: (code: string) => void): void {
    // Important: do NOT clear timers here – the 0.4 s input locks of the buttons were created while building.
    this.overlay?.remove();
    this.overlay = null;
    const ov = el('div', 'overlay');
    panel.classList.add('panel');
    ov.append(panel);
    this.root.append(ov);
    this.overlay = ov;
    this.keyHandler = keys ?? null;
  }

  private hideOverlay(): void {
    this.clearTimers();
    this.overlay?.remove();
    this.overlay = null;
    this.keyHandler = null;
    this.rerender = null;
  }

  hideAll(): void {
    this.hideOverlay();
    this.hudEl.classList.toggle('off', this.game.state === 'menu');
  }

  hurt(strength: number): void {
    this.vig.style.transition = 'none';
    this.vig.style.opacity = String(strength);
    void this.vig.offsetWidth;
    this.vig.style.transition = 'opacity .5s ease-out';
    this.vig.style.opacity = '0';
  }

  /** Button with a 0.4 s input lock (prevents accidental taps from the joystick thumb). */
  private locked(b: HTMLElement, ms = 400): void {
    b.classList.add('lock');
    this.timers.push(window.setTimeout(() => b.classList.remove('lock'), ms));
  }

  private btn(text: string, cls: string, fn: () => void): HTMLButtonElement {
    const b = el('button', cls, text);
    b.addEventListener('click', () => {
      this.game.audio.unlock();
      this.game.audio.ui();
      fn();
    });
    return b;
  }

  /** Language switch: stores the choice and rebuilds the open panel and static HUD texts without reload. */
  private langRow(): HTMLElement {
    const row = el('div', 'langrow');
    row.append(el('span', 'lbl', t().menu.language));
    for (const l of LANGS) {
      const b = el('button', 'btn sec sm' + (l === getLang() ? ' on' : ''), langName(l));
      b.addEventListener('click', () => {
        this.game.audio.unlock();
        this.game.audio.ui();
        setLang(l);
        this.refreshTexts();
        this.rerender?.();
      });
      row.append(b);
    }
    return row;
  }

  /** Updates the static HUD texts after a language change. */
  refreshTexts(): void {
    this.pauseBtn.setAttribute('aria-label', t().pause.pause);
    this.cache.lvl = -1;
    this.cache.boss = '';
  }

  menu(): void {
    this.clearTimers();
    this.rerender = () => this.menu();
    this.hudEl.classList.add('off');
    const g = this.game;
    g.state = 'menu';
    const p = el('div');
    p.append(el('div', 'hazard'));
    p.append(el('h1', '', t().menu.title));
    p.append(el('p', '', t().menu.tagline(num(g.meta.coins, 0))));
    const grid = el('div', 'grid');
    const cards: HTMLButtonElement[] = [];
    if (!charUnlocked(g.meta, CHARACTERS[this.selectedChar]!.id, g.cheat)) this.selectedChar = 0;
    CHARACTERS.forEach((c, i) => {
      const open = charUnlocked(g.meta, c.id, g.cheat);
      const b = el('button', 'card' + (i === this.selectedChar ? ' sel' : '') + (open ? '' : ' locked'));
      const ct = charText(c.id);
      b.innerHTML = `<img alt="" src="${this.atlas.icon(c.walk, 96)}"><div class="nm">${ct.name}</div><div class="wp">⚒ ${ct.title}</div>` +
        (open
          ? `<div class="ds">+ ${ct.strength}<br>– ${ct.weakness}<br><i>${ct.passive}</i></div>`
          : `<div class="ds">${t().menu.locked(ct.lock)}</div>`);
      b.addEventListener('click', () => {
        if (!open) return;
        this.selectedChar = i;
        cards.forEach((x, k) => x.classList.toggle('sel', k === i));
        g.audio.ui();
      });
      cards.push(b);
      grid.append(b);
    });
    p.append(grid);
    p.append(this.btn(t().menu.start, 'btn', () => g.start(CHARACTERS[this.selectedChar]!.id)));
    const row = el('div', 'row2');
    row.append(this.btn(t().menu.yard, 'btn sec', () => this.yard()), this.btn(t().menu.settings, 'btn sec', () => this.settings(() => this.menu())));
    p.append(row);
    p.append(this.langRow());
    p.append(el('div', 'hint', t().menu.hint));
    this.show(p, (code) => {
      if (code === 'Enter' || code === 'Space') g.start(CHARACTERS[this.selectedChar]!.id);
    });
  }

  yard(): void {
    this.clearTimers();
    this.rerender = () => this.yard();
    const g = this.game;
    const p = el('div');
    p.append(el('div', 'hazard'));
    p.append(el('h2', '', t().yard.title));
    p.append(el('p', '', t().yard.sub(num(g.meta.coins, 0))));
    const list = el('div', 'ups');
    for (const d of YARD_ITEMS) {
      const lvl = yardLevel(g.meta, d.id);
      const full = lvl >= d.max;
      const cost = yardCost(d, lvl);
      const can = !full && g.meta.coins >= cost;
      const row = el('button', 'up' + (can ? '' : ' dim'));
      row.innerHTML = `<img alt="" src="${this.atlas.icon(d.icon, 64)}"><div><div class="t">${yardText(d.id).name}</div><div class="lv">${t().yard.level(lvl, d.max)}</div><div class="d">${yardText(d.id).desc}</div></div><div class="k">${full ? t().yard.max : '⚙ ' + num(cost, 0)}</div>`;
      row.addEventListener('click', () => {
        if (g.buyYard(d.id)) {
          g.audio.pickup();
          g.recalc();
          this.yard();
        }
      });
      list.append(row);
    }
    p.append(list);
    p.append(this.btn(t().yard.reset, 'btn sec', () => {
      g.resetYard();
      this.yard();
    }));
    p.append(this.btn(t().yard.back, 'btn', () => this.menu()));
    this.show(p);
  }

  settings(back: () => void): void {
    this.clearTimers();
    this.rerender = () => this.settings(back);
    const g = this.game;
    const s = g.meta.settings;
    const p = el('div');
    p.append(el('div', 'hazard'));
    p.append(el('h2', '', t().settings.title));
    const vol = el('label', 'set', `${t().settings.volume} <input type="range" min="0" max="100" value="${Math.round(s.volume * 100)}">`);
    (vol.querySelector('input') as HTMLInputElement).addEventListener('input', (e) => {
      s.volume = Number((e.target as HTMLInputElement).value) / 100;
      g.audio.unlock();
      g.audio.setVolume(s.volume);
      g.audio.ui();
      g.saveSettings();
    });
    const vib = el('label', 'set', `${t().settings.vibration} <input type="checkbox" ${s.vibrate ? 'checked' : ''}>`);
    (vib.querySelector('input') as HTMLInputElement).addEventListener('change', (e) => {
      s.vibrate = (e.target as HTMLInputElement).checked;
      g.saveSettings();
    });
    const dmgNums = el('label', 'set', `${t().settings.numbers} <input type="checkbox" ${s.numbers ? 'checked' : ''}>`);
    (dmgNums.querySelector('input') as HTMLInputElement).addEventListener('change', (e) => {
      s.numbers = (e.target as HTMLInputElement).checked;
      g.saveSettings();
    });
    p.append(vol, vib, dmgNums, this.langRow(), this.btn(t().settings.back, 'btn', back));
    this.show(p);
  }

  levelUp(opts: UpgradeOption[]): void {
    this.clearTimers();
    const p = el('div');
    p.append(el('div', 'hazard'));
    p.append(el('h2', '', t().levelup.title));
    const list = el('div', 'ups');
    const g = this.game;
    opts.forEach((o, i) => {
      const b = el('button', 'up' + (o.evo ? ' hint' : ''));
      const lv = o.kind === 'heal' || o.isNew ? '' : t().levelup.levelStep(o.level - 1, o.level);
      const evoHtml = o.evo
        ? `<div class="evoline"><img alt="" src="${this.atlas.icon(o.evo.icon, 40)}"><div><b>${t().levelup.evolution(o.evo.name)}</b><span>${t().levelup.withPartner(o.evo.partner)}</span><span>${o.evo.cond}</span></div></div>`
        : '';
      const kindTxt = o.kind === 'weapon' ? t().levelup.kindWeapon : o.kind === 'passive' ? t().levelup.kindPassive : t().levelup.kindInstant;
      b.innerHTML = `<img alt="" src="${this.atlas.icon(o.icon, 64)}"><div><div class="t">${o.name}${o.isNew ? `<i>${t().levelup.isNew}</i>` : ''}</div><div class="lv">${kindTxt}${lv ? ' · ' + lv : ''}</div><div class="d">${o.desc}</div>${evoHtml}</div><div class="k">${i + 1}</div>`;
      b.addEventListener('click', () => {
        if (b.classList.contains('lock')) return;
        g.audio.ui();
        g.choose(o);
      });
      this.locked(b);
      list.append(b);
    });
    p.append(list);
    let unlockedAt = performance.now() + 400;
    this.show(p, (code) => {
      if (performance.now() < unlockedAt) return;
      const m = /^(?:Digit|Numpad)([1-5])$/.exec(code);
      if (m) {
        const o = opts[Number(m[1]) - 1];
        if (o) g.choose(o);
      }
    });
    unlockedAt = performance.now() + 400;
  }

  chest(rewards: ChestReward[]): void {
    this.clearTimers();
    const g = this.game;
    const p = el('div');
    p.append(el('div', 'hazard'));
    p.append(el('h2', '', t().levelup.chestTitle));
    const list = el('div', 'ups');
    p.append(list);
    const done = this.btn(t().chest.next, 'btn', () => g.closeChest());
    this.locked(done, 400 + rewards.length * 250);
    done.style.visibility = 'hidden';
    p.append(done);
    let shown = 0;
    const showNext = (): void => {
      if (shown >= rewards.length) return;
      const r = rewards[shown++]!;
      const row = el('div', 'up reward' + (r.evo ? ' evo' : ''));
      row.innerHTML = `<img alt="" src="${this.atlas.icon(r.icon, 64)}"><div><div class="t">${r.evo ? '★ ' : ''}${r.name}</div><div class="d">${r.text}</div></div>`;
      list.append(row);
      g.audio.pickup();
      if (shown >= rewards.length) done.style.visibility = 'visible';
    };
    const tick = (): void => {
      showNext();
      if (shown < rewards.length) this.timers.push(window.setTimeout(tick, 250));
    };
    tick();
    // Tapping skips the animation
    list.addEventListener('click', () => {
      while (shown < rewards.length) showNext();
    });
    this.show(p, (code) => {
      if (code === 'Enter' || code === 'Space') while (shown < rewards.length) showNext();
    });
  }

  pause(): void {
    this.clearTimers();
    this.rerender = () => this.pause();
    const g = this.game;
    const p = el('div');
    p.append(el('div', 'hazard'));
    p.append(el('h2', '', t().pause.title));
    p.append(this.btn(t().pause.resume, 'btn', () => g.resume()));
    const row = el('div', 'row3');
    row.append(
      this.btn(t().pause.settings, 'btn sec sm', () => this.settings(() => this.pause())),
      this.btn(t().pause.restart, 'btn sec sm', () => g.start(g.char.id)),
      this.btn(t().pause.charSelect, 'btn sec sm', () => this.menu()),
    );
    p.append(row);

    // Equipment: weapons and passives with level
    p.append(el('h3', '', t().pause.gear));
    const lo = el('div', 'loadout');
    for (const w of g.weapons) {
      const it = el('div', 'lo' + (w.evo ? ' evo' : ''));
      it.innerHTML = `<img alt="" src="${this.atlas.icon(w.def.icon, 48)}"><div><b>${w.displayName}</b><span>${w.evo ? t().pause.evoTag : t().pause.levelOf(w.level, w.def.max)}</span></div>`;
      lo.append(it);
    }
    for (const [id, lvl] of g.passiveLevels) {
      const pd = PASSIVE_BY_ID[id]!;
      const it = el('div', 'lo');
      it.innerHTML = `<img alt="" src="${this.atlas.icon(pd.icon, 48)}"><div><b>${passiveText(id).name}</b><span>${t().pause.levelOf(lvl, pd.max)} · ${passiveText(id).desc}</span></div>`;
      lo.append(it);
    }
    p.append(lo);

    // Stats: tap to expand
    p.append(el('h3', '', t().pause.stats));
    p.append(el('div', 'hint left', t().pause.statsHint));
    const list = el('div', 'stats-list');
    for (const r of buildStats(g)) {
      const d = el('details', 'strow');
      const bonus = r.bonus ? `<i class="${r.good > 0 ? 'good' : r.good < 0 ? 'bad' : ''}">(${r.bonus})</i>` : '';
      let body = `<div class="sd">${r.desc}${r.note ? `<br><em>${r.note}</em>` : ''}</div>`;
      if (r.scope) body += `<div class="sw"><span class="lbl">${r.scope}</span></div>`;
      else if (r.weapons.length === 0) body += '<div class="sw"><span class="lbl">${t().stats.noWeapon}</span></div>';
      else body += `<div class="sw"><span class="lbl">${t().stats.appliesTo}</span> ${r.weapons.map((w) => `<span class="chip"><img alt="" src="${this.atlas.icon(w.icon, 28)}">${w.name}</span>`).join('')}</div>`;
      d.innerHTML = `<summary><span class="sn">${r.name}</span><span class="sv">${r.value} ${bonus}</span></summary>${body}`;
      list.append(d);
    }
    p.append(list);
    this.show(p);
  }

  private endPanel(title: string, sub: string, s: Summary): void {
    this.clearTimers();
    const g = this.game;
    const p = el('div');
    p.append(el('div', 'hazard'));
    p.append(el('h2', '', title));
    p.append(el('p', '', sub));
    const te = t().end;
    p.append(el('div', 'stats', `<div>${fmtTime(s.time)}<span>${te.time}</span></div><div>${num(s.kills, 0)}<span>${te.kills}</span></div><div>${s.level}<span>${te.level}</span></div><div>${fmtTime(s.best)}<span>${te.best}</span></div>`));
    p.append(el('div', 'coinline', te.coinsLine(num(s.coins, 0), num(s.coinsKills, 0), num(s.coinsTime, 0), s.coinsBoss ? num(s.coinsBoss, 0) : '')));
    if (s.unlocks.length) p.append(el('div', 'unlocks', s.unlocks.map((u) => te.unlockPrefix + (t().unlocks as Record<string, string>)[u]).join('<br>')));
    const a = this.btn(te.restart, 'btn', () => g.start(g.char.id));
    this.locked(a, 600);
    p.append(a, this.btn(te.charSelect, 'btn sec', () => this.menu()), this.btn(te.yard, 'btn sec', () => this.yard()));
    this.show(p, (code) => {
      if (code === 'Enter') g.start(g.char.id);
    });
  }

  gameOver(s: Summary): void {
    this.hurt(0);
    const who = charText(s.character).name;
    this.endPanel(t().end.gameOver, s.survivedShift ? t().end.survivedShift(who) : t().end.wipedOut(who), s);
  }

  win(s: Summary): void {
    this.endPanel(t().end.won, t().end.victory(charText(s.character).name), s);
  }

  banner(text: string, color: string): void {
    this.bannerEl.textContent = text;
    this.bannerEl.style.color = color;
    this.bannerEl.classList.add('show');
    clearTimeout(this.bannerT);
    this.bannerT = window.setTimeout(() => this.bannerEl.classList.remove('show'), 2200);
  }

  // ------------------------------------------------------------ HUD
  hud(g: Game): void {
    if (g.state === 'paused' && !this.overlay) this.pause();
    if (g.state === 'menu' || !this.game) return;
    this.hudEl.classList.remove('off');
    const c = this.cache;
    const xp = Math.floor((g.xp / g.xpNeed) * 1000);
    if (xp !== c.xp) {
      c.xp = xp;
      this.xpFill.style.width = `${xp / 10}%`;
    }
    if (g.level !== c.lvl) {
      c.lvl = g.level;
      this.lvl.textContent = `${t().hud.level} ${g.level}`;
    }
    const clock = fmtTime(g.time);
    if (clock !== c.time) {
      c.time = clock;
      this.timeEl.textContent = clock;
    }
    if (g.kills !== c.kills) {
      c.kills = g.kills;
      this.killsEl.textContent = `☠ ${num(g.kills, 0)}`;
    }
    if (g.runCoins !== c.coins) {
      c.coins = g.runCoins;
      this.coinsEl.textContent = `⚙ ${num(Math.floor(g.runCoins), 0)}`;
    }
    const p = g.player;
    const hp = `${Math.ceil(p.hp)}/${p.maxHp}`;
    if (hp !== c.hp) {
      c.hp = hp;
      this.hpFill.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
      this.hpText.textContent = hp;
      const low = p.hp < p.maxHp * 0.3 && p.hp > 0;
      if (low !== c.low) {
        c.low = low;
        this.vig.classList.toggle('low', low);
      }
    }
    const b = g.bossRef;
    const bs = b ? `${b.def.id}${Math.ceil((b.hp / b.maxHp) * 200)}` : '';
    if (bs !== c.boss) {
      c.boss = bs;
      if (b) {
        this.bossBar.style.display = 'block';
        this.bossName.textContent = bossName(b.def.boss ?? 0);
        this.bossFill.style.width = `${Math.max(0, (b.hp / b.maxHp) * 100)}%`;
      } else this.bossBar.style.display = 'none';
    }
    const sig = g.weapons.map((w) => w.def.id + w.level + (w.evo ? '*' : '')).join(',') + '|' + [...g.passiveLevels].join(',');
    if (sig !== this.lastSig) {
      this.lastSig = sig;
      this.inv.innerHTML = '';
      const r1 = el('div', 'row');
      for (const w of g.weapons) r1.append(this.item(w.def.icon, w.evo ? '★' : String(w.level), w.evo));
      const r2 = el('div', 'row');
      for (const [id, lvl] of g.passiveLevels) r2.append(this.item(PASSIVE_BY_ID[id]!.icon, String(lvl), false));
      this.inv.append(r1, r2);
    }
  }

  private item(icon: string, label: string, evo: boolean): HTMLElement {
    const d = el('div', 'it' + (evo ? ' evo' : ''));
    d.innerHTML = `<img alt="" src="${this.atlas.icon(icon, 40)}"><b>${label}</b>`;
    return d;
  }

}
