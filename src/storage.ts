// Settings in localStorage: one versioned key per app, every field validated
// (state.ts), every access in try/catch.

import type { Settings } from './state';
import { defaultSettings, sanitizeSettings } from './state';

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const STORAGE_KEY = __APP_ID__;
const VERSION = 1;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Saved settings; unreadable data is replaced with defaults, field by field. */
export function loadSettings(storage: KeyValueStorage | null): Settings {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings();
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || data.version !== VERSION) return defaultSettings();
    return sanitizeSettings(data.settings);
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(storage: KeyValueStorage | null, settings: Settings): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, settings }));
  } catch {
    // Private mode or full storage: the app keeps working without saving.
  }
}

/** localStorage, or null when the browser blocks it. */
export function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
