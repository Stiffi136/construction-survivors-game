import * as THREE from 'three';
import { Atlas } from './atlas';
import { Input } from './core/input';
import { initLang } from './i18n';
import { Game } from './game/game';
import { SpriteBatch } from './render/batch';
import { Ground } from './render/ground';
import { detectRBSwap, sampleTexel } from './render/texutil';
import { UI } from './ui/ui';

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui') as HTMLElement;
  initLang();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x1b1710, 1);
  const scene = new THREE.Scene();

  const atlas = await Atlas.load();
  const batch = new SpriteBatch(atlas);
  const ground = new Ground();
  // Self-test: are R and B swapped on this GPU? If so, swap them back in the shader.
  const mk = atlas.extras.marker;
  const swap = detectRBSwap(renderer, atlas.texture, (mk.u0 + mk.u1) / 2, (mk.v0 + mk.v1) / 2);
  batch.setSwapRB(swap);
  ground.setSwapRB(swap);
  if (swap) console.warn('GPU swaps R/B texture channels - correction active');
  (window as unknown as { __rbSwap: boolean; __renderer: THREE.WebGLRenderer }).__rbSwap = swap;
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__renderer = renderer;
    (window as unknown as Record<string, unknown>).__sample = (u: number, v: number) => sampleTexel(renderer, atlas.texture, u, v);
  }
  scene.add(ground.mesh);
  scene.add(batch.mesh);

  const input = new Input(canvas, document.body);
  window.addEventListener('pointerdown', () => game.audio.unlock(), { passive: true });
  const game = new Game(atlas, batch, ground, input);
  const ui = new UI(uiRoot, atlas);
  game.ui = ui;
  ui.attach(game);
  input.onPause = () => {
    if (game.state === 'playing' || game.state === 'paused') game.togglePause();
  };

  const resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    game.resize(w, h);
  };
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();

  window.addEventListener('blur', () => {
    if (game.state === 'playing') game.togglePause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'playing') game.togglePause();
  });

  ui.menu();
  document.getElementById('loading')?.remove();

  let last = performance.now();
  const frame = (now: number): void => {
    const dt = (now - last) / 1000;
    last = now;
    // Always keep the loop running: a single error must not freeze the game
    requestAnimationFrame(frame);
    try {
      game.update(dt);
      game.render(renderer, scene, Math.min(dt, 0.1));
    } catch (e) {
      console.error(e);
      const err = e instanceof Error ? e : new Error(String(e));
      window.onerror?.(err.message, '', 0, 0, err);
    }
  };
  requestAnimationFrame(frame);

  if (import.meta.env.DEV) void import('./dev/sim').then((m) => m.install(game));

  // Debug access for tests
  (window as unknown as { __game: Game }).__game = game;
}

boot().catch((e: unknown) => {
  const err = e instanceof Error ? e : new Error(String(e));
  window.onerror?.(err.message, '', 0, 0, err);
  console.error(err);
});
