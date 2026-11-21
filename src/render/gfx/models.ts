// Models made by other hands (the asset pass).
//
// Until now every shape in the game was built by its own code. The owner asked for the collected public-domain
// models to be used as well (2026-11-21). They are fetched as GLB files from `assets/` beside the page and flattened
// here into plain arrays: positions, normals and one colour a vertex, with each mesh's material colour and palette
// texture baked into that colour. Nothing else in the game needs to know what a GLB is.
//
// A model that is missing is not an error. Every use of one has the generated shape to fall back on, so the game
// looks the same as before wherever a file has not been added.
import { Color, Matrix3, Matrix4, Vector3, type BufferGeometry, type Material, type Mesh, type Texture } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface Model {
  pos: Float32Array;
  nrm: Float32Array;
  /** Linear rgb, one a vertex. */
  col: Float32Array;
  idx: Uint32Array;
  min: [number, number, number];
  max: [number, number, number];
  triangles: number;
}

/** Where the asset files are: `assets/` beside the page, wherever the page is served from. */
export const ASSET_BASE = `${import.meta.env.BASE_URL ?? './'}assets/`;

const cache = new Map<string, Promise<Model | null>>();
const pixels = new WeakMap<object, { data: Uint8ClampedArray; w: number; h: number } | null>();

/** The pixels of a texture's picture, read once. Null where there is no canvas to read them with. */
function pixelsOf(tex: Texture): { data: Uint8ClampedArray; w: number; h: number } | null {
  const img = tex.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img || typeof document === 'undefined') return null;
  if (pixels.has(img)) return pixels.get(img)!;
  let out: { data: Uint8ClampedArray; w: number; h: number } | null = null;
  try {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (ctx) { ctx.drawImage(img, 0, 0); out = { data: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }; }
  } catch { out = null; }
  pixels.set(img, out);
  return out;
}

const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

/** Flatten a loaded scene into one model: every mesh in its place, every vertex with its colour. */
export function flatten(root: { updateMatrixWorld(force?: boolean): void; traverse(fn: (o: unknown) => void): void }): Model {
  root.updateMatrixWorld(true);
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], idx: number[] = [];
  const v = new Vector3(), n = new Vector3(), nm = new Matrix3(), white = new Color(1, 1, 1);
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const g = mesh.geometry as BufferGeometry;
    const p = g.getAttribute('position');
    if (!p) return;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const nn = g.getAttribute('normal'), uv = g.getAttribute('uv'), vc = g.getAttribute('color');
    const world: Matrix4 = mesh.matrixWorld;
    nm.getNormalMatrix(world);
    const groups = g.groups.length ? g.groups : [{ start: 0, count: g.index ? g.index.count : p.count, materialIndex: 0 }];
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as (Material & { color?: Color; map?: Texture | null })[];
    // which material each vertex is drawn with (a vertex shared between groups takes the first)
    const matOf = new Int16Array(p.count).fill(-1);
    for (const grp of groups) for (let i = grp.start; i < grp.start + grp.count; i++) { const vi = g.index ? g.index.getX(i) : i; if (matOf[vi] === -1) matOf[vi] = grp.materialIndex ?? 0; }
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(world);
      n.fromBufferAttribute(nn, i).applyMatrix3(nm).normalize();
      pos.push(v.x, v.y, v.z); nrm.push(n.x, n.y, n.z);
      const mat = mats[Math.max(0, matOf[i]!)] ?? mats[0];
      const c = mat?.color ?? white;
      let r = c.r, gg = c.g, b = c.b;
      const px = mat?.map && uv ? pixelsOf(mat.map) : null;
      if (px && uv) {
        // the palette textures are a grid of flat colours: the nearest pixel is the colour meant
        const x = Math.min(px.w - 1, Math.max(0, Math.floor((((uv.getX(i) % 1) + 1) % 1) * px.w)));
        const y = Math.min(px.h - 1, Math.max(0, Math.floor((((uv.getY(i) % 1) + 1) % 1) * px.h)));
        const k = (y * px.w + x) * 4;
        r *= toLinear(px.data[k]! / 255); gg *= toLinear(px.data[k + 1]! / 255); b *= toLinear(px.data[k + 2]! / 255);
      }
      if (vc) { r *= vc.getX(i); gg *= vc.getY(i); b *= vc.getZ(i); }
      col.push(r, gg, b);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
  });
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, pos[i + k]!); max[k] = Math.max(max[k]!, pos[i + k]!); }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), col: new Float32Array(col), idx: new Uint32Array(idx), min, max, triangles: idx.length / 3 };
}

/** Fetch a model by its path under `assets/`. Resolves to null if the file is not there or cannot be read. */
export function loadModel(path: string): Promise<Model | null> {
  let p = cache.get(path);
  if (!p) {
    p = new Promise<Model | null>((resolve) => {
      try {
        new GLTFLoader().load(/^(https?:|\/|\.)/.test(path) ? path : ASSET_BASE + path, (gltf) => { try { const m = flatten(gltf.scene as never); resolve(m.triangles > 0 ? m : null); } catch { resolve(null); } }, undefined, () => resolve(null));
      } catch { resolve(null); }
    });
    cache.set(path, p);
  }
  return p;
}

let listed: Promise<Set<string> | null> | null = null;
/**
 * The files that have been added, from `assets/MANIFEST.json` (one entry a file, each with its `path`). Asking for
 * a file that is not there would only fill the console with errors, so nothing is asked for that the manifest does
 * not list; with no manifest, no model is fetched at all and the game draws its own shapes.
 */
export function assetList(): Promise<Set<string> | null> {
  listed ??= fetch(`${ASSET_BASE}MANIFEST.json`).then((r) => (r.ok ? r.json() : null)).then((j: unknown) => {
    if (!j) return null;
    const entries = Array.isArray(j) ? j : ((j as { files?: unknown[] }).files ?? []);
    const out = new Set<string>();
    for (const e of entries) {
      const path = typeof e === 'string' ? e : (e as { path?: string }).path;
      if (typeof path === 'string') out.add(path.replace(/^.*?assets\//, ''));
    }
    return out;
  }).catch(() => null);
  return listed;
}

/** The first of several candidate files that has been added. `direct` skips the manifest (for trying a file by hand). */
export async function loadFirst(paths: string[], direct = false): Promise<Model | null> {
  const have = direct ? null : await assetList();
  if (!direct && !have) return null;
  for (const p of paths) {
    if (have && !have.has(p)) continue;
    const m = await loadModel(p);
    if (m) return m;
  }
  return null;
}
