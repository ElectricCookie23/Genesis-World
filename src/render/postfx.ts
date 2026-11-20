// Post-processing: ambient occlusion (GTAO), temporal anti-aliasing with a history buffer, depth of
// field, auto exposure, restrained bloom, AgX tone mapping, era colour grade, sharpening, a touch of
// chromatic aberration at the edges, vignette and film grain.
import {
  AgXToneMapping, Matrix4, RenderPipeline, type PerspectiveCamera, type Scene, type Texture, type WebGPURenderer,
} from 'three/webgpu';
import {
  convertToTexture, dot, exp, float, fract, getViewPosition, length, log, max, mix, pass, renderOutput, screenUV, sin, smoothstep, texture, uniform, uv, vec2,
  vec3, vec4,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import GTAONode from 'three/addons/tsl/display/GTAONode.js';
import { sharpen } from 'three/addons/tsl/display/SharpenNode.js';
import { uDitherFrame, uExposure, uFlash, uGradeTint, uShimmer, uTime, uUnderwater, uWaterFog } from './common';
export { uExposure };
import { Pass, makeTarget } from './gfx/gpu';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

export const uBloomStrength = uniform(0.35);
export const uGrain = uniform(0.022);
export const uVignette = uniform(0.4);
const uFocus = uniform(1);
/** Through an animal's eyes (expansion E50): which sense (0 sight, 1 echoes, 2 warmth, 3 the electric sense), how sharp, how much colour, how good in the dark. */
const uSense = uniform(0);
const uAcuity = uniform(1);
const uColour = uniform(0.6);
const uNight = uniform(0);
/** How far the animal is from what it is looking at: a call carries about that far, whether it is on the ground or the view is from orbit. */
const uReach = uniform(1);

export interface PostOptions {
  /** Temporal anti-aliasing with a history buffer and sharpening. */
  taa: boolean;
  /** Screen-space ambient occlusion. */
  ao: boolean;
  bloom: boolean;
  /** Chromatic aberration at the edges of the frame. */
  fringe: boolean;
}

const LUM = 16;

export class PostFX {
  readonly pipeline: RenderPipeline;
  private options: PostOptions = { taa: true, ao: true, bloom: true, fringe: true };
  private dofEnabled = false;
  /** Whether the picture is being shown as an animal senses it. Costs nothing while off: the filter is not in the chain. */
  private senses = false;
  /** Depth of field is skipped on low quality. */
  allowDof = true;
  /** Auto exposure can be switched off (photo mode locks it). */
  autoExposure = true;
  private scenePass: any;
  private aoNode: any;
  // camera of the previous frame, for reprojecting the history
  private readonly uPrevViewProj = uniform(new Matrix4());
  private readonly uInvProj = uniform(new Matrix4());
  private readonly uCamWorld = uniform(new Matrix4());
  private readonly tmp = new Matrix4();
  private first = true;
  // auto exposure
  private lumPass?: Pass;
  private lumTarget = makeTarget(LUM, LUM);
  private lumSource: N = null;
  private lumBusy = false;
  private frame = 0;
  private target = 1;
  /** The most the exposure may open up: low from orbit (the planet's day side must not be pushed into a milky haze), high near the ground at night. */
  maxExposure = 3.6;
  /** Mean scene luminance last measured (for diagnostics). */
  measured = 0;
  /** Brightness at the bright end of the picture (98th percentile of its cells), last measured. */
  measuredBright = 0;
  private lumCells = new Float32Array(1024);
  private lumLit = 0;

  constructor(private renderer: WebGPURenderer, private scene: Scene, private camera: PerspectiveCamera) {
    renderer.toneMapping = AgXToneMapping;
    renderer.toneMappingExposure = 1.0;
    this.pipeline = new RenderPipeline(renderer);
    this.build();
  }

  /** Whether frames are being blended over time (which also averages away per-frame dither). */
  get temporal(): boolean { return this.options.taa; }

  set(options: Partial<PostOptions>): void {
    const next = { ...this.options, ...options };
    if (next.taa === this.options.taa && next.ao === this.options.ao && next.bloom === this.options.bloom && next.fringe === this.options.fringe) return;
    this.options = next;
    this.build();
  }

  /**
   * Show the world as an animal senses it, or (null) as we do. The numbers come from the species' genes
   * (sim/senses.ts): the filter only draws what they say.
   */
  setVision(v: { mode: 'sight' | 'echo' | 'heat' | 'electric'; acuity: number; colour: number; night: number } | null): void {
    if (v) { uSense.value = v.mode === 'echo' ? 1 : v.mode === 'heat' ? 2 : v.mode === 'electric' ? 3 : 0; uAcuity.value = v.acuity; uColour.value = v.colour; uNight.value = v.night; }
    if (!!v === this.senses) return;
    this.senses = !!v;
    this.build();
  }

  /** The distance from the eye to what is being looked at: the senses that reach out (echoes, the electric sense) are scaled to it. */
  setReach(distance: number): void {
    uReach.value = Math.max(1e-4, distance);
  }

  setBloom(enabled: boolean): void {
    this.set({ bloom: enabled });
  }

  /** Depth of field in follow and postcard modes: focus sits at the camera's focus distance. */
  setFocus(on: boolean, distance: number): void {
    uFocus.value = distance;
    const want = on && this.allowDof && distance < 0.06;
    if (want === this.dofEnabled) return;
    this.dofEnabled = want;
    this.build();
  }

  private build(): void {
    const o = this.options;
    // The scene is never multisampled. With temporal anti-aliasing it needs none; without it, multisampling was what
    // it fell back to, and that made "anti-aliasing off" 1 to 14 ms a frame slower than on (measured on a real GPU,
    // docs/PERFORMANCE.md). A cheap edge filter at the end does that job instead.
    this.scenePass = (pass as any)(this.scene, this.camera, { samples: 0 });
    const depth: N = this.scenePass.getTextureNode('depth');
    let color: N = this.scenePass.getTextureNode('output');
    // ---- ambient occlusion: only matters near the camera, so it fades out with distance
    if (o.ao) {
      this.aoNode = new (GTAONode as any)(depth, null, this.camera);
      this.aoNode.resolutionScale = 0.5;
      this.aoNode.radius.value = 0.0014;
      this.aoNode.thickness.value = 1.2;
      this.aoNode.distanceExponent.value = 1.5;
      this.aoNode.samples.value = 12;
      const occ: N = this.aoNode.getTextureNode().r;
      const viewZ: N = this.scenePass.getViewZNode();
      const nearness = float(1).sub(smoothstep(0.03, 0.12, viewZ.negate()));
      color = vec4(color.rgb.mul(mix(float(1), occ, nearness.mul(0.9))), color.a);
    }
    // ---- under water, distance swallows everything: the sea bed, plants and animals fade into the water's own colour
    {
      const away: N = this.scenePass.getViewZNode().negate().max(0);
      const lost = float(1).sub(exp(away.mul(uWaterFog.w).negate())).mul(uUnderwater);
      color = vec4(mix(color.rgb, uWaterFog.rgb, lost), color.a);
    }
    // ---- temporal anti-aliasing: reproject last frame's result using the depth buffer and the previous camera
    if (o.taa) {
      const viewPos: N = getViewPosition(screenUV, depth, this.uInvProj);
      const world: N = this.uCamWorld.mul(vec4(viewPos, 1));
      const prevClip: N = this.uPrevViewProj.mul(world);
      const prevNdc: N = prevClip.xy.div(max(prevClip.w, 1e-6));
      const ndc: N = vec2(screenUV.x.mul(2).sub(1), float(1).sub(screenUV.y).mul(2).sub(1));
      const velocityTex: N = convertToTexture(vec4(ndc.sub(prevNdc), 0, 1));
      color = traa(color, depth, velocityTex, this.camera);
    }
    // a wide band stays sharp around the animal being followed; only the far background softens, and not by much
    if (this.dofEnabled) color = dof(color, this.scenePass.getViewZNode(), uFocus, uFocus.mul(2.5), 0.45);
    this.lumSource = null;
    // ---- exposure, then bloom of what is still brighter than white: the star, lava, lightning, aurora, city cores
    // nothing brighter than this survives: a single bad pixel must not bloom into a blot
    let hdr: N = color.mul(uExposure).min(vec4(64, 64, 64, 1)).max(vec4(0, 0, 0, 0));
    if (o.bloom) {
      const glow: N = bloom(hdr, 1, 0.4, 1.05);
      hdr = hdr.add(glow.mul(uBloomStrength));
    }
    hdr = hdr.mul(vec4(vec3(uGradeTint), 1));
    // under water: light is absorbed toward blue-green
    hdr = mix(hdr, hdr.mul(vec4(0.45, 0.78, 0.9, 1)), uUnderwater);
    this.pipeline.outputColorTransform = false;
    let mapped: N = renderOutput(hdr);
    // AgX is gentle on highlights but a little flat: give some colour back
    const grey = dot(mapped.rgb, vec3(0.2126, 0.7152, 0.0722));
    mapped = vec4(mix(vec3(grey, grey, grey), mapped.rgb, 1.22).max(0), 1);
    if (o.taa) mapped = sharpen(mapped, 0.22);
    else mapped = fxaa(mapped);
    const st = screenUV;
    const fromCentre = st.sub(0.5);
    const r2 = dot(fromCentre, fromCentre);
    let rgb: N = mapped.rgb;
    if (o.fringe) {
      // red and blue part ways only toward the corners
      const t: N = convertToTexture(mapped);
      const shift = fromCentre.mul(r2).mul(0.012);
      // hot air over the ground makes the lower part of the picture waver
      const waver = vec2(sin(st.y.mul(140).add(uTime.mul(6))).mul(0.0016), sin(st.x.mul(90).add(uTime.mul(4.3))).mul(0.0009)).mul(uShimmer).mul(smoothstep(0.4, 0.8, st.y));
      const sw = st.add(waver);
      rgb = vec3(t.sample(sw.sub(shift)).r, t.sample(sw).g, t.sample(sw.add(shift)).b);
    }
    if (this.senses) {
      // ---- through their eyes. Sight first: how sharp, how much colour, how well in the dark.
      const seen: N = convertToTexture(vec4(rgb, 1));
      // poor eyes see in coarse patches: the picture is read at fewer places
      const cells = mix(float(46), float(1400), uAcuity.mul(uAcuity));
      const at = st.mul(cells).floor().add(0.5).div(cells);
      let eye: N = mix(seen.sample(at).rgb, seen.sample(st).rgb, smoothstep(0.85, 1, uAcuity));
      // eyes made for the dark lift the shadows
      eye = eye.max(0).pow(vec3(1, 1, 1).mul(float(1).sub(uNight.mul(0.5))));
      const lum = dot(eye, vec3(0.2126, 0.7152, 0.0722));
      // colour: none, a few dull ones, ours, or past violet (where blue leads, a colour we have no name for is added)
      const beyond = smoothstep(0.75, 1, uColour);
      eye = mix(vec3(lum, lum, lum), eye, uColour.mul(1.7).min(1.3)).add(vec3(0.5, 0.05, 0.6).mul(beyond).mul(eye.b.sub(eye.g).max(0).mul(2.2)));
      // ---- echoes: no light at all. A call goes out and comes back: near things answer loud, far things faintly, in rings
      const away: N = this.scenePass.getViewZNode().negate().max(1e-5);
      const ring = sin(log(away).mul(26).sub(uTime.mul(5))).mul(0.5).add(0.5).pow(5);
      const near = exp(away.div(uReach.mul(2.2)).negate());
      const echo = vec3(0.55, 0.85, 1).mul(ring.mul(0.9).add(0.14)).mul(near.mul(1.9).add(0.08)).mul(lum.mul(0.8).add(0.45));
      // ---- warmth: what is bright and warm-coloured stands out against the cold; black, violet, red, yellow, white
      const warm = lum.mul(0.75).add(eye.r.sub(eye.b).max(0).mul(0.9)).min(1);
      const heat = mix(mix(mix(vec3(0.02, 0.0, 0.08), vec3(0.45, 0.0, 0.5), smoothstep(0.0, 0.3, warm)), vec3(0.95, 0.25, 0.05), smoothstep(0.25, 0.6, warm)), vec3(1, 0.95, 0.6), smoothstep(0.55, 0.95, warm));
      // ---- the electric sense: rock and water are dark; what is alive (what has colour of its own) glows and flickers
      const most = max(max(eye.r, eye.g), eye.b), least = eye.r.min(eye.g).min(eye.b);
      const alive = most.sub(least).div(most.add(0.05)).pow(1.4);
      const flicker = sin(uTime.mul(17).add(st.x.mul(90)).add(st.y.mul(70))).mul(0.12).add(0.88);
      const field = vec3(0.02, 0.05, 0.14).add(vec3(0.35, 0.95, 1).mul(alive).mul(flicker).mul(2.6)).mul(near.mul(0.8).add(0.45));
      const isEcho = smoothstep(0.5, 0.51, uSense).mul(float(1).sub(smoothstep(1.5, 1.51, uSense)));
      const isHeat = smoothstep(1.5, 1.51, uSense).mul(float(1).sub(smoothstep(2.5, 2.51, uSense)));
      const isField = smoothstep(2.5, 2.51, uSense);
      rgb = mix(mix(mix(eye, echo, isEcho), heat, isHeat), field, isField);
    }
    const vig = float(1).sub(smoothstep(0.45, 1.15, length(fromCentre).mul(1.45)).mul(uVignette));
    const grain = fract(sin(dot(st.add(fract(uTime)), vec2(12.9898, 78.233))).mul(43758.5453)).sub(0.5).mul(uGrain);
    rgb = mix(rgb.mul(vig).add(grain), vec3(1, 1, 1), uFlash);
    this.pipeline.outputNode = vec4(rgb, 1);
    this.pipeline.needsUpdate = true;
    this.first = true;
  }

  /** Measure the picture's brightness now and then, and let the exposure follow it like an eye adjusting. */
  private adapt(dt: number): void {
    const raw: Texture | undefined = this.scenePass.getTexture ? this.scenePass.getTexture('output') : undefined;
    if (raw && this.autoExposure) {
      if (!this.lumPass || this.lumSource?.value !== raw) {
        this.lumSource = texture(raw);
        const st: N = uv();
        let sum: N = vec3(0, 0, 0);
        // sixteen taps spread over each cell, so small bright things are not missed
        for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
          const c: N = this.lumSource.sample(st.add(vec2((i - 1.5) / (LUM * 4), (j - 1.5) / (LUM * 4)))).rgb;
          const lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
          // empty space does not count: the eye adapts to the planet, not the void
          const w = smoothstep(0.0003, 0.002, lum);
          sum = sum.add(vec3(log(lum.max(1e-5)).mul(w), w, lum.min(4).mul(w)));
        }
        const centre = float(1).sub(length(st.sub(0.5)).mul(1.1)).max(0.25);
        this.lumPass = new Pass(vec4(sum.x.mul(centre).div(16), sum.y.mul(centre).div(16), sum.z.mul(centre).div(16), 1));
      }
      if (!this.lumBusy && this.frame % 6 === 0) {
        this.lumBusy = true;
        this.lumPass.render(this.renderer, this.lumTarget);
        this.renderer.readRenderTargetPixelsAsync(this.lumTarget, 0, 0, LUM, LUM).then((px: any) => {
          let a = 0, w = 0, lin = 0;
          const half = px instanceof Uint16Array;
          const dec = (h: number) => { const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff; return e === 0 ? s * 6.103515625e-5 * (f / 1024) : s * Math.pow(2, e - 15) * (1 + f / 1024); };
          // each cell's own mean brightness too, to find the bright end of the picture
          const cells = this.lumCells; let lit = 0;
          for (let i = 0; i < LUM * LUM; i++) {
            const wi = half ? dec(px[i * 4 + 1]) : px[i * 4 + 1], li = half ? dec(px[i * 4 + 2]) : px[i * 4 + 2];
            a += half ? dec(px[i * 4]) : px[i * 4]; w += wi; lin += li;
            if (wi > 0.02 && li === li) cells[lit++] = li / wi;
          }
          const cover = w / (LUM * LUM);
          if (cover > 0.004 && isFinite(a) && isFinite(lin) && lin > 0) {
            // mostly the plain average (so bright cloud and snow are not blown out), tempered by the log average (so a dark scene still lifts)
            const mean = Math.pow(Math.exp(a / w), 0.15) * Math.pow(Math.max(1e-5, lin / w), 0.85);
            this.measured = mean;
            // aim for a mid-grey picture, but do not chase a few lit pixels in a dark frame
            // (the floor was 0.6: a day side under a wide cloud belt stayed flat white with a glow round it on a real GPU)
            // The bright end must stay below white. Aiming only at a mid-grey average, a planet that is mostly dark sea
            // with a wide belt of sunlit cloud asked for nearly twice the light and its clouds went flat white with a
            // glow round the disc (seen twice on a real GPU; the cap from orbit used to hide this). The brightest
            // fiftieth of the picture is found and held just under white.
            let bright = mean;
            if (lit > 8) { const top = cells.subarray(0, lit).sort(); bright = Math.max(mean, top[Math.floor(lit * 0.98)]!); this.lumLit = lit; }
            this.measuredBright = bright;
            const wanted = Math.max(0.38, Math.min(this.maxExposure, 0.2 / mean, 0.95 / bright));
            this.target = 1 + (wanted - 1) * Math.min(1, cover * 6);
          } else this.target = Math.min(1.6, this.maxExposure);
          this.lumBusy = false;
        }).catch(() => { this.lumBusy = false; });
      }
    } else if (!this.autoExposure) this.target = 1;
    this.frame++;
    // eyes adjust faster to brightness than to darkness
    const rate = this.target < uExposure.value ? 2.6 : 0.9;
    uExposure.value += (this.target - uExposure.value) * (1 - Math.exp(-Math.max(0, Math.min(1, dt)) * rate));
    if (!(uExposure.value > 0.05 && uExposure.value < 20)) { uExposure.value = 1; this.target = 1; }
  }

  render(dt = 0.016): void {
    const cam = this.camera;
    cam.updateMatrixWorld();
    this.uInvProj.value.copy(cam.projectionMatrixInverse);
    this.uCamWorld.value.copy(cam.matrixWorld);
    if (this.first) { this.uPrevViewProj.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); this.first = false; }
    uDitherFrame.value = this.options.taa ? (this.frame % 64) * 5.588238 : 0;
    this.pipeline.render();
    // remember this frame's camera for the next reprojection
    this.tmp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.uPrevViewProj.value.copy(this.tmp);
    this.adapt(dt);
  }
}
