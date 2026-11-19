// One continuous camera from deep space down to the ground.
import { PerspectiveCamera, Vector3 } from 'three/webgpu';

const Y = new Vector3(0, 1, 0);
const tmpS = new Vector3();
const tmpN = new Vector3();
const tmpE = new Vector3();
const tmpF = new Vector3();
const tmpUp = new Vector3();
const tmpFocus = new Vector3();

export const MIN_DIST = 0.006;
export const MAX_DIST = 60;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class OrbitCamera {
  readonly camera: PerspectiveCamera;
  /** Focus point on the surface (radians). */
  lon = 0.6;
  lat = 0.35;
  /** Distance from the focus point. */
  dist = 2.5;
  heading = 0;
  /** User tilt offset in radians (negative = look more toward the horizon). */
  tiltOffset = 0;
  /** 1 lets a positive tilt raise the gaze above the focus point (used under water); 0 keeps it on the ground. */
  lookUp = 0;
  private tLon = this.lon;
  private tLat = this.lat;
  private tDist = this.dist;
  private tHeading = 0;
  private tTilt = 0;
  /** Seconds since the last user input. */
  idle = 0;
  autoOrbit = 0.012;
  enabled = true;
  /** Returns terrain radius at a unit direction. */
  groundRadius: (x: number, y: number, z: number) => number = () => 1;
  private pointers = new Map<number, { x: number; y: number; button: number }>();
  private pinch = 0;
  private lastTap = 0;
  onTap?: (x: number, y: number, double: boolean) => void;
  onLongPress?: (x: number, y: number) => void;
  onActivity?: () => void;
  private downAt = { x: 0, y: 0, t: 0 };
  private moved = false;
  private longPressTimer = 0;

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(42, aspect, 0.01, 1200);
  }

  attach(el: HTMLElement): void {
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
      this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.moved = false;
      this.pinch = 0;
      window.clearTimeout(this.longPressTimer);
      if (e.pointerType === 'touch' && this.pointers.size === 1) {
        this.longPressTimer = window.setTimeout(() => {
          if (!this.moved && this.pointers.size === 1) this.onLongPress?.(e.clientX, e.clientY);
        }, 600);
      }
      this.touch();
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      this.onActivity?.();
      if (!p || !this.enabled) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 6) this.moved = true;
      if (this.pointers.size === 2) {
        const other = [...this.pointers.entries()].find(([id]) => id !== e.pointerId)![1];
        const d = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        if (this.pinch > 0) this.zoomBy(this.pinch / d);
        this.pinch = d;
        // two-finger drag: pan and tilt
        this.tHeading -= dx * 0.003;
        this.tTilt = Math.max(-1.2, Math.min(0.5, this.tTilt + dy * 0.003));
      } else if (p.button === 2) {
        this.tHeading -= dx * 0.005;
        this.tTilt = Math.max(-1.2, Math.min(0.5, this.tTilt + dy * 0.004));
      } else {
        this.orbitBy(dx, dy, el.clientHeight);
      }
      p.x = e.clientX;
      p.y = e.clientY;
      this.touch();
    });
    const up = (e: PointerEvent) => {
      const had = this.pointers.delete(e.pointerId);
      window.clearTimeout(this.longPressTimer);
      this.pinch = 0;
      if (had && !this.moved && e.button === 0 && performance.now() - this.downAt.t < 500) {
        const now = performance.now();
        const dbl = now - this.lastTap < 350;
        this.lastTap = dbl ? 0 : now;
        this.onTap?.(e.clientX, e.clientY, dbl);
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      this.zoomBy(Math.exp(e.deltaY * 0.0012));
      this.touch();
    }, { passive: false });
  }

  private touch(): void {
    this.idle = 0;
    this.onActivity?.();
  }

  zoomBy(factor: number): void {
    this.tDist = Math.max(MIN_DIST, Math.min(MAX_DIST, this.tDist * factor));
  }

  private orbitBy(dx: number, dy: number, viewH: number): void {
    // drag so the ground follows the cursor: angular speed scales with distance
    const k = (Math.min(this.tDist, 2.4) * 1.6) / viewH;
    const ch = Math.cos(this.heading), sh = Math.sin(this.heading);
    const east = -(dx * ch + dy * sh) * k;
    const north = (dy * ch - dx * sh) * k;
    this.tLat = Math.max(-1.5, Math.min(1.5, this.tLat + north));
    this.tLon += east / Math.max(0.2, Math.cos(this.tLat));
  }

  flyTo(lon: number, lat: number, dist?: number): void {
    // take the short way round
    let d = lon - this.tLon;
    d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.tLon += d;
    this.tLat = lat;
    if (dist !== undefined) this.tDist = dist;
  }

  zoomTo(dist: number): void {
    this.tDist = Math.max(MIN_DIST, Math.min(MAX_DIST, dist));
  }

  /** Keep the focus on a moving point (follow mode). */
  track(lon: number, lat: number): void {
    let d = lon - this.tLon;
    d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.tLon += d;
    this.tLat = lat;
    this.idle = 0;
  }

  setImmediate(lon: number, lat: number, dist: number): void {
    this.lon = this.tLon = lon;
    this.lat = this.tLat = lat;
    this.dist = this.tDist = dist;
  }

  /** Focus direction as a unit vector. */
  focusDir(out: Vector3): Vector3 {
    const cl = Math.cos(this.lat);
    return out.set(cl * Math.cos(this.lon), Math.sin(this.lat), cl * Math.sin(this.lon));
  }

  get altitude(): number {
    return this.dist;
  }

  update(dt: number): void {
    this.idle += dt;
    if (this.enabled && this.idle > 6 && this.autoOrbit > 0) {
      this.tLon += this.autoOrbit * dt * Math.min(1, (this.idle - 6) / 3) * Math.min(1, this.dist);
    }
    const k = 1 - Math.exp(-dt * 7);
    this.lon += (this.tLon - this.lon) * k;
    this.lat += (this.tLat - this.lat) * k;
    this.dist *= Math.pow(this.tDist / this.dist, k);
    this.heading += (this.tHeading - this.heading) * k;
    this.tiltOffset += (this.tTilt - this.tiltOffset) * k;

    const S = this.focusDir(tmpS);
    const ground = this.groundRadius(S.x, S.y, S.z);
    tmpFocus.copy(S).multiplyScalar(ground);
    // straight down from far away, tilting toward the horizon near the ground
    const closeness = 1 - smooth(Math.log(0.03), Math.log(1.6), Math.log(this.dist));
    const tilt = Math.max(0.12, Math.min(Math.PI / 2, Math.PI / 2 - closeness * 1.15 + this.tiltOffset * closeness));
    tmpN.copy(Y).addScaledVector(S, -S.dot(Y)).normalize();
    tmpE.crossVectors(tmpN, S).normalize();
    tmpF.copy(tmpN).multiplyScalar(Math.cos(this.heading)).addScaledVector(tmpE, Math.sin(this.heading));
    const cam = this.camera;
    cam.position.copy(tmpFocus).addScaledVector(S, Math.sin(tilt) * this.dist).addScaledVector(tmpF, -Math.cos(tilt) * this.dist);
    // never go underground
    const cr = cam.position.length();
    const under = this.groundRadius(cam.position.x / cr, cam.position.y / cr, cam.position.z / cr) + 0.0015;
    if (cr < under) cam.position.multiplyScalar(under / cr);
    tmpUp.copy(tmpF).multiplyScalar(Math.sin(tilt)).addScaledVector(S, Math.cos(tilt)).normalize();
    cam.up.copy(tmpUp);
    // under water a raised tilt lifts the gaze off the sea bed, toward the horizon and then up to the surface
    if (this.lookUp > 0 && this.tiltOffset > 0) tmpFocus.addScaledVector(S, this.lookUp * this.tiltOffset * this.dist * 3);
    cam.lookAt(tmpFocus);
    cam.near = Math.max(0.0004, this.dist * 0.05);
    cam.far = 1200;
    cam.updateProjectionMatrix();
  }
}
