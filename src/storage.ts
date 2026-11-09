// What survives a reload, in localStorage: two records of maker-kit's
// core/storage, every field validated (state.ts). The settings with the
// setup of the model in hand, written on every change; and the model itself,
// written only when one is opened — a slider never encodes it again.
//
// All apps on <user>.github.io share one origin and its ~5 MB: a model that
// does not fit is not kept, and the one kept before goes with it, so a stale
// model never reopens under a fresh setup.

import { loadRecord, removeRecord, saveRecord, type KeyValueStorage, type StorageWrite, type StoredRecord } from 'maker-kit/core/storage';
import type { IndexedMesh } from './geo/stl';
import { isValidMesh } from './geo/stl';
import type { Settings, Setup } from './state';
import { defaultSettings, defaultSetup, sanitizeSettings, sanitizeSetup } from './state';

export { browserStorage, type KeyValueStorage, type StorageWrite } from 'maker-kit/core/storage';

export const STORAGE_KEY = __APP_ID__;
export const MODEL_KEY = `${__APP_ID__}-model`;

/** The settings and the setup of the model in hand. */
export interface Project {
  settings: Settings;
  setup: Setup;
}

export interface SavedModel {
  /** file name without the extension */
  name: string;
  mesh: IndexedMesh;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const PROJECT: StoredRecord<Project> = {
  key: STORAGE_KEY,
  // 1 — the settings alone; 2 — with the setup of the model in hand
  version: 2,
  write: ({ settings, setup }) => ({ settings, setup }),
  read(data, version) {
    if (!isRecord(data) || !isRecord(data.settings)) return null;
    // version 1 kept no setup: the settings stay, the setup starts anew
    if (version === 1) return { settings: sanitizeSettings(data.settings), setup: defaultSetup() };
    if (version !== 2) return null;
    return { settings: sanitizeSettings(data.settings), setup: sanitizeSetup(data.setup) };
  },
};

const MODEL: StoredRecord<SavedModel> = {
  key: MODEL_KEY,
  version: 1,
  write: ({ name, mesh }) => ({ name, positions: toBase64(mesh.positions), indices: toBase64(mesh.indices) }),
  read(data, version) {
    if (version !== 1 || !isRecord(data) || typeof data.name !== 'string') return null;
    if (typeof data.positions !== 'string' || typeof data.indices !== 'string') return null;
    const positions = fromBase64(data.positions);
    const indices = fromBase64(data.indices);
    if (positions.byteLength % 4 !== 0 || indices.byteLength % 4 !== 0) return null;
    const mesh = { positions: new Float32Array(positions.buffer), indices: new Uint32Array(indices.buffer) };
    return isValidMesh(mesh) ? { name: data.name, mesh } : null;
  },
};

/** The saved project; unreadable data is replaced with defaults, field by field. */
export function loadProject(storage: KeyValueStorage | null): Project {
  return loadRecord(storage, PROJECT) ?? { settings: defaultSettings(), setup: defaultSetup() };
}

export function saveProject(storage: KeyValueStorage | null, project: Project): StorageWrite {
  return saveRecord(storage, PROJECT, project);
}

/** The model kept by the last visit; null for none or for anything but a whole mesh. */
export function loadSavedModel(storage: KeyValueStorage | null): SavedModel | null {
  return loadRecord(storage, MODEL);
}

/** Keeps the model; when it does not fit, the one kept before is removed. */
export function saveModel(storage: KeyValueStorage | null, model: SavedModel): StorageWrite {
  const result = saveRecord(storage, MODEL, model);
  if (result !== 'ok') removeRecord(storage, MODEL);
  return result;
}

/** The bytes of a typed array as base64, in chunks: a spread of a whole mesh would overflow the stack. */
function toBase64(view: ArrayBufferView): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

/** Throws on text that is not base64. */
function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
