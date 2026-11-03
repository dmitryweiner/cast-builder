import { describe, expect, it } from 'vitest';
import { defaultSettings, defaultSetup, sanitizeSettings, sanitizeSetup } from './state';
import { loadSettings, saveSettings, STORAGE_KEY, type KeyValueStorage } from './storage';

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

const broken: KeyValueStorage = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
};

describe('settings storage', () => {
  it('uses the package name as the key', () => {
    expect(STORAGE_KEY).toBe('cast-builder');
  });

  it('returns defaults when nothing is saved or storage is unavailable', () => {
    expect(loadSettings(new MemoryStorage())).toEqual(defaultSettings());
    expect(loadSettings(null)).toEqual(defaultSettings());
    expect(loadSettings(broken)).toEqual(defaultSettings());
  });

  it('saves and loads settings', () => {
    const storage = new MemoryStorage();
    const settings = { ...defaultSettings(), locale: 'ru' as const, mode: 'slump' as const, scheme: 'halves' as const, resolution: 256 };
    saveSettings(storage, settings);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it('ignores write errors', () => {
    expect(() => saveSettings(broken, defaultSettings())).not.toThrow();
    expect(() => saveSettings(null, defaultSettings())).not.toThrow();
  });

  it.each(['not json', '[]', '{"version":2,"settings":{"locale":"ru"}}', '{"version":1}'])('resets unreadable data: %s', (raw) => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, raw);
    expect(loadSettings(storage)).toEqual(defaultSettings());
  });

  it('replaces bad fields with defaults one by one', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, settings: { locale: 'xx', mode: 'slump', resolution: 7, mold: { shrinkPct: 99 } } }),
    );
    const settings = loadSettings(storage);
    expect(settings.locale).toBeNull();
    expect(settings.mode).toBe('slump');
    expect(settings.resolution).toBe(defaultSettings().resolution);
    expect(settings.mold.shrinkPct).toBe(30);
  });

  it('settings saved before the screw clamps load with them off and keep the rest', () => {
    const storage = new MemoryStorage();
    const before = { ...defaultSettings().mold, slabMm: 7 };
    const { screws: _screws, printScrews: _printScrews, ...old } = before;
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, settings: { mode: 'slump', mold: old } }));
    const settings = loadSettings(storage);
    expect(settings.mold).toEqual({ ...before, screws: false, printScrews: false });
  });
});

describe('sanitizers', () => {
  const junk = [null, undefined, 42, 'x', [], { mode: 'vessel' }, { mouth: { zMm: NaN, auto: 'yes' }, plug: { recessMm: -5 } }];

  it('never throw and are idempotent', () => {
    for (const raw of junk) {
      const settings = sanitizeSettings(raw);
      expect(sanitizeSettings(settings)).toEqual(settings);
      const setup = sanitizeSetup(raw);
      expect(sanitizeSetup(setup)).toEqual(setup);
    }
  });

  it('keep what is valid', () => {
    const setup = { ...defaultSetup(), mouth: { auto: false, zMm: 120, radiusMm: 40 }, plug: { on: true, recessMm: 8, galleryMm: 44 } };
    expect(sanitizeSetup(setup)).toEqual(setup);
    expect(sanitizeSetup({ plug: { recessMm: -5 } }).plug.recessMm).toBe(0);
  });
});
