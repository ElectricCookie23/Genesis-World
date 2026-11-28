// Trade routes on the globe (system E31). While the map panel shows the trade view, each country's chief trade is
// drawn on the planet itself as well: a ribbon from the seller's capital to the buyer's, in the colour of what is
// carried, rising a little over the land between them the way a route is drawn on a wall map, so that it reads
// from orbit and does not cut through mountains.
//
// The shape of the ribbons is computed here, pure, so that it can be tested without a renderer.
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';

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
