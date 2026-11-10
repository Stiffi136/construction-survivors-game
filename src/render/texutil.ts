import * as THREE from 'three';

/**
 * Canvas -> DataTexture via getImageData.
 * The direct canvas upload (texImage2D(canvas)) is driver dependent and swaps R and B on some
 * systems; raw RGBA bytes are uploaded unchanged and are deterministic.
 */
export function canvasToDataTexture(canvas: HTMLCanvasElement): THREE.DataTexture {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const bytes = new Uint8Array(id.data.buffer, id.data.byteOffset, id.data.byteLength);
  const tex = new THREE.DataTexture(bytes, canvas.width, canvas.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.flipY = false;
  tex.premultiplyAlpha = false;
  tex.generateMipmaps = false;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Reads a texel back through the GPU pipeline (RGB, 0..255). */
export function sampleTexel(renderer: THREE.WebGLRenderer, tex: THREE.Texture, u: number, v: number): [number, number, number] | null {
  try {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false });
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, uv: { value: new THREE.Vector2(u, v) } },
      vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'precision mediump float; uniform sampler2D map; uniform vec2 uv; void main(){ gl_FragColor = vec4(texture2D(map, uv).rgb, 1.0); }',
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    mesh.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(mesh);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    const px = new Uint8Array(4);
    renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, px);
    renderer.setRenderTarget(prev);
    rt.dispose();
    mat.dispose();
    mesh.geometry.dispose();
    return [px[0]!, px[1]!, px[2]!];
  } catch {
    return null;
  }
}

/**
 * Self-test: reads back the red marker (255,32,0). If blue arrives instead of red, R and B are
 * swapped on the GPU -> true (shaders then swap them back).
 */
export function detectRBSwap(renderer: THREE.WebGLRenderer, tex: THREE.Texture, u: number, v: number): boolean {
  const px = sampleTexel(renderer, tex, u, v);
  return px !== null && px[2] > px[0];
}
