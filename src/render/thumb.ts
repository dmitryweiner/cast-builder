// The model thumbnail in the Model card: the piece as it stands now, seen
// from in front of the parting plane, so X runs left to right and "a handle
// or a spout along X" is what the user sees. No orbit controls and no
// animation loop: the model is turned by the buttons, and the picture is
// drawn once per change. The three axes are drawn in their colours, X —
// the trace of the parting plane — included, and labelled by HTML captions
// over the canvas. Kept thin like the scene: the smoke checks it.

import * as THREE from 'three';
import type { SurfaceMesh } from '../geo/surface';
import type { AxisGuide } from './guides';
import { thumbAxes } from './guides';
import { addLights, AXIS_COLORS, CLEAR_COLOR, pieceMaterial, toGeometry } from './look';

export interface ThumbHandle {
  /** the piece to draw; null clears the picture */
  show(mesh: SurfaceMesh | null): void;
  dispose(): void;
}

/** the captions of the axes, positioned over the canvas */
export type AxisLabels = Record<AxisGuide['name'], HTMLElement>;

/** How far the camera looks down, radians: the top of a cup shows, the side stays readable. */
const ELEVATION = (18 * Math.PI) / 180;
/**
 * How far the camera stands to the left of straight in front, radians.
 * Straight in front, Y would run into the picture along the line of Z; a
 * little to the side it leans left and X still runs left to right.
 */
const AZIMUTH = (20 * Math.PI) / 180;
/** an axis inside or behind the piece shows through it this faintly */
const HIDDEN_OPACITY = 0.3;
/** room round the picture for the captions, px */
const PAD_PX = 20;
/** the captions stand this far past the ends of the axes, px */
const LABEL_GAP_PX = 8;
/** the thickness of an axis on the screen, px */
const AXIS_PX = 1.6;

/** Drawn over everything, faint: the part of an axis the piece hides shows through it. */
function ghost(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: HIDDEN_OPACITY, depthTest: false, depthWrite: false });
}

export function createThumb(canvas: HTMLCanvasElement, labels: AxisLabels): ThumbHandle {
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
  // the model's own frame, its middle moved to the origin
  const holder = new THREE.Group();
  group.add(holder);

  const material = pieceMaterial();
  // an axis is a thin rod, not a line: a WebGL line is one device pixel, lost on a retina screen
  const rod = new THREE.CylinderGeometry(1, 1, 1, 8);
  const rodMaterials = {
    x: new THREE.MeshBasicMaterial({ color: AXIS_COLORS.x }),
    y: new THREE.MeshBasicMaterial({ color: AXIS_COLORS.y }),
    z: new THREE.MeshBasicMaterial({ color: AXIS_COLORS.z }),
  };
  const ghostMaterials = { x: ghost(AXIS_COLORS.x), y: ghost(AXIS_COLORS.y), z: ghost(AXIS_COLORS.z) };
  let piece: THREE.Mesh | null = null;
  let axes: { guide: AxisGuide; rod: THREE.Mesh }[] = [];

  function clear(): void {
    if (piece) {
      holder.remove(piece);
      piece.geometry.dispose();
    }
    for (const axis of axes) holder.remove(axis.rod);
    piece = null;
    axes = [];
    for (const label of Object.values(labels)) label.hidden = true;
  }

  /** The camera framed on the piece and the axes: every point projected, the box of them fitted to the canvas. */
  function frame(w: number, h: number): void {
    if (!piece) return;
    const geometry = piece.geometry;
    geometry.computeBoundingSphere();
    const radius = (geometry.boundingSphere?.radius ?? 1) * 2;
    // in the screen's frame: x the model's x, y its z, z its −y
    camera.position
      .set(-Math.sin(AZIMUTH) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(AZIMUTH) * Math.cos(ELEVATION))
      .multiplyScalar(radius * 4);
    camera.lookAt(0, 0, 0);
    camera.near = radius;
    camera.far = radius * 8;
    camera.updateMatrixWorld(true);
    group.updateMatrixWorld(true);

    const toView = new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse, holder.matrixWorld);
    const box = new THREE.Box2();
    const point = new THREE.Vector3();
    const flat = new THREE.Vector2();
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(toView);
      box.expandByPoint(flat.set(point.x, point.y));
    }
    for (const { guide } of axes) {
      for (const end of [guide.from, guide.to]) {
        point.set(...end).applyMatrix4(toView);
        box.expandByPoint(flat.set(point.x, point.y));
      }
    }
    const center = new THREE.Vector2();
    const size = new THREE.Vector2();
    box.getCenter(center);
    box.getSize(size);
    // half the view's height, mm: the box fits with PAD_PX to spare on every side
    const aspect = w / h;
    const pad = (2 * PAD_PX) / h;
    const halfHeight = Math.max(size.y / 2 / (1 - pad), size.x / 2 / (aspect - pad));
    camera.left = center.x - halfHeight * aspect;
    camera.right = center.x + halfHeight * aspect;
    camera.top = center.y + halfHeight;
    camera.bottom = center.y - halfHeight;
    camera.updateProjectionMatrix();

    // the rods as thick on the screen whatever the size of the piece
    const thickness = ((AXIS_PX / 2) * (2 * halfHeight)) / h;
    for (const axis of axes) axis.rod.scale.set(thickness, axis.rod.scale.y, thickness);
  }

  /** A point of the model's frame on the canvas, px from its top left corner. */
  function onCanvas(at: readonly number[], w: number, h: number): THREE.Vector2 {
    const ndc = new THREE.Vector3(at[0], at[1], at[2]).applyMatrix4(holder.matrixWorld).project(camera);
    return new THREE.Vector2(((ndc.x + 1) / 2) * w, ((1 - ndc.y) / 2) * h);
  }

  function placeLabels(w: number, h: number): void {
    for (const { guide } of axes) {
      const label = labels[guide.name];
      const from = onCanvas(guide.from, w, h);
      const to = onCanvas(guide.to, w, h);
      const away = to.clone().sub(from);
      if (away.lengthSq() > 0) away.normalize();
      const at = to.addScaledVector(away, LABEL_GAP_PX);
      label.style.left = `${at.x}px`;
      label.style.top = `${at.y}px`;
      label.hidden = false;
    }
  }

  function render(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    // hidden: drawn when shown and the observer reports a size
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    frame(w, h);
    renderer.render(scene, camera);
    placeLabels(w, h);
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
        holder.position.set(-center.x, -center.y, -center.z);
        holder.add(piece);
        const up = new THREE.Vector3(0, 1, 0);
        axes = thumbAxes(bounds.min.toArray(), bounds.max.toArray()).map((guide) => {
          const from = new THREE.Vector3(...guide.from);
          const along = new THREE.Vector3(...guide.to).sub(from);
          const axisRod = new THREE.Mesh(rod, rodMaterials[guide.name]);
          axisRod.position.copy(from).addScaledVector(along, 0.5);
          axisRod.scale.set(1, along.length(), 1);
          axisRod.quaternion.setFromUnitVectors(up, along.normalize());
          const hidden = new THREE.Mesh(rod, ghostMaterials[guide.name]);
          hidden.renderOrder = 1;
          axisRod.add(hidden);
          holder.add(axisRod);
          return { guide, rod: axisRod };
        });
      }
      render();
    },
    dispose() {
      observer.disconnect();
      clear();
      material.dispose();
      rod.dispose();
      for (const rodMaterial of [...Object.values(rodMaterials), ...Object.values(ghostMaterials)]) rodMaterial.dispose();
      renderer.dispose();
    },
  };
}
