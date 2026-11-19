// Several vertex attributes in one shared buffer.
// WebGPU draws with at most 8 vertex buffers, and every separate BufferAttribute is a buffer of
// its own, so a model with many attributes (plants: 10, animals: 14) cannot be drawn at all there.
// Attributes packed here share one buffer and count once.
import { DynamicDrawUsage, InstancedInterleavedBuffer, InterleavedBuffer, InterleavedBufferAttribute, type BufferGeometry } from 'three/webgpu';

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
