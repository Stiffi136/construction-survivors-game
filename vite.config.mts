import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

/**
 * Virtual module "virtual:atlas": provides atlas.json/atlas.png and props.json/props.png as data URIs
 * (also when the files are missing).
 */
function atlasPlugin(): Plugin {
  const id = 'virtual:atlas';
  const rid = '\0' + id;
  const dir = path.resolve(import.meta.dirname, 'public/sprites');
  const readJson = (n: string): string => {
    const f = path.join(dir, n);
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : 'null';
  };
  // Size comparison (atlas / props, bytes): palette PNG 458,933 / 501,468; lossless WebP of the original
  // 1,483,004 / 1,444,208; lossy WebP q90 + lossless alpha 627,204 / 567,178 (all larger). Best: quantize to
  // 256 colors without dithering (clean edges, same pixels as before) and store THAT losslessly as WebP:
  // 357,664 / 382,482 (-22% / -24% vs. palette PNG). The WebP step adds no further artifacts.
  const readImage = async (n: string): Promise<string | null> => {
    const f = path.join(dir, n);
    if (!fs.existsSync(f)) return null;
    const palette = await sharp(f).png({ palette: true, colours: 256, dither: 0, effort: 10 }).toBuffer();
    const buf = await sharp(palette).webp({ lossless: true, quality: 100, effort: 6 }).toBuffer();
    return 'data:image/webp;base64,' + buf.toString('base64');
  };
  return {
    name: 'atlas-inline',
    resolveId(source) {
      if (source === id) return rid;
      return undefined;
    },
    async load(loadId) {
      if (loadId !== rid) return undefined;
      const png = await readImage('atlas.png');
      const propsPng = await readImage('props.png');
      return `export default { json: ${readJson('atlas.json')}, png: ${JSON.stringify(png)}, propsJson: ${readJson('props.json')}, propsPng: ${JSON.stringify(propsPng)} };`;
    },
    configureServer(server) {
      server.watcher.add(dir);
      const reload = (file: string) => {
        if (/(atlas|props)\.(json|png)$/.test(file)) {
          const mod = server.moduleGraph.getModuleById(rid);
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        }
      };
      server.watcher.on('change', reload);
      server.watcher.on('add', reload);
    },
  };
}

export default defineConfig({
  base: './',
  // Atlases are embedded via the virtual module -> no need to copy public/ into dist.
  publicDir: false,
  plugins: [atlasPlugin(), viteSingleFile()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 100_000,
  },
  server: { host: true },
});
