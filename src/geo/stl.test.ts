// The STL reader is maker-kit's (3d/stl, tested there); here it reads the
// app's fixtures.
import { validateMesh } from 'maker-kit/3d/validate';
import { describe, expect, it } from 'vitest';
import { fixture, withNormals } from './testing';

describe('the fixtures', () => {
  it('read as closed solids', () => {
    for (const name of ['bowl', 'pot-handle', 'teapot', 'lid-upside-down', 'cup-hollow']) {
      const report = validateMesh(withNormals(fixture(name)));
      expect(report.watertight, name).toBe(true);
      expect(report.volume, name).toBeGreaterThan(0);
    }
  });
});
