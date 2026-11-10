// The tooling: a solid piece → master positive, plaster blocks, pour boxes
// for silicone. Imports the CSG: the worker's facade, never the main thread's
// (it takes `mold/analyze` and `mold/state` directly).

import type { Manifold } from 'manifold-3d';
import type { SurfaceMesh } from 'maker-kit/3d/mesh';
import type { CsgApi } from '../csg';
import { CsgScope, fromManifold } from '../csg';
import type { MoldReport } from './analyze';
import type { Mouth } from './block';
import { buildCavity, buildBlockParts } from './block';
import { buildBath } from './bath';
import type { MoldState } from './state';

export type { Mouth, PlugSpec } from './block';

/**
 * A part of the tooling. The interface names it by `id`: `bath-<part>` is the
 * pour box for a part, anything else the part itself (`part.<id>`).
 */
export interface MoldPartMesh {
  id: string;
  mesh: SurfaceMesh;
}

export interface MoldOptions {
  /** the mouth of the piece; without it the collar stands on the top of the mesh */
  mouth?: Mouth;
  /** called before each part: at export detail a part takes seconds, and the worker turns it into progress */
  onPart?: (index: number, total: number) => void;
}

/**
 * The master positive: the piece with the shrinkage plus the pouring collar.
 * A silicone mold is taken off it by hand in the classic way with a clay bed.
 *
 * For a recessed lid the plug's socket replaces the collar, and there are two
 * parts: the master of the piece and the plug itself — it is its own
 * positive: silicone is taken off it and a plaster plug is cast.
 */
export function buildMaster(csg: CsgApi, vessel: Manifold, report: MoldReport, mold: MoldState, options: MoldOptions = {}): MoldPartMesh[] {
  const scope = new CsgScope();
  try {
    const cavity = buildCavity(csg, scope, vessel, report.scheme, mold, options.mouth);
    // the cavity has a punch-through on top — only the block needs it; the master is cut at the collar's top
    const trimmed = scope.keep(cavity.solid.trimByPlane([0, 0, -1], -cavity.topZ));
    return [{ id: 'master', mesh: fromManifold(trimmed) }, ...(cavity.plug ? [{ id: 'plug', mesh: fromManifold(cavity.plug.solid) }] : [])];
  } finally {
    scope.dispose();
  }
}

/** Parts of the plaster mold in their assembled position. */
export function buildBlocks(csg: CsgApi, vessel: Manifold, report: MoldReport, mold: MoldState, options: MoldOptions = {}): MoldPartMesh[] {
  const scope = new CsgScope();
  try {
    const cavity = buildCavity(csg, scope, vessel, report.scheme, mold, options.mouth);
    return buildBlockParts(csg, scope, cavity, report.scheme, mold).map((part) => ({
      id: part.id,
      mesh: fromManifold(part.solid),
    }));
  } finally {
    scope.dispose();
  }
}

/** Printed pour boxes — one for each part of the plaster mold. */
export function buildBaths(csg: CsgApi, vessel: Manifold, report: MoldReport, mold: MoldState, options: MoldOptions = {}): MoldPartMesh[] {
  const scope = new CsgScope();
  try {
    const cavity = buildCavity(csg, scope, vessel, report.scheme, mold, options.mouth);
    const blocks = buildBlockParts(csg, scope, cavity, report.scheme, mold);
    return blocks.map((part, index) => {
      options.onPart?.(index, blocks.length);
      return { id: `bath-${part.id}`, mesh: fromManifold(buildBath(csg, scope, part, mold)) };
    });
  } finally {
    scope.dispose();
  }
}
