// Trade routes on the globe (system E31). While the map panel shows the trade view, each country's chief trade is
// drawn on the planet itself as well: a ribbon from the seller's capital to the buyer's, in the colour of what is
// carried, rising a little over the land between them the way a route is drawn on a wall map, so that it reads
// from orbit and does not cut through mountains.
//
// The shape of the ribbons is computed here, pure, so that it can be tested without a renderer.
import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';

/** One route: from and to as points on the unit sphere, and its colour (linear red, green, blue, each 0..1). */
export interface Route {
  from: readonly [number, number, number];
  to: readonly [number, number, number];
  colour: readonly [number, number, number];
}

/** How far above the ground a route begins and ends, and the most it rises between, in planet radii. */
export const ROUTE_LIFT = 0.004;
export const ROUTE_RISE = 0.05;
/** How wide a ribbon is, in planet radii: a few pixels from orbit. */
export const ROUTE_WIDTH = 0.009;

/**
 * The ribbons for a set of routes: `steps` stretches each, `width` across (planet radii). A ribbon follows the short
 * way round the globe, is highest half-way (higher the longer the route), and is brightest at the buyer's end, so
 * that which way the goods go can be seen. Returns the corners, their colours and the triangles.
 */
export function routeRibbons(routes: readonly Route[], steps = 24, width = ROUTE_WIDTH): { position: Float32Array; color: Float32Array; index: Uint32Array } {
  const per = (steps + 1) * 2;
  const position = new Float32Array(routes.length * per * 3), color = new Float32Array(routes.length * per * 3), index = new Uint32Array(routes.length * steps * 6);
  let v = 0, i = 0;
  for (const r of routes) {
    const [ax, ay, az] = r.from, [bx, by, bz] = r.to;
    const dot = Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz)), angle = Math.acos(dot), s = Math.sin(angle);
    // (across the ribbon: at right angles to the way it runs and to the way up; for two towns in one place, any way)
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-9) { nx = -ay; ny = ax; nz = 0; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; } else { nx /= nl; ny /= nl; nz /= nl; }
    const rise = Math.min(ROUTE_RISE, 0.035 * angle);
    const base = v / 3;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      // the short way round: a turn of the first point toward the second
      const wa = s > 1e-6 ? Math.sin((1 - t) * angle) / s : 1 - t, wb = s > 1e-6 ? Math.sin(t * angle) / s : t;
      let px = ax * wa + bx * wb, py = ay * wa + by * wb, pz = az * wa + bz * wb;
      const l = Math.hypot(px, py, pz) || 1, h = 1 + ROUTE_LIFT + rise * Math.sin(Math.PI * t);
      px = (px / l) * h; py = (py / l) * h; pz = (pz / l) * h;
      const shade = 0.4 + 0.6 * t;
      for (const side of [-1, 1]) {
        position[v] = px + nx * width * 0.5 * side; position[v + 1] = py + ny * width * 0.5 * side; position[v + 2] = pz + nz * width * 0.5 * side;
        color[v] = r.colour[0] * shade; color[v + 1] = r.colour[1] * shade; color[v + 2] = r.colour[2] * shade;
        v += 3;
      }
      if (k < steps) { const q = base + k * 2; index[i++] = q; index[i++] = q + 1; index[i++] = q + 2; index[i++] = q + 1; index[i++] = q + 3; index[i++] = q + 2; }
    }
  }
  return { position, color, index };
}

/** The routes as one mesh, rebuilt only when the set of routes changes. */
export class TradeRoutes {
  readonly mesh: Mesh;
  private key = '';
  constructor() {
    // (solid, not added to what is behind: over cloud or snow by day an added colour is lost in the white)
    const mat = new MeshBasicNodeMaterial({ vertexColors: true, side: DoubleSide });
    mat.fog = false;
    this.mesh = new Mesh(new BufferGeometry(), mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 6;
  }

  /** Show these routes, or none (`null`: the trade view is not being looked at). */
  set(routes: readonly Route[] | null): void {
    const key = routes ? routes.map((r) => [...r.from, ...r.to, ...r.colour].map((x) => x.toFixed(3)).join(' ')).join('|') : '';
    if (key === this.key) return;
    this.key = key;
    this.mesh.visible = !!routes && routes.length > 0;
    if (!routes || !routes.length) return;
    const g = routeRibbons(routes);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(g.position, 3));
    geo.setAttribute('color', new BufferAttribute(g.color, 3));
    geo.setIndex(new BufferAttribute(g.index, 1));
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }
}

// ---- armies on the march (system E33, second pass) ----
// An army in the field was a camp fire that jumped from one town to the next. Now, when an army moves, a streak of
// light travels over the ground from where it was camped to where it camps next: the head is the army, and the
// tail behind it fades out.

/** How long a march takes on the screen, in seconds, whatever the pace of the years. */
export const MARCH_SECONDS = 1.6;
/** How much of the way the lit tail covers. */
export const MARCH_TAIL = 0.3;

/**
 * The streak of one march at `t` (0 setting out .. 1 arrived), written into `position` and `color` from corner
 * `at` on (each march takes `(steps + 1) * 2` corners). `size` is the army's, in people: a larger one is brighter.
 */
export function marchStreak(from: readonly [number, number, number], to: readonly [number, number, number], t: number, size: number, position: Float32Array, color: Float32Array, at = 0, steps = 8, width = 0.006): void {
  const [ax, ay, az] = from, [bx, by, bz] = to;
  const dot = Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz)), angle = Math.acos(dot), s = Math.sin(angle);
  let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  const nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-9) { nx = -ay; ny = ax; nz = 0; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; } else { nx /= nl; ny /= nl; nz /= nl; }
  const head = Math.max(0, Math.min(1, t)), tail = Math.max(0, head - MARCH_TAIL);
  const bright = Math.max(0.45, Math.min(1, 0.45 + 0.14 * Math.log10(1 + Math.max(0, size))));
  let v = at * 3;
  for (let k = 0; k <= steps; k++) {
    const f = k / steps, u = tail + (head - tail) * f;
    const wa = s > 1e-6 ? Math.sin((1 - u) * angle) / s : 1 - u, wb = s > 1e-6 ? Math.sin(u * angle) / s : u;
    let px = ax * wa + bx * wb, py = ay * wa + by * wb, pz = az * wa + bz * wb;
    const l = Math.hypot(px, py, pz) || 1, h = 1 + ROUTE_LIFT;
    px = (px / l) * h; py = (py / l) * h; pz = (pz / l) * h;
    // (the colour of fire, brightest at the head, nothing at the end of the tail)
    const glow = bright * f * f;
    for (const side of [-1, 1]) {
      position[v] = px + nx * width * 0.5 * side; position[v + 1] = py + ny * width * 0.5 * side; position[v + 2] = pz + nz * width * 0.5 * side;
      color[v] = glow; color[v + 1] = glow * 0.55; color[v + 2] = glow * 0.14;
      v += 3;
    }
  }
}

/** The marches under way, as one mesh of light added to what is behind it. */
export class ArmyMarches {
  readonly mesh: Mesh;
  static readonly MOST = 24;
  private static readonly STEPS = 8;
  private list: { from: readonly [number, number, number]; to: readonly [number, number, number]; size: number; began: number }[] = [];
  private position: BufferAttribute;
  private color: BufferAttribute;
  constructor() {
    const per = (ArmyMarches.STEPS + 1) * 2, n = ArmyMarches.MOST;
    const geo = new BufferGeometry();
    this.position = new BufferAttribute(new Float32Array(n * per * 3), 3);
    this.color = new BufferAttribute(new Float32Array(n * per * 3), 3);
    const index = new Uint32Array(n * ArmyMarches.STEPS * 6);
    for (let m = 0, i = 0; m < n; m++) for (let k = 0; k < ArmyMarches.STEPS; k++) { const q = m * per + k * 2; index[i++] = q; index[i++] = q + 1; index[i++] = q + 2; index[i++] = q + 1; index[i++] = q + 3; index[i++] = q + 2; }
    geo.setAttribute('position', this.position);
    geo.setAttribute('color', this.color);
    geo.setIndex(new BufferAttribute(index, 1));
    geo.setDrawRange(0, 0);
    const mat = new MeshBasicNodeMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending });
    mat.fog = false;
    this.mesh = new Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 6;
  }

  /** An army sets out (points on the unit sphere). The oldest march gives way if there are too many. */
  add(from: readonly [number, number, number], to: readonly [number, number, number], size: number, now: number): void {
    if (this.list.length >= ArmyMarches.MOST) this.list.shift();
    this.list.push({ from, to, size, began: now });
  }

  /** How many marches are being drawn. */
  get count(): number { return this.list.length; }

  /** Call every frame with the clock in seconds. */
  update(now: number): void {
    if (!this.list.length) { if (this.mesh.visible) { this.mesh.visible = false; this.mesh.geometry.setDrawRange(0, 0); } return; }
    this.list = this.list.filter((m) => now - m.began < MARCH_SECONDS);
    const per = (ArmyMarches.STEPS + 1) * 2;
    const p = this.position.array as Float32Array, c = this.color.array as Float32Array;
    this.list.forEach((m, i) => marchStreak(m.from, m.to, (now - m.began) / MARCH_SECONDS, m.size, p, c, i * per, ArmyMarches.STEPS));
    this.position.needsUpdate = true; this.color.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, this.list.length * ArmyMarches.STEPS * 6);
    this.mesh.visible = this.list.length > 0;
  }
}
