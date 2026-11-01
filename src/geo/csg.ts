// The bridge between our meshes and manifold-3d (WASM CSG): cut the cavity
// out of a plaster block, split the block by the parting planes, build a
// pour box around each part, fill a hollow model.
//
// A WASM peculiarity: Manifold objects are not collected by the GC and must
// be deleted explicitly — that is what CsgScope is for. Only the worker
// imports this module; the main thread never loads the WASM.

import Module from 'manifold-3d';
import type { Manifold, Mesh, ManifoldToplevel } from 'manifold-3d';
import type { SurfaceMesh } from './surface';
import { meshNormals } from './normals';

/** All we need from the WASM module: constructors of primitives and Mesh. */
export type CsgApi = ManifoldToplevel;

let pending: Promise<CsgApi> | null = null;

/** Loads the WASM once per process or worker; later calls get the same promise. */
export function initCSG(): Promise<CsgApi> {
  if (!pending) {
    pending = Module().then((wasm) => {
      wasm.setup();
      return wasm;
    });
  }
  return pending;
}

/**
 * Collects Manifold/CrossSection objects and frees them at once. Any chain of
 * boolean operations breeds intermediate objects; without a scope the WASM
 * heap grows until it runs out on a few exports in a row.
 */
export class CsgScope {
  private items: { delete(): void }[] = [];

  /** Registers an object for deletion and returns it (handy inside expressions). */
  keep<T extends { delete(): void }>(item: T): T {
    this.items.push(item);
    return item;
  }

  get size(): number {
    return this.items.length;
  }

  dispose(): void {
    for (const item of this.items) item.delete();
    this.items = [];
  }
}

export interface ToManifoldOptions {
  /**
   * Merge vertices that are near each other on open edges. Our own meshes
   * are stitched by index arithmetic and do not need it; an imported STL may
   * have the same vertex written as two slightly different floats.
   */
  merge?: boolean;
}

/**
 * Mesh → Manifold. Throws if the mesh is not a closed solid: Manifold would
 * return an object with a NotManifold status that silently spoils every
 * later operation — better to fail here.
 */
export function toManifold(
  csg: CsgApi,
  mesh: { positions: Float32Array; indices: Uint32Array },
  options: ToManifoldOptions = {},
): Manifold {
  const input = new csg.Mesh({
    numProp: 3,
    vertProperties: new Float32Array(mesh.positions),
    triVerts: new Uint32Array(mesh.indices),
  });
  if (options.merge) input.merge();
  // ofMesh throws a bare "Not manifold" without saying whose mesh it is; on
  // NonFiniteVertex and the like it returns an object with a status instead.
  // Both cases become one message with context.
  let solid: Manifold;
  try {
    solid = csg.Manifold.ofMesh(input);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`toManifold: mesh is not a closed solid (${reason})`, { cause });
  }
  const status = solid.status();
  if (status !== 'NoError') {
    solid.delete();
    throw new Error(`toManifold: mesh is not a closed solid (${status})`);
  }
  return solid;
}

/** Manifold → mesh with recomputed vertex normals. */
export function fromManifold(solid: Manifold): SurfaceMesh {
  const mesh: Mesh = solid.getMesh();
  const positions = extractPositions(mesh);
  const indices = new Uint32Array(mesh.triVerts);
  return { positions, indices, normals: meshNormals(positions, indices) };
}

/**
 * The first three properties of every vertex are x, y, z. Manifold may return
 * numProp > 3, so positions are picked out of the interleaved buffer.
 */
function extractPositions(mesh: Mesh): Float32Array {
  const { numProp, vertProperties } = mesh;
  if (numProp === 3) return new Float32Array(vertProperties);
  const count = vertProperties.length / numProp;
  const positions = new Float32Array(count * 3);
  for (let v = 0; v < count; v++) {
    positions[v * 3] = vertProperties[v * numProp];
    positions[v * 3 + 1] = vertProperties[v * numProp + 1];
    positions[v * 3 + 2] = vertProperties[v * numProp + 2];
  }
  return positions;
}
