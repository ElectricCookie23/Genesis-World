// Render-to-texture helpers. Passes are full-screen quads with node materials, so the same code
// runs on the WebGL2 and WebGPU backends.
import {
  type BufferGeometry, InstancedInterleavedBuffer, InterleavedBuffer, InterleavedBufferAttribute,
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

/**
 * WebGPU allows only eight vertex buffers per draw, and every separate attribute is a buffer of its own.
 * This packs the named attributes of a geometry (all of its per-vertex ones by default) into a single
 * interleaved buffer, so a mesh with many attributes still fits. Pass `instanced` to pack per-instance
 * attributes that never change after creation.
 */
export function packAttributes(g: BufferGeometry, names?: string[], instanced = false): void {
  const list = (names ?? Object.keys(g.attributes)).filter((n) => {
    const a = g.getAttribute(n) as any;
    return a && !a.isInterleavedBufferAttribute && (instanced ? a.isInstancedBufferAttribute : !a.isInstancedBufferAttribute) && a.array instanceof Float32Array;
  });
  if (list.length < 2) return;
  const count = g.getAttribute(list[0]!).count;
  let stride = 0;
  for (const n of list) { const a = g.getAttribute(n); if (a.count !== count) return; stride += a.itemSize; }
  const data = new Float32Array(count * stride);
  const buffer = instanced ? new InstancedInterleavedBuffer(data, stride, 1) : new InterleavedBuffer(data, stride);
  let offset = 0;
  for (const n of list) {
    const a = g.getAttribute(n);
    const src = a.array as Float32Array, size = a.itemSize;
    for (let i = 0; i < count; i++) for (let k = 0; k < size; k++) data[i * stride + offset + k] = src[i * size + k]!;
    g.setAttribute(n, new InterleavedBufferAttribute(buffer, size, offset));
    offset += size;
  }
}
