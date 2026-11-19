// Post-processing: bloom, ACES tone mapping, era colour grade, vignette, film grain.
import { ACESFilmicToneMapping, RenderPipeline, type Camera, type Scene, type WebGPURenderer } from 'three/webgpu';
import { float, fract, length, mix, pass, renderOutput, screenUV, sin, dot, smoothstep, uniform, vec2, vec3, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { uFlash, uGradeTint, uTime, uUnderwater } from './common';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const uBloomStrength = uniform(0.5);
export const uGrain = uniform(0.03);
export const uVignette = uniform(0.5);
const uFocus = uniform(1);

export class PostFX {
  readonly pipeline: RenderPipeline;
  private bloomEnabled = true;
  private dofEnabled = false;
  /** Depth of field is skipped on low quality. */
  allowDof = true;
  private scenePass: any;

  constructor(private renderer: WebGPURenderer, scene: Scene, camera: Camera) {
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    this.pipeline = new RenderPipeline(renderer);
    this.scenePass = pass(scene, camera);
    this.build();
  }

  setBloom(enabled: boolean): void {
    if (enabled === this.bloomEnabled) return;
    this.bloomEnabled = enabled;
    this.build();
  }

  /** Depth of field in follow and postcard modes: focus sits at the camera's focus distance. */
  setFocus(on: boolean, distance: number): void {
    uFocus.value = distance;
    const want = on && this.allowDof && distance < 0.5;
    if (want === this.dofEnabled) return;
    this.dofEnabled = want;
    this.build();
  }

  private build(): void {
    let color: any = this.scenePass.getTextureNode('output');
    if (this.dofEnabled) color = dof(color, this.scenePass.getViewZNode(), uFocus, uFocus.mul(0.6), 0.9);
    let hdr: any = color;
    if (this.bloomEnabled) {
      const glow = bloom(color, 1, 0.55, 1.0);
      hdr = color.add((glow as any).mul(uBloomStrength));
    }
    hdr = hdr.mul(vec4(vec3(uGradeTint), 1));
    // under water: light is absorbed toward blue-green
    hdr = mix(hdr, hdr.mul(vec4(0.22, 0.55, 0.72, 1)).add(vec4(0.0, 0.035, 0.07, 0)), uUnderwater);
    this.pipeline.outputColorTransform = false;
    const mapped: any = renderOutput(hdr);
    const uv = screenUV;
    const vig = float(1).sub(smoothstep(0.45, 1.15, length(uv.sub(0.5)).mul(1.45)).mul(uVignette));
    const grain = fract(sin(dot(uv.add(fract(uTime)), vec2(12.9898, 78.233))).mul(43758.5453)).sub(0.5).mul(uGrain);
    const rgb = mix(mapped.rgb.mul(vig).add(grain), vec3(1, 1, 1), uFlash);
    this.pipeline.outputNode = vec4(rgb, 1);
    this.pipeline.needsUpdate = true;
  }

  render(): void {
    this.pipeline.render();
  }
}
