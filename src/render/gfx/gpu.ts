// Render-to-texture helpers. Passes are full-screen quads with node materials, so the same code
// runs on the WebGL2 and WebGPU backends.
import {
  ClampToEdgeWrapping, HalfFloatType, LinearFilter, LinearMipmapLinearFilter, NearestFilter, NodeMaterial, QuadMesh, RGBAFormat, RenderTarget, RepeatWrapping,
  type Texture, type TextureDataType, type WebGPURenderer,
} from 'three/webgpu';
import { vec4 } from 'three/tsl';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TargetOptions { type?: TextureDataType; linear?: boolean; repeat?: boolean; mipmaps?: boolean; }

export function makeTarget(width: number, height: number, o: TargetOptions = {}): RenderTarget {
  const rt = new RenderTarget(width, height, {
    type: o.type ?? HalfFloatType,
    format: RGBAFormat,
    magFilter: o.linear ? LinearFilter : NearestFilter,
    minFilter: o.mipmaps ? LinearMipmapLinearFilter : o.linear ? LinearFilter : NearestFilter,
    wrapS: o.repeat ? RepeatWrapping : ClampToEdgeWrapping,
    wrapT: o.repeat ? RepeatWrapping : ClampToEdgeWrapping,
    depthBuffer: false,
    generateMipmaps: !!o.mipmaps,
  });
  return rt;
}

let mipsBroken = false;
/** Rebuild the mip chain of a render target after drawing into it. */
export function refreshMipmaps(renderer: WebGPURenderer, target: RenderTarget): void {
  if (mipsBroken) return;
  try {
    (renderer.backend as any).generateMipmaps(target.texture);
  } catch {
    // a backend that cannot do it: fall back to plain filtering everywhere from now on
    mipsBroken = true;
  }
  if (mipsBroken) { target.texture.minFilter = LinearFilter; target.texture.needsUpdate = true; }
}

/** One full-screen pass writing a vec4 node into a target. */
export class Pass {
  readonly material: NodeMaterial;
  private readonly quad: QuadMesh;

  constructor(output: any) {
    this.material = new NodeMaterial();
    (this.material as any).fragmentNode = vec4(output);
    this.material.depthTest = false;
    this.material.depthWrite = false;
    this.quad = new QuadMesh(this.material);
  }

  render(renderer: WebGPURenderer, target: RenderTarget): void {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
    renderer.setRenderTarget(prev);
    // render targets do not rebuild their mip chain by themselves
    if (target.texture.generateMipmaps) refreshMipmaps(renderer, target);
  }
}

/** Two targets that swap roles: read from one, write to the other. */
export class PingPong {
  read: RenderTarget;
  write: RenderTarget;
  constructor(width: number, height: number, o: TargetOptions = {}) {
    this.read = makeTarget(width, height, o);
    this.write = makeTarget(width, height, o);
  }
  swap(): void {
    const t = this.read;
    this.read = this.write;
    this.write = t;
  }
  get texture(): Texture {
    return this.read.texture;
  }
}
