// The model thumbnail in the Model card: the piece as it stands now, seen
// from in front of the parting plane, so X runs left to right and "a handle
// or a spout along X" is what the user sees. No orbit controls and no
// animation loop: the model is turned by the buttons, and the picture is
// drawn once per change. A line along X on the floor marks where the mold
// parts. Kept thin like the scene: the smoke checks it.

import * as THREE from 'three';
import type { SurfaceMesh } from '../geo/surface';
import { addLights, CLEAR_COLOR, PARTING_COLOR, pieceMaterial, toGeometry } from './look';

export interface ThumbHandle {
  /** the piece to draw; null clears the picture */
  show(mesh: SurfaceMesh | null): void;
  dispose(): void;
}

/** How far the camera looks down, radians: the top of a cup shows, the side stays readable. */
const ELEVATION = (18 * Math.PI) / 180;
/** room around the piece, a share of its size */
const MARGIN = 0.08;
/** the parting line reaches this much further than the piece on each side, a share of its width */
const LINE_OVERHANG = 0.12;

export function createThumb(canvas: HTMLCanvasElement): ThumbHandle {
  // the picture is drawn once and must stay readable (the smoke reads its pixels)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(CLEAR_COLOR);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 10);
  addLights(scene, camera);

  // z-up (model) → y-up (screen); the model's −y faces the camera
  const group = new THREE.Group();
  group.rotation.x = -Math.PI / 2;
  scene.add(group);

  const material = pieceMaterial();
  const lineMaterial = new THREE.LineBasicMaterial({ color: PARTING_COLOR });
  let piece: THREE.Mesh | null = null;
  let line: THREE.Line | null = null;

  function clear(): void {
    if (piece) {
      group.remove(piece);
      piece.geometry.dispose();
    }
    if (line) {
      group.remove(line);
      line.geometry.dispose();
    }
    piece = null;
    line = null;
  }

  /** The camera framed on the piece: every vertex projected, the box of them fitted to the canvas. */
  function frame(w: number, h: number): void {
    if (!piece) return;
    const geometry = piece.geometry;
    geometry.computeBoundingSphere();
    const radius = geometry.boundingSphere?.radius ?? 1;
    camera.position.set(0, Math.sin(ELEVATION), Math.cos(ELEVATION)).multiplyScalar(radius * 4);
    camera.lookAt(0, 0, 0);
    camera.near = radius;
    camera.far = radius * 8;
    camera.updateMatrixWorld(true);
    group.updateMatrixWorld(true);

    const toView = new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse, piece.matrixWorld);
    const box = new THREE.Box2();
    const point = new THREE.Vector3();
    const flat = new THREE.Vector2();
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(toView);
      box.expandByPoint(flat.set(point.x, point.y));
    }
    const center = new THREE.Vector2();
    const size = new THREE.Vector2();
    box.getCenter(center);
    box.getSize(size);
    const aspect = w / h;
    const halfHeight = (Math.max(size.y, size.x / aspect) / 2) * (1 + MARGIN * 2);
    camera.left = center.x - halfHeight * aspect;
    camera.right = center.x + halfHeight * aspect;
    camera.top = center.y + halfHeight;
    camera.bottom = center.y - halfHeight;
    camera.updateProjectionMatrix();
  }

  function render(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    // hidden: drawn when shown and the observer reports a size
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    frame(w, h);
    renderer.render(scene, camera);
  }

  const observer = new ResizeObserver(render);
  observer.observe(canvas);

  return {
    show(mesh) {
      clear();
      if (mesh) {
        piece = new THREE.Mesh(toGeometry(mesh), material);
        piece.geometry.computeBoundingBox();
        const bounds = piece.geometry.boundingBox ?? new THREE.Box3();
        const center = new THREE.Vector3();
        bounds.getCenter(center);
        piece.position.set(-center.x, -center.y, -center.z);
        group.add(piece);
        // the parting plane is y = 0 through the axis, at the floor of the piece
        const overhang = (bounds.max.x - bounds.min.x) * LINE_OVERHANG;
        const floor = bounds.min.z - center.z;
        line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(bounds.min.x - center.x - overhang, -center.y, floor),
            new THREE.Vector3(bounds.max.x - center.x + overhang, -center.y, floor),
          ]),
          lineMaterial,
        );
        group.add(line);
      }
      render();
    },
    dispose() {
      observer.disconnect();
      clear();
      material.dispose();
      lineMaterial.dispose();
      renderer.dispose();
    },
  };
}
