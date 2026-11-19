// Several vertex attributes in one shared buffer.
// WebGPU draws with at most 8 vertex buffers, and every separate BufferAttribute is a buffer of
// its own, so a model with many attributes (plants: 10, animals: 14) cannot be drawn at all there.
// Attributes packed here share one buffer and count once.
import { DynamicDrawUsage, InstancedInterleavedBuffer, InterleavedBuffer, InterleavedBufferAttribute, Mesh, type BufferGeometry, type Material } from 'three/webgpu';

/**
 * A mesh drawn `count` times, where the shader places each copy itself from instanced attributes.
 * Unlike InstancedMesh it carries no matrix per copy. Three sends those matrices either as a uniform
 * buffer or, when there are too many for one (256 on a 16 KB limit), as a vertex buffer taking four
 * more attribute slots. That pushed animals past the 16 attributes a draw may have, so their shader
 * failed to compile on WebGL2 wherever the uniform limit is small, and a mesh made with room for no
 * copies at all asked WebGPU for an empty buffer.
 */
export class Copies extends Mesh {
  constructor(geometry: BufferGeometry, material: Material, count: number) {
    super(geometry, material);
    this.count = count;
    this.frustumCulled = false; // the copies are placed in the shader, so the geometry's own bounds say nothing
  }
}

/** WebGPU's default limit on vertex attributes for one draw; WebGL2 guarantees the same number. */
export const MAX_VERTEX_ATTRIBUTES = 16;

/** WebGPU's default limit on vertex buffers for one draw. */
export const MAX_VERTEX_BUFFERS = 8;

export interface PackedField {
  name: string;
  size: number;
  /** Values to start with, `size` numbers per element; left at zero when absent. One element's worth is repeated for every element. */
  data?: ArrayLike<number>;
}

/**
 * Adds the fields to the geometry as attributes that share one buffer and returns them by name.
 * `instanced` makes them advance once per instance instead of once per vertex; `dynamic` marks the
 * buffer as rewritten often. Setting `needsUpdate` on any returned attribute uploads the whole buffer.
 */
export function packAttributes(
  geo: BufferGeometry, fields: PackedField[], count: number, opts: { instanced?: boolean; dynamic?: boolean } = {},
): Record<string, InterleavedBufferAttribute> {
  let stride = 0;
  for (const f of fields) stride += f.size;
  const array = new Float32Array(count * stride);
  let offset = 0;
  const out: Record<string, InterleavedBufferAttribute> = {};
  const buffer = opts.instanced ? new InstancedInterleavedBuffer(array, stride, 1) : new InterleavedBuffer(array, stride);
  if (opts.dynamic) buffer.setUsage(DynamicDrawUsage);
  for (const f of fields) {
    if (f.data) {
      const every = f.data.length === f.size;
      for (let i = 0; i < count; i++) for (let k = 0; k < f.size; k++) array[i * stride + offset + k] = f.data[every ? k : i * f.size + k] ?? 0;
    }
    const attr = new InterleavedBufferAttribute(buffer, f.size, offset);
    geo.setAttribute(f.name, attr);
    out[f.name] = attr;
    offset += f.size;
  }
  return out;
}

/** How many vertex buffers a draw of this geometry binds (attributes that share a buffer count once). */
export function vertexBufferCount(geo: BufferGeometry): number {
  const seen = new Set<unknown>();
  for (const a of Object.values(geo.attributes)) seen.add((a as InterleavedBufferAttribute).isInterleavedBufferAttribute ? (a as InterleavedBufferAttribute).data : a);
  return seen.size;
}
