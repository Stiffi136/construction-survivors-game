import * as THREE from 'three';
import { hash2 } from '../core/util';
import type { World } from '../game/world';
import { canvasToDataTexture } from './texutil';

const TILE_PX = 128;
export const TILE_WORLD = 256;
/** Zone color map: 1 texel per 256 u, 16x16 texels around the camera */
const ZN = 16;

const VERT = /* glsl */ `
varying vec2 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xy;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
precision mediump float;
uniform sampler2D baseTex;
uniform sampler2D zoneTex;
uniform vec2 zoneOrigin;
uniform float zoneSize;
uniform vec3 night;
uniform float uSwap;
varying vec2 vWorld;
void main() {
  vec3 base = texture2D(baseTex, vWorld / ${TILE_WORLD.toFixed(1)}).rgb;
  if (uSwap > 0.5) base = base.bgr;
  vec3 zc = texture2D(zoneTex, (vWorld - zoneOrigin) / zoneSize).rgb;
  gl_FragColor = vec4(base * zc * 1.2 * night, 1.0);
}`;

/** Procedural, seamless ground (sand + gravel) with soft zone tinting in the shader. */
export class Ground {
  readonly mesh: THREE.Mesh;
  private readonly zoneData = new Uint8Array(ZN * ZN * 4);
  private readonly zoneTex: THREE.DataTexture;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private cellX = 1e9;
  private cellY = 1e9;
  private lastSeed = -1;

  constructor() {
    const c = document.createElement('canvas');
    c.width = c.height = TILE_PX;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#b9a272';
    ctx.fillRect(0, 0, TILE_PX, TILE_PX);
    const rnd = (n: number) => hash2(n, 77, 3);
    let k = 0;
    const dot = (x: number, y: number, w: number, h: number, col: string) => {
      ctx.fillStyle = col;
      for (const ox of [-TILE_PX, 0, TILE_PX]) {
        for (const oy of [-TILE_PX, 0, TILE_PX]) ctx.fillRect(x + ox, y + oy, w, h);
      }
    };
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(rnd(k++) * TILE_PX);
      const y = Math.floor(rnd(k++) * TILE_PX);
      const s = 4 + Math.floor(rnd(k++) * 10);
      dot(x, y, s, Math.max(2, s - 2), rnd(k++) > 0.5 ? '#c4ad7c' : '#ad9564');
    }
    for (let i = 0; i < 260; i++) {
      const x = Math.floor(rnd(k++) * TILE_PX);
      const y = Math.floor(rnd(k++) * TILE_PX);
      const s = 1 + Math.floor(rnd(k++) * 3);
      const r = rnd(k++);
      dot(x, y, s, s, r < 0.4 ? '#8d7c58' : r < 0.7 ? '#d8c796' : r < 0.9 ? '#756850' : '#9a9a92');
    }
    for (let i = 0; i < 14; i++) {
      dot(Math.floor(rnd(k++) * TILE_PX), Math.floor(rnd(k++) * TILE_PX), 6, 1, '#a08a5c');
    }
    const tex = canvasToDataTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;

    this.zoneTex = new THREE.DataTexture(this.zoneData, ZN, ZN, THREE.RGBAFormat);
    this.zoneTex.magFilter = THREE.LinearFilter;
    this.zoneTex.minFilter = THREE.LinearFilter;
    this.zoneTex.wrapS = this.zoneTex.wrapT = THREE.ClampToEdgeWrapping;
    this.zoneTex.generateMipmaps = false;
    this.zoneTex.needsUpdate = true;

    this.uniforms = {
      baseTex: { value: tex },
      zoneTex: { value: this.zoneTex },
      zoneOrigin: { value: new THREE.Vector2() },
      zoneSize: { value: ZN * TILE_WORLD },
      night: { value: new THREE.Vector3(1, 1, 1) },
      uSwap: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.mesh.position.z = -200;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 0;
  }

  setSwapRB(on: boolean): void {
    this.uniforms.uSwap!.value = on ? 1 : 0;
  }

  /** Night shift: darker ground (tint). */
  setNight(on: boolean): void {
    (this.uniforms.night!.value as THREE.Vector3).set(on ? 0.62 : 1, on ? 0.7 : 1, on ? 0.9 : 1);
  }

  resize(viewW: number, viewH: number): void {
    this.mesh.scale.set(viewW + 8, viewH + 8, 1);
  }

  update(camX: number, camY: number, world: World): void {
    this.mesh.position.x = camX;
    this.mesh.position.y = camY;
    const cx = Math.floor(camX / TILE_WORLD) - ZN / 2;
    const cy = Math.floor(camY / TILE_WORLD) - ZN / 2;
    if (cx !== this.cellX || cy !== this.cellY || world.seed !== this.lastSeed) {
      this.cellX = cx;
      this.cellY = cy;
      this.lastSeed = world.seed;
      for (let j = 0; j < ZN; j++) {
        for (let i = 0; i < ZN; i++) {
          const z = world.zoneAt((cx + i + 0.5) * TILE_WORLD, (cy + j + 0.5) * TILE_WORLD);
          const o = (j * ZN + i) * 4;
          this.zoneData[o] = (z.color >> 16) & 255;
          this.zoneData[o + 1] = (z.color >> 8) & 255;
          this.zoneData[o + 2] = z.color & 255;
          this.zoneData[o + 3] = 255;
        }
      }
      this.zoneTex.needsUpdate = true;
      (this.uniforms.zoneOrigin!.value as THREE.Vector2).set(cx * TILE_WORLD, cy * TILE_WORLD);
    }
  }
}
