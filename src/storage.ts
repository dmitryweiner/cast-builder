// What survives a reload, in localStorage: every field validated (state.ts),
// every access in try/catch. Two keys, each versioned: the settings with the
// setup of the model in hand, written on every change; and the model itself,
// written only when one is opened — a slider never encodes it again.
//
// All apps on <user>.github.io share one origin and its ~5 MB: a model that
// does not fit is not kept, and the one kept before goes with it, so a stale
// model never reopens under a fresh setup.

import type { IndexedMesh } from './geo/stl';
import { isValidMesh } from './geo/stl';
import type { Settings, Setup } from './state';
import { defaultSettings, defaultSetup, sanitizeSettings, sanitizeSetup } from './state';

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Why a write failed matters to the person: blocked keeps nothing ever, full is a model too large. */
export type StorageWrite = 'ok' | 'blocked' | 'full';

export const STORAGE_KEY = __APP_ID__;
export const MODEL_KEY = `${__APP_ID__}-model`;
/** 1 — the settings alone; 2 — with the setup of the model in hand */
const VERSION = 2;
const MODEL_VERSION = 1;

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
const fresh = (): Project => ({ settings: defaultSettings(), setup: defaultSetup() });

/** The saved project; unreadable data is replaced with defaults, field by field. */
export function loadProject(storage: KeyValueStorage | null): Project {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return fresh();
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || !isRecord(data.settings)) return fresh();
    // version 1 kept no setup: the settings stay, the setup starts anew
    if (data.version === 1) return { settings: sanitizeSettings(data.settings), setup: defaultSetup() };
    if (data.version !== VERSION) return fresh();
    return { settings: sanitizeSettings(data.settings), setup: sanitizeSetup(data.setup) };
  } catch {
    return fresh();
  }
}

export function saveProject(storage: KeyValueStorage | null, { settings, setup }: Project): StorageWrite {
  return write(storage, STORAGE_KEY, JSON.stringify({ version: VERSION, settings, setup }));
}

/** The model kept by the last visit; null for none or for anything but a whole mesh. */
export function loadSavedModel(storage: KeyValueStorage | null): SavedModel | null {
  try {
    const raw = storage?.getItem(MODEL_KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || data.version !== MODEL_VERSION || typeof data.name !== 'string') return null;
    if (typeof data.positions !== 'string' || typeof data.indices !== 'string') return null;
    const positions = fromBase64(data.positions);
    const indices = fromBase64(data.indices);
    if (positions.byteLength % 4 !== 0 || indices.byteLength % 4 !== 0) return null;
    const mesh = { positions: new Float32Array(positions.buffer), indices: new Uint32Array(indices.buffer) };
    return isValidMesh(mesh) ? { name: data.name, mesh } : null;
  } catch {
    return null;
  }
}

/** Keeps the model; when it does not fit, the one kept before is removed. */
export function saveModel(storage: KeyValueStorage | null, { name, mesh }: SavedModel): StorageWrite {
  const record = { version: MODEL_VERSION, name, positions: toBase64(mesh.positions), indices: toBase64(mesh.indices) };
  const result = write(storage, MODEL_KEY, JSON.stringify(record));
  if (result !== 'ok') {
    try {
      storage?.removeItem(MODEL_KEY);
    } catch {
      // blocked: nothing was kept to remove
    }
  }
  return result;
}

/** localStorage, or null when the browser blocks it. */
export function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function write(storage: KeyValueStorage | null, key: string, value: string): StorageWrite {
  if (!storage) return 'blocked';
  try {
    storage.setItem(key, value);
    return 'ok';
  } catch (error) {
    return isQuotaError(error) ? 'full' : 'blocked';
  }
}

/** The quota is spent. Firefox has a name of its own. */
function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
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
