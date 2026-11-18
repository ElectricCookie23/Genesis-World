// The opening sequence (BRIEF 7.1): dust disc, molten planet, moon-forming impact, cooling, first rain, oceans.
import type { GenesisScene } from './scene';
import { MOON_DISTANCE, uAtmo, uCloudAmount, uFlash, uMolten, uOceanFill, uSteam } from './common';
import { uDiscCollapse, uDiscOpacity } from './effects';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

export const OPENING_SECONDS = 16;

export class Opening {
  t = 0;
  done = false;
  /** Fired once when the first chronicle line should appear (13 s). */
  onChronicle?: () => void;
  private chronicleShown = false;

  constructor(private scene: GenesisScene, private reducedMotion: boolean) {
    scene.cam.enabled = false;
    scene.disc.visible = true;
    this.apply(0);
  }

  skip(): void {
    this.t = OPENING_SECONDS;
    this.finish();
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    uMolten.value = 0;
    uAtmo.value = 1;
    uOceanFill.value = 1;
    uCloudAmount.value = 1;
    uSteam.value = 0;
    uFlash.value = 0;
    uDiscOpacity.value = 0;
    const s = this.scene;
    s.disc.visible = false;
    s.planet?.mesh.scale.setScalar(1);
    s.moonDistance = MOON_DISTANCE;
    s.moon.visible = true;
    s.moon.scale.setScalar(1);
    s.cam.enabled = true;
    s.cam.idle = 100;
    s.daySpeed = 1;
    if (!this.chronicleShown) {
      this.chronicleShown = true;
      this.onChronicle?.();
    }
  }

  update(dt: number): void {
    if (this.done) return;
    if (this.reducedMotion) {
      // short fade instead of the full sequence
      this.t += dt * 8;
    } else this.t += dt;
    if (this.t >= OPENING_SECONDS) {
      this.finish();
      return;
    }
    this.apply(this.t);
  }

  private apply(t: number): void {
    const s = this.scene;
    // 0-4 s: the disc swirls while the camera drifts in. 4-8 s: it collapses into the molten planet.
    uDiscOpacity.value = ease(span(t, 0, 1.2)) * (1 - ease(span(t, 5.2, 8)));
    uDiscCollapse.value = ease(span(t, 3.6, 7.6));
    const grow = ease(span(t, 3.4, 6.6));
    const scale = 0.02 + 0.98 * grow;
    s.planet?.mesh.scale.setScalar(scale);
    uMolten.value = 1 - ease(span(t, 8, 12.2));
    // the moon-forming impact
    const flash = Math.exp(-Math.pow((t - 6.7) / 0.28, 2));
    uFlash.value = flash * 0.92;
    s.moon.visible = t > 6.7;
    const out = ease(span(t, 6.7, 11.5));
    s.moonDistance = 1.15 + (MOON_DISTANCE - 1.15) * out;
    s.moon.scale.setScalar(0.35 + 0.65 * out);
    // 8-13 s: cooling, steam, air, rain
    uAtmo.value = ease(span(t, 8.6, 12.5));
    uSteam.value = ease(span(t, 8.4, 10.5)) * (1 - ease(span(t, 12.2, 15.5))) * 0.75;
    uCloudAmount.value = ease(span(t, 9, 14));
    // 13-16 s: the oceans fill
    uOceanFill.value = ease(span(t, 11.8, 15.6));
    // camera: drift in from far away and settle into orbit
    const cam = s.cam;
    const d = 11.5 - 9.0 * ease(span(t, 0, 15.5));
    cam.setImmediate(0.6 + t * 0.022, 0.42 - 0.07 * ease(span(t, 0, 16)), d);
    s.daySpeed = 1 + 3 * (1 - ease(span(t, 6, 14)));
    if (t >= 13 && !this.chronicleShown) {
      this.chronicleShown = true;
      this.onChronicle?.();
    }
  }
}
