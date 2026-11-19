// Chunked cube-sphere with quadtree level of detail.
// One square grid patch is instanced for every visible quadtree leaf; the vertex shader places each
// patch on its cube face, projects it onto the sphere and lets the caller displace it. Patches split
// as the camera approaches, and a downward skirt around every patch hides the cracks between levels.
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, type Material, Vector3 } from 'three/webgpu';
import { Fn, attribute, normalize, select, vec3 } from 'three/tsl';
import { faceDirection } from './cubebake';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/** Direction on the unit sphere for a point of a cube face. u, v in -1..1. Must match cubebake.faceDirection. */
export const faceDirectionNode = Fn(([face, u, v]: [N, N, N]) => {
  const px = vec3(1, v.negate(), u.negate());
  const nx = vec3(-1, v.negate(), u);
  const py = vec3(u, 1, v);
  const ny = vec3(u, -1, v.negate());
  const pz = vec3(u, v.negate(), 1);
  const nz = vec3(u.negate(), v.negate(), -1);
  return normalize(select(face.lessThan(0.5), px, select(face.lessThan(1.5), nx, select(face.lessThan(2.5), py, select(face.lessThan(3.5), ny, select(face.lessThan(4.5), pz, nz))))));
});

export interface PatchNodes {
  /** Unit direction of this vertex on the sphere. */
  dir: N;
  /** Size of the patch as a fraction of a cube face (1 = whole face). */
  size: N;
  /** 1 on skirt vertices, 0 elsewhere. */
  skirt: N;
}

/** Nodes describing the current vertex of a patch. Use inside the material's positionNode. */
export function patchNodes(): PatchNodes {
  const patch: N = attribute('qpatch', 'vec4');
  const local: N = attribute('position', 'vec3');
  const u = patch.x.add(local.x.mul(patch.z)).mul(2).sub(1);
  const v = patch.y.add(local.y.mul(patch.z)).mul(2).sub(1);
  return { dir: faceDirectionNode(patch.w, u, v), size: patch.z, skirt: local.z };
}

export class QuadSphere {
  readonly mesh: InstancedMesh;
  private readonly patch: InstancedBufferAttribute;
  private readonly max: number;
  private readonly tmp: [number, number, number] = [0, 0, 0];
  private readonly centre = new Vector3();
  private count = 0;
  /** Deepest level reached in the last update (for diagnostics). */
  deepest = 0;

  /**
   * @param segments quads along one side of a patch
   * @param maxPatches most patches drawn at once
   */
  constructor(material: Material, segments: number, maxPatches: number) {
    this.max = maxPatches;
    const S = segments;
    const positions: number[] = [];
    const index: number[] = [];
    // the grid itself
    for (let y = 0; y <= S; y++) for (let x = 0; x <= S; x++) positions.push(x / S, y / S, 0);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const a = y * (S + 1) + x, b = a + 1, c = a + S + 1, d = c + 1;
        index.push(a, c, b, b, c, d);
      }
    }
    // skirts: a second ring of edge vertices that hangs down, joined to the edge
    const edge: number[] = [];
    for (let x = 0; x <= S; x++) edge.push(x); // bottom
    for (let y = 1; y <= S; y++) edge.push(y * (S + 1) + S); // right
    for (let x = S - 1; x >= 0; x--) edge.push(S * (S + 1) + x); // top
    for (let y = S - 1; y >= 1; y--) edge.push(y * (S + 1)); // left
    const first = positions.length / 3;
    for (const e of edge) positions.push(positions[e * 3]!, positions[e * 3 + 1]!, 1);
    for (let i = 0; i < edge.length; i++) {
      const a = edge[i]!, b = edge[(i + 1) % edge.length]!;
      const sa = first + i, sb = first + ((i + 1) % edge.length);
      // both windings, so the skirt shows whichever side the camera is on
      index.push(a, b, sa, b, sb, sa, a, sa, b, b, sa, sb);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geometry.setIndex(index);
    this.patch = new InstancedBufferAttribute(new Float32Array(maxPatches * 4), 4);
    this.patch.setUsage(DynamicDrawUsage);
    geometry.setAttribute('qpatch', this.patch);
    this.mesh = new InstancedMesh(geometry, material, maxPatches);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  /**
   * Choose the patches to draw for a camera position (in the planet's own space).
   * @param split a patch splits when the camera is closer than split x its width
   * @param maxLevel deepest quadtree level
   */
  update(camera: Vector3, split: number, maxLevel: number): void {
    this.count = 0;
    this.deepest = 0;
    const camR = camera.length();
    // nothing beyond the horizon is visible; mountains get a small allowance
    const horizon = Math.acos(Math.min(1, 1 / Math.max(1.0001, camR))) + 0.06;
    const cx = camera.x / camR, cy = camera.y / camR, cz = camera.z / camR;
    const visit = (face: number, x0: number, y0: number, size: number, level: number): void => {
      if (this.count >= this.max) return;
      faceDirection(face, (x0 + size / 2) * 2 - 1, (y0 + size / 2) * 2 - 1, this.tmp);
      const d = this.tmp;
      const angle = Math.acos(Math.max(-1, Math.min(1, d[0] * cx + d[1] * cy + d[2] * cz)));
      // a patch of this size spans at most about this angle from its centre
      const reach = size * 1.25;
      if (angle - reach > horizon) return;
      this.centre.set(d[0], d[1], d[2]);
      const dist = Math.max(0, this.centre.distanceTo(camera) - reach * 0.5);
      if (level < maxLevel && dist < size * split) {
        const h = size / 2;
        visit(face, x0, y0, h, level + 1);
        visit(face, x0 + h, y0, h, level + 1);
        visit(face, x0, y0 + h, h, level + 1);
        visit(face, x0 + h, y0 + h, h, level + 1);
        return;
      }
      if (level > this.deepest) this.deepest = level;
      this.patch.setXYZW(this.count++, x0, y0, size, face);
    };
    for (let face = 0; face < 6; face++) visit(face, 0, 0, 1, 0);
    this.mesh.count = this.count;
    this.patch.needsUpdate = true;
  }

  get patchCount(): number {
    return this.count;
  }
}
