import * as THREE from 'three';
import { canvasToDataTexture } from './render/texutil';
import atlasData from 'virtual:atlas';

/** One sprite frame in the combined atlas canvas (UVs: v runs top to bottom). */
export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Anchor in pixels inside the frame (from left/top) */
  ax: number;
  ay: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** Fallback color quad (name missing in the atlas) */
  fallback: boolean;
  color: number;
}

export interface Anim {
  name: string;
  frames: Frame[];
  fallback: boolean;
  /** Reference height in atlas pixels (largest frame) -> uniform scaling */
  refH: number;
  fps: number;
}

interface AtlasJson {
  meta: { image: string; w: number; h: number };
  frames: Record<string, { x: number; y: number; w: number; h: number; ax: number; ay: number }>;
  animations: Record<string, string[]>;
}

const STRIP_H = 96 + 68;
const MIN_W = 256;
/** Ground tiles that become soft patches (`<name>_soft`) */
const SOFT_TILES = ['t_dirt', 't_sand', 't_rubble', 't_grass', 't_grass_rock', 't_mud_puddle', 't_asphalt_dark'];

export interface Extras {
  white: Frame;
  shadow: Frame;
  disc: Frame;
  digits: Frame[];
  bar: Frame;
  tape: Frame;
  /** Pure red marker (255,32,0) for the R/B self-test */
  marker: Frame;
}

export class Atlas {
  readonly texture: THREE.DataTexture;
  readonly canvas: HTMLCanvasElement;
  readonly extras: Extras;
  readonly hasSprites: boolean;
  private readonly json: AtlasJson | null;
  private readonly propsJson: AtlasJson | null;
  private readonly propsOffX: number;
  private readonly soft = new Map<string, Frame>();
  private readonly W: number;
  private readonly H: number;
  private readonly cache = new Map<string, Anim>();
  private readonly iconCache = new Map<string, string>();

  private constructor(
    img: HTMLImageElement | null, json: AtlasJson | null,
    pimg: HTMLImageElement | null, pjson: AtlasJson | null,
  ) {
    this.json = img && json ? json : null;
    this.propsJson = pimg && pjson ? pjson : null;
    this.hasSprites = this.json !== null;
    const iw = img ? img.naturalWidth : 0;
    const ih = img ? img.naturalHeight : 0;
    const pw = pimg ? pimg.naturalWidth : 0;
    const ph = pimg ? pimg.naturalHeight : 0;
    // Both sheets sit side by side in ONE texture (one draw call): atlas left, props right.
    this.propsOffX = iw;
    const sheetH = Math.max(ih, ph);
    this.W = Math.max(iw + pw, MIN_W);
    this.H = sheetH + STRIP_H;
    const c = document.createElement('canvas');
    c.width = this.W;
    c.height = this.H;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingEnabled = false;
    if (img) ctx.drawImage(img, 0, 0);
    if (pimg) ctx.drawImage(pimg, iw, 0);
    this.extras = this.paintExtras(ctx, sheetH);
    if (this.propsJson) this.paintSoft(ctx, sheetH + 96, c);
    this.canvas = c;
    this.texture = canvasToDataTexture(c);
  }

  static async load(): Promise<Atlas> {
    const loadImg = async (src: string | null, json: unknown, label: string): Promise<HTMLImageElement | null> => {
      if (!src || !json) {
        console.warn(`${label} not found, using fallback quads`);
        return null;
      }
      try {
        const im = new Image();
        im.src = src;
        await im.decode();
        return im;
      } catch (e) {
        console.warn(`${label} could not be loaded`, e);
        return null;
      }
    };
    const [img, pimg] = await Promise.all([
      loadImg(atlasData.png, atlasData.json, 'Atlas'),
      loadImg(atlasData.propsPng, atlasData.propsJson, 'Props-Atlas'),
    ]);
    return new Atlas(img, atlasData.json as AtlasJson | null, pimg, atlasData.propsJson as AtlasJson | null);
  }

  /** Soft patches: ground tiles with a radial alpha mask (not seamless -> only place them individually). */
  private paintSoft(ctx: CanvasRenderingContext2D, y0: number, canvas: HTMLCanvasElement): void {
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = 64;
    const t = tmp.getContext('2d')!;
    t.imageSmoothingEnabled = false;
    SOFT_TILES.forEach((name, i) => {
      const f = this.propsJson!.frames[name];
      if (!f) return;
      t.globalCompositeOperation = 'source-over';
      t.clearRect(0, 0, 64, 64);
      t.drawImage(canvas, f.x + this.propsOffX, f.y, f.w, f.h, 0, 0, 64, 64);
      const g = t.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.6, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      t.globalCompositeOperation = 'destination-in';
      t.fillStyle = g;
      t.fillRect(0, 0, 64, 64);
      const x = 2 + i * 66;
      ctx.drawImage(tmp, x, y0);
      this.soft.set(name + '_soft', this.mkFrame(x, y0, 64, 64, 32, 32));
    });
  }

  private mkFrame(x: number, y: number, w: number, h: number, ax: number, ay: number, fallback = false, color = 0xffffff): Frame {
    return {
      x, y, w, h, ax, ay,
      u0: x / this.W,
      v0: y / this.H,
      u1: (x + w) / this.W,
      v1: (y + h) / this.H,
      fallback,
      color,
    };
  }

  private paintExtras(ctx: CanvasRenderingContext2D, y0: number): Extras {
    // white pixel block
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, y0, 6, 6);
    const white = this.mkFrame(1, y0 + 1, 4, 4, 2, 2);
    // soft shadow (ellipse)
    {
      const g = ctx.createRadialGradient(24, y0 + 10, 1, 24, y0 + 10, 14);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.8)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.translate(0, y0);
      ctx.scale(1, 0.5);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(24, 20, 16, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const shadow = this.mkFrame(8, y0, 32, 20, 16, 10);
    // disc (for puddles/telegraphs)
    {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(64, y0 + 16, 15, 0, Math.PI * 2);
      ctx.fill();
    }
    const disc = this.mkFrame(48, y0, 32, 32, 16, 16);
    // digits
    const digits: Frame[] = [];
    ctx.font = 'bold 17px "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (let i = 0; i < 10; i++) {
      const cx = 2 + i * 18 + 9;
      const cy = y0 + 36 + 11;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#1a1208';
      ctx.strokeText(String(i), cx, cy);
      ctx.fillStyle = '#fff';
      ctx.fillText(String(i), cx, cy);
      digits.push(this.mkFrame(2 + i * 18, y0 + 36, 18, 22, 9, 11));
    }
    // barrier bar red/white
    {
      const by = y0 + 62;
      ctx.fillStyle = '#f4f0e6';
      ctx.fillRect(0, by, 96, 12);
      ctx.fillStyle = '#d6381f';
      for (let x = -12; x < 96; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, by + 12);
        ctx.lineTo(x + 12, by);
        ctx.lineTo(x + 24, by);
        ctx.lineTo(x + 12, by + 12);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = '#2b2118';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, by + 1, 94, 10);
    }
    const bar = this.mkFrame(0, y0 + 62, 96, 12, 48, 6);
    // warning tape yellow/black
    {
      const ty = y0 + 78;
      ctx.fillStyle = '#f2c200';
      ctx.fillRect(0, ty, 96, 8);
      ctx.fillStyle = '#1a1a1a';
      for (let x = -8; x < 96; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, ty + 8);
        ctx.lineTo(x + 8, ty);
        ctx.lineTo(x + 16, ty);
        ctx.lineTo(x + 8, ty + 8);
        ctx.closePath();
        ctx.fill();
      }
    }
    const tape = this.mkFrame(0, y0 + 78, 96, 8, 48, 4);
    ctx.fillStyle = 'rgb(255,32,0)';
    ctx.fillRect(110, y0 + 4, 6, 6);
    const marker = this.mkFrame(111, y0 + 5, 4, 4, 2, 2);
    return { white, shadow, disc, digits, bar, tape, marker };
  }

  /**
   * Returns the first existing animation among the candidates; otherwise a fallback color quad.
   * `anchorBottom`: anchor of the fallback (characters: bottom center).
   */
  anim(names: string | string[], color = 0xff00ff, anchorBottom = false): Anim {
    const list = Array.isArray(names) ? names : [names];
    const key = list.join('|');
    const cached = this.cache.get(key);
    if (cached) return cached;
    let result: Anim | null = null;
    if (this.json) {
      for (const n of list) {
        const a = this.resolve(n);
        if (a) {
          result = a;
          break;
        }
      }
    }
    if (!result) {
      console.warn('Sprite missing in atlas (fallback quad):', list.join(' | '));
      const f = this.mkFrame(1, this.H - STRIP_H + 1, 4, 4, 2, anchorBottom ? 4 : 2, true, color);
      result = { name: list[0] ?? '?', frames: [f], fallback: true, refH: 4, fps: 8 };
    }
    this.cache.set(key, result);
    return result;
  }

  private resolve(name: string): Anim | null {
    const sf = this.soft.get(name);
    if (sf) return { name, frames: [sf], fallback: false, refH: sf.h, fps: 1 };
    let j = this.json!;
    let offX = 0;
    if (!j.frames[name] && !j.animations[name] && this.propsJson) {
      j = this.propsJson;
      offX = this.propsOffX;
    }
    let names = j.animations?.[name];
    if (!names && j.frames[name]) names = [name];
    if (!names || names.length === 0) return null;
    if (name === 'fx_heal' || name === 'fx_levelup') {
      // the first frame is tiny
      if (names.length > 2) names = names.slice(1);
    }
    const frames: Frame[] = [];
    for (const n of names) {
      const f = j.frames[n];
      if (f) frames.push(this.mkFrame(f.x + offX, f.y, f.w, f.h, f.ax, f.ay));
    }
    if (frames.length === 0) return null;
    let refH = 1;
    for (const f of frames) refH = Math.max(refH, f.h);
    return { name, frames, fallback: false, refH, fps: 10 };
  }

  /** Data URL of a square icon (frame 0, nearest scaling) for the DOM UI. */
  icon(name: string, size = 56): string {
    const key = `${name}@${size}`;
    const c0 = this.iconCache.get(key);
    if (c0) return c0;
    const a = this.anim(name, 0x888888);
    const f = a.frames[0]!;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    if (f.fallback) {
      ctx.fillStyle = '#' + f.color.toString(16).padStart(6, '0');
      ctx.fillRect(size * 0.15, size * 0.15, size * 0.7, size * 0.7);
    } else {
      const s = Math.min((size - 4) / f.w, (size - 4) / f.h);
      const dw = f.w * s;
      const dh = f.h * s;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.canvas, f.x, f.y, f.w, f.h, (size - dw) / 2, (size - dh) / 2, dw, dh);
    }
    const url = c.toDataURL();
    this.iconCache.set(key, url);
    return url;
  }
}
