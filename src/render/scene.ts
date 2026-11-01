// The Three.js layer: scene, lights, an orbit camera, a material. It takes
// finished buffers from the core and knows nothing of formulas. The model is
// z-up (the printing convention) — the group is turned y-up for display.
// Kept thin: vitest does not load it, the smoke checks it.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SurfaceMesh } from '../geo/surface';

export interface SceneHandle {
  /** several parts at once — the "exploded" preview of a split mold */
  setMeshes(meshes: readonly SurfaceMesh[]): void;
  /** the piece itself, before its tooling is ready */
  setPiece(mesh: SurfaceMesh): void;
  dispose(): void;
}

const CLEAR_COLOR = 0x17130f;
/** plaster-and-plastic grey for the tooling, terracotta for the piece itself */
const TOOLING_COLOR = 0xc9c2b8;
const PIECE_COLOR = 0xc98b62;

export function createScene(canvas: HTMLCanvasElement): SceneHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(CLEAR_COLOR);

  const scene = new THREE.Scene();
  // the model is in millimetres (a piece of 100–300 mm), hence near/far in mm
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 8000);
  // looking almost along the parting plane (the model's y): a handle on the
  // left, a spout on the right, both seen without turning
  camera.position.set(50, 120, 240);

  scene.add(new THREE.HemisphereLight(0xf0e2d4, 0x3a2e24, 0.9));
  const key = new THREE.DirectionalLight(0xfff4e8, 1.6);
  key.position.set(2, 3, 2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc0a894, 0.5);
  fill.position.set(-2, 1, -1.5);
  scene.add(fill);
  // a head lamp: fixed lights do not reach into a cavity
  const head = new THREE.DirectionalLight(0xfff4e8, 0.45);
  head.position.set(0, 0, 1);
  camera.add(head);
  scene.add(camera);

  // z-up (model) → y-up (screen)
  const group = new THREE.Group();
  group.rotation.x = -Math.PI / 2;
  scene.add(group);

  const materials = {
    tooling: new THREE.MeshStandardMaterial({ color: TOOLING_COLOR, metalness: 0.05, roughness: 0.6 }),
    piece: new THREE.MeshStandardMaterial({ color: PIECE_COLOR, metalness: 0.05, roughness: 0.55 }),
  };

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  const objects: THREE.Mesh[] = [];
  let disposed = false;
  /** the radius at the last camera fit — not to undo a zoom set by the mouse */
  let fittedRadius = 0;

  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  function frame(): void {
    if (disposed) return;
    resize();
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /** The distance from which the bounding sphere fits the frame. */
  function fitDistance(radius: number): number {
    const vFov = (camera.fov * Math.PI) / 180;
    const aspect = camera.aspect > 0 ? camera.aspect : 1;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    return (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.12;
  }

  function show(meshes: readonly SurfaceMesh[], material: THREE.Material): void {
    for (const obj of objects) {
      group.remove(obj);
      obj.geometry.dispose();
    }
    objects.length = 0;
    const bounds = new THREE.Box3();
    for (const mesh of meshes) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
      geometry.computeBoundingBox();
      if (geometry.boundingBox) bounds.union(geometry.boundingBox);
      const obj = new THREE.Mesh(geometry, material);
      group.add(obj);
      objects.push(obj);
    }
    if (bounds.isEmpty()) return;

    // the middle of the composition to the origin (in the core's z-up frame)
    const center = new THREE.Vector3();
    bounds.getCenter(center);
    for (const obj of objects) obj.position.set(-center.x, -center.y, -center.z);
    controls.target.set(0, 0, 0);

    const size = new THREE.Vector3();
    bounds.getSize(size);
    const radius = size.length() / 2;
    const distance = fitDistance(radius);
    camera.near = Math.max(0.1, distance / 500);
    camera.far = distance * 20;
    camera.updateProjectionMatrix();
    // a zoom set by the mouse stays while the composition keeps its size
    if (Math.abs(radius - fittedRadius) > fittedRadius * 0.08) {
      camera.position.setLength(distance);
      fittedRadius = radius;
    }
  }

  return {
    setMeshes(meshes) {
      show(meshes, materials.tooling);
    },
    setPiece(mesh) {
      show([mesh], materials.piece);
    },
    dispose() {
      disposed = true;
      controls.dispose();
      show([], materials.tooling);
      materials.tooling.dispose();
      materials.piece.dispose();
      renderer.dispose();
    },
  };
}
