// What the main view and the model thumbnail share: colours, lights and the
// way a mesh from the core becomes a Three.js geometry.

import * as THREE from 'three';
import type { SurfaceMesh } from '../geo/surface';

/** the page's background (`--bg` in style.css) */
export const CLEAR_COLOR = 0x1a1214;
/** plaster-and-plastic grey for the tooling, terracotta for the piece itself */
export const TOOLING_COLOR = 0xc9c2b8;
export const PIECE_COLOR = 0xc98b62;
/** the parting plane's trace in the thumbnail (`--accent-hi`) */
export const PARTING_COLOR = 0xc9566e;

/** Sky, key and fill lights, and a head lamp on the camera: fixed lights do not reach into a cavity. */
export function addLights(scene: THREE.Scene, camera: THREE.Camera): void {
  scene.add(new THREE.HemisphereLight(0xf0e2d4, 0x3a2e24, 0.9));
  const key = new THREE.DirectionalLight(0xfff4e8, 1.6);
  key.position.set(2, 3, 2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc0a894, 0.5);
  fill.position.set(-2, 1, -1.5);
  scene.add(fill);
  const head = new THREE.DirectionalLight(0xfff4e8, 0.45);
  head.position.set(0, 0, 1);
  camera.add(head);
  scene.add(camera);
}

export const toolingMaterial = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: TOOLING_COLOR, metalness: 0.05, roughness: 0.6 });
export const pieceMaterial = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: PIECE_COLOR, metalness: 0.05, roughness: 0.55 });

export function toGeometry(mesh: SurfaceMesh): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  return geometry;
}
