// Trade routes drawn on the globe (system E31, second pass): the shape of the ribbons.
import { describe, expect, it } from 'vitest';
import { ROUTE_LIFT, ROUTE_RISE, routeRibbons, type Route } from '../src/render/gfx/routes';

const unit = (lon: number, lat: number): [number, number, number] => [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
const near: Route = { from: unit(0, 0), to: unit(0.2, 0.05), colour: [1, 0.5, 0.1] };
const far: Route = { from: unit(0, 0.3), to: unit(2.4, -0.4), colour: [0.2, 0.6, 1] };

describe('trade routes on the globe (E31)', () => {
  it('each route is a ribbon from the seller to the buyer that never goes under the ground and rises more the further it has to go', () => {
    const steps = 24, width = 0.0035;
    const g = routeRibbons([near, far], steps, width);
    const per = (steps + 1) * 2;
    expect(g.position.length).toBe(2 * per * 3);
    expect(g.color.length).toBe(g.position.length);
    expect(g.index.length).toBe(2 * steps * 6);
    for (const i of g.index) expect(i).toBeLessThan(2 * per);
    for (const v of g.position) expect(Number.isFinite(v)).toBe(true);
    const radius = (route: number, k: number): number => { const a = (route * per + k * 2) * 3, b = a + 3; return Math.hypot((g.position[a]! + g.position[b]!) / 2, (g.position[a + 1]! + g.position[b + 1]!) / 2, (g.position[a + 2]! + g.position[b + 2]!) / 2); };
    const middle = (route: number, k: number): [number, number, number] => { const a = (route * per + k * 2) * 3, b = a + 3; return [(g.position[a]! + g.position[b]!) / 2, (g.position[a + 1]! + g.position[b + 1]!) / 2, (g.position[a + 2]! + g.position[b + 2]!) / 2]; };
    for (const [route, r] of [[0, near], [1, far]] as const) {
      // it begins over the seller's capital and ends over the buyer's, just above the ground
      const start = middle(route, 0), end = middle(route, steps);
      for (let c = 0; c < 3; c++) { expect(start[c]! / (1 + ROUTE_LIFT)).toBeCloseTo(r.from[c]!, 5); expect(end[c]! / (1 + ROUTE_LIFT)).toBeCloseTo(r.to[c]!, 5); }
      // nowhere under the ground, never higher than a route may rise, highest half-way
      for (let k = 0; k <= steps; k++) { expect(radius(route, k)).toBeGreaterThanOrEqual(1 + ROUTE_LIFT - 1e-6); expect(radius(route, k)).toBeLessThanOrEqual(1 + ROUTE_LIFT + ROUTE_RISE + 1e-6); }
      expect(radius(route, steps / 2)).toBeGreaterThan(radius(route, 2));
      // the ribbon is as wide as asked all along
      for (let k = 0; k <= steps; k++) { const a = (route * per + k * 2) * 3; expect(Math.hypot(g.position[a]! - g.position[a + 3]!, g.position[a + 1]! - g.position[a + 4]!, g.position[a + 2]! - g.position[a + 5]!)).toBeCloseTo(width, 6); }
      // brightest at the buyer's end, in the colour of the goods
      const first = route * per * 3, last = (route * per + steps * 2) * 3;
      expect(g.color[last]!).toBeCloseTo(r.colour[0], 5);
      expect(g.color[first]!).toBeLessThan(g.color[last]! * 0.6);
    }
    // the long route rises higher than the short one
    expect(radius(1, steps / 2)).toBeGreaterThan(radius(0, steps / 2) + 0.01);
  });

  it('a route between two capitals in one place, or half the world apart, still has a shape', () => {
    const same = routeRibbons([{ from: unit(1, 0.2), to: unit(1, 0.2), colour: [1, 1, 1] }]);
    for (const v of same.position) expect(Number.isFinite(v)).toBe(true);
    const across = routeRibbons([{ from: unit(0, 0), to: unit(Math.PI - 1e-9, 0), colour: [1, 1, 1] }]);
    for (const v of across.position) expect(Number.isFinite(v)).toBe(true);
    expect(routeRibbons([]).position.length).toBe(0);
  });
});
