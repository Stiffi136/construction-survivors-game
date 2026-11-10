import * as THREE from 'three';
import type { Atlas, Frame } from '../atlas';

const STRIDE = 17;
export const MAX_SPRITES = 9000;

const VERT = /* glsl */ `
attribute vec4 aPosRot;
attribute vec4 aSize;
attribute vec4 aUV;
attribute vec4 aTint;
attribute float aAlpha;
varying vec2 vUv;
varying vec4 vTint;
varying float vAlpha;
void main() {
  vec2 local = (position.xy - aSize.zw) * aSize.xy;
  float c = cos(aPosRot.w);
  float s = sin(aPosRot.w);
  vec2 r = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  gl_Position = projectionMatrix * viewMatrix * vec4(aPosRot.xy + r, aPosRot.z, 1.0);
  vUv = vec2(mix(aUV.x, aUV.z, position.x), mix(aUV.w, aUV.y, position.y));
  vTint = aTint;
  vAlpha = aAlpha;
}`;

const FRAG = /* glsl */ `
precision mediump float;
uniform sampler2D map;
uniform float uSwap;
varying vec2 vUv;
varying vec4 vTint;
varying float vAlpha;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * vAlpha;
  if (a < 0.05) discard;
  vec3 tc = uSwap > 0.5 ? t.bgr : t.rgb;
  vec3 c = vTint.a >= 0.0 ? mix(tc, vTint.rgb, vTint.a) : tc * vTint.rgb;
  gl_FragColor = vec4(c, a);
}`;

/** Draws all sprites of a frame in a single instanced draw call. */
export class SpriteBatch {
  readonly mesh: THREE.Mesh;
  private readonly data = new Float32Array(MAX_SPRITES * STRIDE);
  private readonly buffer: THREE.InstancedInterleavedBuffer;
  private readonly geo: THREE.InstancedBufferGeometry;
  private n = 0;
  readonly white: Frame;
  readonly shadow: Frame;
  readonly disc: Frame;
  readonly digits: Frame[];
  readonly bar: Frame;
  readonly tape: Frame;

  constructor(atlas: Atlas) {
    this.white = atlas.extras.white;
    this.shadow = atlas.extras.shadow;
    this.disc = atlas.extras.disc;
    this.digits = atlas.extras.digits;
    this.bar = atlas.extras.bar;
    this.tape = atlas.extras.tape;

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.buffer = new THREE.InstancedInterleavedBuffer(this.data, STRIDE, 1);
    this.buffer.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPosRot', new THREE.InterleavedBufferAttribute(this.buffer, 4, 0));
    geo.setAttribute('aSize', new THREE.InterleavedBufferAttribute(this.buffer, 4, 4));
    geo.setAttribute('aUV', new THREE.InterleavedBufferAttribute(this.buffer, 4, 8));
    geo.setAttribute('aTint', new THREE.InterleavedBufferAttribute(this.buffer, 4, 12));
    geo.setAttribute('aAlpha', new THREE.InterleavedBufferAttribute(this.buffer, 1, 16));
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: atlas.texture }, uSwap: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: true,
      depthWrite: true,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /** Corrects an R/B swap of the texture data on the GPU (self-test result). */
  setSwapRB(on: boolean): void {
    (this.mesh.material as THREE.ShaderMaterial).uniforms.uSwap!.value = on ? 1 : 0;
  }

  begin(): void {
    this.n = 0;
  }

  get count(): number {
    return this.n;
  }

  end(): void {
    this.geo.instanceCount = this.n;
    this.buffer.clearUpdateRanges();
    if (this.n > 0) this.buffer.addUpdateRange(0, this.n * STRIDE);
    this.buffer.needsUpdate = true;
  }

  /** General quad. mix >= 0: blend towards the tint; mix < 0: multiply with the tint. */
  quad(
    f: Frame, x: number, y: number, z: number, w: number, h: number,
    rot = 0, flip = false, tint = 0xffffff, mix = 0, alpha = 1,
  ): void {
    if (this.n >= MAX_SPRITES) return;
    if (f.fallback && mix === 0) {
      tint = f.color;
      mix = 1;
    }
    const d = this.data;
    let o = this.n++ * STRIDE;
    let ax = f.ax / f.w;
    const ay = 1 - f.ay / f.h;
    let u0 = f.u0;
    let u1 = f.u1;
    if (flip) {
      ax = 1 - ax;
      u0 = f.u1;
      u1 = f.u0;
    }
    d[o++] = x; d[o++] = y; d[o++] = z; d[o++] = rot;
    d[o++] = w; d[o++] = h; d[o++] = ax; d[o++] = ay;
    d[o++] = u0; d[o++] = f.v0; d[o++] = u1; d[o++] = f.v1;
    d[o++] = ((tint >> 16) & 255) / 255;
    d[o++] = ((tint >> 8) & 255) / 255;
    d[o++] = (tint & 255) / 255;
    d[o++] = mix;
    d[o] = alpha;
  }

  /** Sprite with uniform scale (world units per atlas pixel). */
  sprite(
    f: Frame, x: number, y: number, z: number, scale: number,
    rot = 0, flip = false, tint = 0xffffff, mix = 0, alpha = 1,
  ): void {
    this.quad(f, x, y, z, f.w * scale, f.h * scale, rot, flip, tint, mix, alpha);
  }

  /** Solid-color rectangle (center x,y). */
  rect(x: number, y: number, z: number, w: number, h: number, color: number, alpha = 1): void {
    this.quad(this.white, x, y, z, w, h, 0, false, color, 1, alpha);
  }
}
